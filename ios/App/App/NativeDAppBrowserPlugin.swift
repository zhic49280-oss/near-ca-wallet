import Foundation
import Capacitor
import WebKit
import UIKit

private class WeakScriptMessageTrampoline: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

@objc(NativeDAppBrowserPlugin)
public class NativeDAppBrowserPlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    public let identifier = "NativeDAppBrowserPlugin"
    public let jsName = "NativeDAppBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendResponse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "emitProviderEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOverlayVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]

    private var overlayView: UIView?
    private var dappWebView: WKWebView?
    private var urlLabel: UILabel?
    private var backBtn: UIButton?
    private var forwardBtn: UIButton?

    private func isAllowedDAppUrl(_ url: URL?) -> Bool {
        guard let url = url, let scheme = url.scheme?.lowercased(), let host = url.host?.lowercased() else {
            return false
        }
        if scheme == "https" {
            return !host.isEmpty
        }
        if scheme == "http" && (host == "localhost" || host == "127.0.0.1") {
            return true
        }
        return false
    }

    private func jsStringLiteral(_ value: String?) -> String {
        guard let value = value else { return "null" }
        if let data = try? JSONSerialization.data(withJSONObject: [value], options: []),
           let arrStr = String(data: data, encoding: .utf8),
           arrStr.count >= 2 {
            let start = arrStr.index(after: arrStr.startIndex)
            let end = arrStr.index(before: arrStr.endIndex)
            return String(arrStr[start..<end])
        }
        return "null"
    }

    @objc func openUrl(_ call: CAPPluginCall) {
        guard let rawUrl = call.getString("url"),
              let targetUrl = URL(string: rawUrl),
              isAllowedDAppUrl(targetUrl) else {
            call.reject("Invalid or disallowed DApp URL")
            return
        }
        let script = call.getString("injectedScript") ?? ""

        DispatchQueue.main.async {
            self.teardownOverlayOnly()
            guard let hostView = self.bridge?.viewController?.view else {
                call.reject("Host view unavailable")
                return
            }

            let container = UIView()
            container.translatesAutoresizingMaskIntoConstraints = false
            container.backgroundColor = UIColor(red: 0.024, green: 0.031, blue: 0.059, alpha: 1.0)

            let topBar = UIView()
            topBar.translatesAutoresizingMaskIntoConstraints = false
            topBar.backgroundColor = UIColor(red: 0.043, green: 0.067, blue: 0.125, alpha: 0.98)

            let backButton = self.makeToolbarButton(title: "‹", selector: #selector(self.onBackTapped))
            let fwdButton = self.makeToolbarButton(title: "›", selector: #selector(self.onForwardTapped))
            let reloadButton = self.makeToolbarButton(title: "↻", selector: #selector(self.onReloadTapped))
            let closeButton = self.makeToolbarButton(title: "✕", selector: #selector(self.onCloseTapped))

            let titleLbl = UILabel()
            titleLbl.translatesAutoresizingMaskIntoConstraints = false
            titleLbl.text = targetUrl.host ?? rawUrl
            titleLbl.textColor = .white
            titleLbl.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .semibold)
            titleLbl.lineBreakMode = .byTruncatingMiddle
            titleLbl.textAlignment = .center

            topBar.addSubview(backButton)
            topBar.addSubview(fwdButton)
            topBar.addSubview(titleLbl)
            topBar.addSubview(reloadButton)
            topBar.addSubview(closeButton)

            let ucc = WKUserContentController()
            if !script.isEmpty {
                let userScript = WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false)
                ucc.addUserScript(userScript)
            }
            ucc.add(WeakScriptMessageTrampoline(self), name: "nexusBridge")

            let config = WKWebViewConfiguration()
            config.userContentController = ucc
            config.allowsInlineMediaPlayback = true

            let webView = WKWebView(frame: .zero, configuration: config)
            webView.translatesAutoresizingMaskIntoConstraints = false
            webView.navigationDelegate = self
            webView.uiDelegate = self
            webView.backgroundColor = UIColor(red: 0.024, green: 0.031, blue: 0.059, alpha: 1.0)
            webView.isOpaque = false

            container.addSubview(topBar)
            container.addSubview(webView)
            hostView.addSubview(container)

            NSLayoutConstraint.activate([
                container.topAnchor.constraint(equalTo: hostView.topAnchor),
                container.leadingAnchor.constraint(equalTo: hostView.leadingAnchor),
                container.trailingAnchor.constraint(equalTo: hostView.trailingAnchor),
                container.bottomAnchor.constraint(equalTo: hostView.bottomAnchor),

                topBar.topAnchor.constraint(equalTo: hostView.safeAreaLayoutGuide.topAnchor),
                topBar.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                topBar.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                topBar.heightAnchor.constraint(equalToConstant: 46),

                backButton.leadingAnchor.constraint(equalTo: topBar.leadingAnchor, constant: 8),
                backButton.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),
                backButton.widthAnchor.constraint(equalToConstant: 34),
                backButton.heightAnchor.constraint(equalToConstant: 34),

                fwdButton.leadingAnchor.constraint(equalTo: backButton.trailingAnchor, constant: 4),
                fwdButton.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),
                fwdButton.widthAnchor.constraint(equalToConstant: 34),
                fwdButton.heightAnchor.constraint(equalToConstant: 34),

                closeButton.trailingAnchor.constraint(equalTo: topBar.trailingAnchor, constant: -8),
                closeButton.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),
                closeButton.widthAnchor.constraint(equalToConstant: 34),
                closeButton.heightAnchor.constraint(equalToConstant: 34),

                reloadButton.trailingAnchor.constraint(equalTo: closeButton.leadingAnchor, constant: -4),
                reloadButton.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),
                reloadButton.widthAnchor.constraint(equalToConstant: 34),
                reloadButton.heightAnchor.constraint(equalToConstant: 34),

                titleLbl.leadingAnchor.constraint(equalTo: fwdButton.trailingAnchor, constant: 8),
                titleLbl.trailingAnchor.constraint(equalTo: reloadButton.leadingAnchor, constant: -8),
                titleLbl.centerYAnchor.constraint(equalTo: topBar.centerYAnchor),

                webView.topAnchor.constraint(equalTo: topBar.bottomAnchor),
                webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
                webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
                webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
            ])

            self.overlayView = container
            self.dappWebView = webView
            self.urlLabel = titleLbl
            self.backBtn = backButton
            self.forwardBtn = fwdButton

            webView.load(URLRequest(url: targetUrl))
            call.resolve(["opened": true])
        }
    }

    private func makeToolbarButton(title: String, selector: Selector) -> UIButton {
        let btn = UIButton(type: .system)
        btn.translatesAutoresizingMaskIntoConstraints = false
        btn.setTitle(title, for: .normal)
        btn.setTitleColor(.white, for: .normal)
        btn.titleLabel?.font = UIFont.systemFont(ofSize: 18, weight: .semibold)
        btn.backgroundColor = UIColor(white: 1.0, alpha: 0.08)
        btn.layer.cornerRadius = 8
        btn.addTarget(self, action: selector, for: .touchUpInside)
        return btn
    }

    @objc private func onBackTapped() {
        if dappWebView?.canGoBack == true { dappWebView?.goBack() }
    }

    @objc private func onForwardTapped() {
        if dappWebView?.canGoForward == true { dappWebView?.goForward() }
    }

    @objc private func onReloadTapped() {
        dappWebView?.reload()
    }

    @objc private func onCloseTapped() {
        DispatchQueue.main.async {
            self.teardownOverlayOnly()
            self.notifyListeners("browserClosed", data: [:])
        }
    }

    private func teardownOverlayOnly() {
        dappWebView?.configuration.userContentController.removeScriptMessageHandler(forName: "nexusBridge")
        dappWebView?.stopLoading()
        dappWebView?.navigationDelegate = nil
        dappWebView?.uiDelegate = nil
        overlayView?.removeFromSuperview()
        dappWebView = nil
        overlayView = nil
        urlLabel = nil
        backBtn = nil
        forwardBtn = nil
    }

    @objc func sendResponse(_ call: CAPPluginCall) {
        let reqId = call.getString("id") ?? ""
        let resJson = call.getString("resultJson")
        let errJson = call.getString("errorJson")
        let js = "window.__nexusOnBridgeResponse && window.__nexusOnBridgeResponse(\(jsStringLiteral(reqId)), \(jsStringLiteral(resJson)), \(jsStringLiteral(errJson)));"
        DispatchQueue.main.async {
            self.dappWebView?.evaluateJavaScript(js, completionHandler: nil)
            call.resolve()
        }
    }

    @objc func emitProviderEvent(_ call: CAPPluginCall) {
        let ns = call.getString("namespace") ?? "evm"
        let ev = call.getString("eventName") ?? ""
        let payload = call.getString("payload")
        let js = "window.__nexusOnProviderEvent && window.__nexusOnProviderEvent(\(jsStringLiteral(ns)), \(jsStringLiteral(ev)), \(jsStringLiteral(payload)));"
        DispatchQueue.main.async {
            self.dappWebView?.evaluateJavaScript(js, completionHandler: nil)
            call.resolve()
        }
    }

    @objc func setOverlayVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.overlayView?.isHidden = !visible
            call.resolve(["visible": visible])
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardownOverlayOnly()
            self.notifyListeners("browserClosed", data: [:])
            call.resolve()
        }
    }

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "nexusBridge",
              isAllowedDAppUrl(dappWebView?.url),
              let body = message.body as? String else {
            return
        }
        notifyListeners("bridgeMessage", data: ["payload": body])
    }

    public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil,
           let url = navigationAction.request.url,
           isAllowedDAppUrl(url) {
            webView.load(navigationAction.request)
        }
        return nil
    }

    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if isAllowedDAppUrl(navigationAction.request.url) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    public func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        syncNavigationChrome(webView)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        syncNavigationChrome(webView)
    }

    private func syncNavigationChrome(_ webView: WKWebView) {
        let currentUrl = webView.url?.absoluteString ?? ""
        urlLabel?.text = webView.url?.host ?? currentUrl
        backBtn?.alpha = webView.canGoBack ? 1.0 : 0.4
        forwardBtn?.alpha = webView.canGoForward ? 1.0 : 0.4
        notifyListeners("pageChanged", data: [
            "url": currentUrl,
            "title": webView.title ?? ""
        ])
    }
}
