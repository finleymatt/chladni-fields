import UIKit
import WebKit
import Capacitor

/// The app's web view controller. Adds the things the stock bridge leaves off:
/// the edge-swipe back gesture (pages reached by links behave like pushed screens),
/// edge-to-edge content with no automatic insets (the page handles safe areas itself),
/// and the app's own StoreKit plugin.
class ChladniViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PurchasesPlugin())
        webView?.allowsBackForwardNavigationGestures = true
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
        webView?.scrollView.bounces = true
        webView?.backgroundColor = UIColor(red: 0.051, green: 0.071, blue: 0.055, alpha: 1)
        webView?.isOpaque = false
    }
}
