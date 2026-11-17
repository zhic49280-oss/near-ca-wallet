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
        let bioContext = LAContext()
        bioContext.localizedFallbackTitle = "使用锁屏密码 / Use Passcode"

        var bioError: NSError?
        if bioContext.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &bioError) {
            let detectedType = resolveBiometryTypeString(bioContext.biometryType)
            bioContext.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, evalError in
                if success {
                    DispatchQueue.main.async {
                        call.resolve([
                            "authenticated": true,
                            "type": detectedType
                        ])
                    }
                    return
                }

                let nsErr = evalError as NSError?
                if nsErr?.code == LAError.userFallback.rawValue || nsErr?.code == LAError.biometryLockout.rawValue {
                    self.evaluateSystemPasscodeFallback(reason: reason, call: call)
                } else {
                    DispatchQueue.main.async {
                        call.reject(nsErr?.localizedDescription ?? "Biometric authentication failed", "AUTH_FAILED")
                    }
                }
            }
            return
        }

        // Fall back directly to Apple iOS system passcode when biometrics is unavailable or not enrolled
        evaluateSystemPasscodeFallback(reason: reason, call: call)
    }

    private func evaluateSystemPasscodeFallback(reason: String, call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            DispatchQueue.main.async {
                call.reject(error?.localizedDescription ?? "Device authentication unavailable", "AUTH_UNAVAILABLE")
            }
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, evalError in
            DispatchQueue.main.async {
                if success {
                    call.resolve([
                        "authenticated": true,
                        "type": "passcode"
                    ])
                } else {
                    call.reject(evalError?.localizedDescription ?? "Passcode authentication cancelled", "AUTH_CANCELLED")
                }
            }
        }
    }
}
