import Cocoa
import os
import SafariServices
import WebKit

private let extensionBundleIdentifier = "com.bingowon.tabwrangler.Extension"
private let viewLogger = Logger(subsystem: "com.bingowon.tabwrangler", category: "ViewController")

final class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        viewLogger.info("Loading Safari extension status page")
        webView.navigationDelegate = self
        webView.configuration.userContentController.add(self, name: "controller")

        guard
            let htmlURL = Bundle.main.url(forResource: "Main", withExtension: "html"),
            let resourceURL = Bundle.main.resourceURL
        else {
            viewLogger.error("Could not find bundled Main.html or resource URL")
            return
        }

        webView.loadFileURL(htmlURL, allowingReadAccessTo: resourceURL)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        viewLogger.info("Status page loaded; querying Safari extension state")
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, error in
            guard let state = state, error == nil else {
                viewLogger.error("Could not read Safari extension state: \(error?.localizedDescription ?? "unknown error", privacy: .public)")
                return
            }

            viewLogger.info("Safari extension state loaded: enabled=\(state.isEnabled, privacy: .public)")
            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    webView.evaluateJavaScript("show(\(state.isEnabled), true)")
                } else {
                    webView.evaluateJavaScript("show(\(state.isEnabled), false)")
                }
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.body as? String == "open-settings" else { return }

        viewLogger.info("Opening Safari extension settings")
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            if let error {
                viewLogger.error("Could not open Safari extension settings: \(error.localizedDescription, privacy: .public)")
            }

            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
        }
    }
}
