import Cocoa
import os

private let appLogger = Logger(subsystem: "com.bingowon.tabwrangler", category: "App")

@main
final class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        appLogger.info("Tab Wrangler Safari app launched")
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}
