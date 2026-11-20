import Foundation
import Capacitor
import LocalAuthentication
import UIKit

/**
 * Native iOS LocalAuthentication bridge supporting Face ID, Touch ID, Optic ID, and iOS System Passcode.
 * Works natively in self-signed IPAs (AltStore, SideStore, TrollStore, Sideloadly, free Xcode signing)
 * without requiring paid Apple Developer entitlements.
 */
@objc(NativeSecurityPlugin)
public class NativeSecurityPlugin: CAPPlugin, CAPBridgedPlugin {
    public static var isAuthenticating: Bool = false
    public let identifier = "NativeSecurityPlugin"
    public let jsName = "NativeSecurity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSecurityCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticateWithBiometrics", returnType: CAPPluginReturnPromise)
    ]

    private func resolveBiometryTypeString(_ type: LABiometryType) -> String {
        if #available(iOS 17.0, *), type == .opticID {
            return "opticID"
        }
        switch type {
        case .faceID:
            return "faceID"
        case .touchID:
            return "touchID"
        default:
            return "none"
        }
    }

    @objc func getSecurityCapabilities(_ call: CAPPluginCall) {
        let context = LAContext()
        var bioError: NSError?
        let bioAvailable = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &bioError)

        let passcodeContext = LAContext()
        var passcodeError: NSError?
        let passcodeAvailable = passcodeContext.canEvaluatePolicy(.deviceOwnerAuthentication, error: &passcodeError)

        var biometryTypeStr = bioAvailable ? resolveBiometryTypeString(context.biometryType) : "none"
        if biometryTypeStr == "none" && passcodeAvailable {
            biometryTypeStr = "passcode"
        }

        DispatchQueue.main.async {
            let device = UIDevice.current
            call.resolve([
                "platform": "ios",
                "deviceModel": device.model,
                "systemName": device.systemName,
                "systemVersion": device.systemVersion,
                "biometryType": biometryTypeStr,
                "supportsBiometrics": bioAvailable,
                "supportsPasscode": passcodeAvailable
            ])
        }
    }

    @objc func authenticateWithBiometrics(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Verify identity to authorize Nexus Wallet action"
        let context = LAContext()
        if let fallbackTitle = call.getString("fallbackTitle") {
            context.localizedFallbackTitle = fallbackTitle
        } else {
            context.localizedFallbackTitle = "Use Passcode"
        }

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            DispatchQueue.main.async {
                NativeSecurityPlugin.isAuthenticating = false
                call.reject(error?.localizedDescription ?? "Device authentication unavailable", "AUTH_UNAVAILABLE")
            }
            return
        }
        var bioErr: NSError?
        let bioCapable = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &bioErr)
        let rawType = resolveBiometryTypeString(context.biometryType)
        let detectedType = (bioCapable && rawType != "none") ? rawType : "passcode"

        NativeSecurityPlugin.isAuthenticating = true
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
            DispatchQueue.main.async {
                NativeSecurityPlugin.isAuthenticating = false
                if success {
                    call.resolve(["authenticated": true, "type": detectedType])
                } else {
                    let code = (evalError as NSError?)?.code
                    let cancelled = code == LAError.userCancel.rawValue || code == LAError.systemCancel.rawValue || code == LAError.appCancel.rawValue
                    let unavailable = code == LAError.passcodeNotSet.rawValue || code == LAError.biometryNotAvailable.rawValue || code == LAError.biometryNotEnrolled.rawValue
                    let errCode = cancelled ? "AUTH_CANCELLED" : (unavailable ? "AUTH_UNAVAILABLE" : "AUTH_FAILED")
                    call.reject(evalError?.localizedDescription ?? "Authentication failed", errCode)
                }
            }
        }
    }
}