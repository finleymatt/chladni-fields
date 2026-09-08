import Foundation
import Capacitor
import ActivityKit

/// The room's Live Activity: started and updated by the page while it plays, ended when it stops. The pause
/// button on the activity posts SlowtidePause (see SlowtideActivity.swift); this plugin passes it on to the
/// page as a "pause" event, and the sleep-mode player listens for it too.
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise)
    ]
    private var observing = false

    public override func load() { observe() }
    private func observe() {
        if observing { return }
        observing = true
        NotificationCenter.default.addObserver(self, selector: #selector(pauseRequested), name: Notification.Name("SlowtidePause"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(playbackEnded), name: Notification.Name("SlowtideEnded"), object: nil)
    }
    deinit { NotificationCenter.default.removeObserver(self) }

    @available(iOS 16.2, *)
    private func state(from call: CAPPluginCall) -> SlowtideAttributes.ContentState {
        let endsMs = call.getDouble("ends") ?? 0
        return SlowtideAttributes.ContentState(
            title: call.getString("title") ?? "Slowtide",
            subtitle: call.getString("subtitle") ?? "Resonance Room",
            phase: call.getString("phase") ?? "",
            ends: endsMs > 0 ? Date(timeIntervalSince1970: endsMs / 1000) : nil,
            playing: call.getBool("playing") ?? true)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) { call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled]) } else { call.resolve(["available": false]) }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["started": false]); return }
        let st = state(from: call)
        Task { @MainActor in
            if let current = Activity<SlowtideAttributes>.activities.first {
                await current.update(ActivityContent(state: st, staleDate: nil))
                call.resolve(["started": true, "id": current.id]); return
            }
            do {
                let a = try Activity<SlowtideAttributes>.request(attributes: SlowtideAttributes(kind: "room"), content: ActivityContent(state: st, staleDate: nil), pushType: nil)
                call.resolve(["started": true, "id": a.id])
            } catch {
                call.reject("could not start: \(error.localizedDescription)")
            }
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let st = state(from: call)
        Task { @MainActor in
            for a in Activity<SlowtideAttributes>.activities { await a.update(ActivityContent(state: st, staleDate: nil)) }
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Task { @MainActor in
            await Self.endAll()
            call.resolve()
        }
    }

    @available(iOS 16.2, *)
    @MainActor static func endAll() async {
        for a in Activity<SlowtideAttributes>.activities {
            var st = a.content.state; st.playing = false
            await a.end(ActivityContent(state: st, staleDate: nil), dismissalPolicy: .immediate)
        }
    }

    @objc private func pauseRequested() {
        notifyListeners("pause", data: [:])
        if #available(iOS 16.2, *) { Task { @MainActor in await Self.endAll() } }
    }

    @objc private func playbackEnded() {
        if #available(iOS 16.2, *) { Task { @MainActor in await Self.endAll() } }
    }
}
