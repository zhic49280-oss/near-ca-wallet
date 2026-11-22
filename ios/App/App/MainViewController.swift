import UIKit
import Capacitor

/// Capacitor 6 does not auto-register app-local plugins; register NativeSecurity explicitly
/// so window.Capacitor.Plugins.NativeSecurity (Face ID / Touch ID) exists in the WebView.
/// Also provides instant native UIVisualEffectView privacy blur on background / app-switcher transitions.
class MainViewController: CAPBridgeViewController {
    private var privacyBlurView: UIVisualEffectView?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeSecurityPlugin())
    bridge?.registerPluginInstance(NativeDAppBrowserPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleWillResignActive),
            name: UIApplication.willResignActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleWillResignActive),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleWillResignActive() {
        if NativeSecurityPlugin.isAuthenticating {
            return
        }
        showPrivacyBlur()
    }

    @objc private func handleDidBecomeActive() {
        hidePrivacyBlur()
    }

    private func showPrivacyBlur() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.privacyBlurView != nil { return }
            guard let hostView = self.view.window ?? self.view else { return }

            let blurEffect = UIBlurEffect(style: .systemUltraThinMaterialDark)
            let blurView = UIVisualEffectView(effect: blurEffect)
            blurView.frame = hostView.bounds
            blurView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            blurView.tag = 9001

            let badge = UILabel()
            badge.text = "NEXUS WALLET"
            badge.font = UIFont.systemFont(ofSize: 13, weight: .bold)
            badge.textColor = UIColor(red: 0.0, green: 0.925, blue: 0.592, alpha: 0.9)
            badge.translatesAutoresizingMaskIntoConstraints = false
            blurView.contentView.addSubview(badge)
            NSLayoutConstraint.activate([
                badge.centerXAnchor.constraint(equalTo: blurView.contentView.centerXAnchor),
                badge.centerYAnchor.constraint(equalTo: blurView.contentView.centerYAnchor)
            ])

            hostView.addSubview(blurView)
            self.privacyBlurView = blurView
        }
    }

    private func hidePrivacyBlur() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let blurView = self.privacyBlurView else { return }
            UIView.animate(withDuration: 0.16, animations: {
                blurView.alpha = 0
            }, completion: { _ in
                blurView.removeFromSuperview()
            })
            self.privacyBlurView = nil
        }
    }
}
