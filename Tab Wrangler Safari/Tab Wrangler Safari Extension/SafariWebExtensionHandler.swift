import SafariServices
import os

private let extensionLogger = Logger(subsystem: "com.bingowon.tabwrangler", category: "NativeHandler")

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        extensionLogger.info("Native extension handler received a request")
        context.completeRequest(returningItems: [], completionHandler: nil)
    }
}
