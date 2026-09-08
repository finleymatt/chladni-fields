import Foundation
import Capacitor
import WidgetKit

/// Hands the home-screen widgets what they show: the presets and the saved mixes, as JSON in the shared
/// app-group container, then asks WidgetKit to redraw.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]
    static let group = "group.lol.iamra.chladni"

    @objc func update(_ call: CAPPluginCall) {
        let items = call.getArray("items") ?? []
        guard let data = try? JSONSerialization.data(withJSONObject: items) else { call.reject("items must be JSON"); return }
        guard let defaults = UserDefaults(suiteName: Self.group) else { call.reject("app group unavailable"); return }
        defaults.set(data, forKey: "widgetItems")
        defaults.set(Date().timeIntervalSince1970, forKey: "widgetItemsAt")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve(["count": items.count])
    }
}
