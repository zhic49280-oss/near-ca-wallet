import UIKit
import Capacitor

/// Capacitor 6 does not auto-register app-local plugins; register NativeSecurity explicitly
/// so window.Capacitor.Plugins.NativeSecurity (Face ID / Touch ID) exists in the WebView.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeSecurityPlugin())
    }
}
