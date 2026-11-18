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

        var biometryTypeStr = resolveBiometryTypeString(context.biometryType)
        if !bioAvailable && biometryTypeStr == "none" && passcodeAvailable {
            biometryTypeStr = "passcode"
        }

        call.resolve([
            "platform": "ios",
            "deviceModel": UIDevice.current.model,
            "systemName": UIDevice.current.systemName,
            "systemVersion": UIDevice.current.systemVersion,
            "biometryType": biometryTypeStr,
            "supportsBiometrics": bioAvailable,
            "supportsPasscode": passcodeAvailable
        ])
    }

    @objc func authenticateWithBiometrics(_ call: CAPPluginCall) {
        let reason = call.getString("reason") ?? "Verify identity to authorize NEAR CA Wallet action"
        let context = LAContext()
        context.localizedFallbackTitle = "使用锁屏密码 / Use Passcode"

        // .deviceOwnerAuthentication = Face ID / Touch ID first, automatically falling back to the iPhone unlock passcode.
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            DispatchQueue.main.async {
                call.reject(error?.localizedDescription ?? "Device authentication unavailable", "AUTH_UNAVAILABLE")
            }
            return
        }
        let detectedType = resolveBiometryTypeString(context.biometryType)
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["authenticated": true, "type": detectedType])
                } else {
                    let code = (evalError as NSError?)?.code
                    let cancelled = code == LAError.userCancel.rawValue || code == LAError.systemCancel.rawValue || code == LAError.appCancel.rawValue
                    call.reject(evalError?.localizedDescription ?? "Authentication failed", cancelled ? "AUTH_CANCELLED" : "AUTH_FAILED")
                }
            }
        }
    }
}