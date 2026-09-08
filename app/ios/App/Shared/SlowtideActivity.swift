import Foundation
import ActivityKit
import AppIntents

/// What the Live Activity shows, shared by the app (which starts and updates it) and the widget extension
/// (which draws it in the Dynamic Island and on the Lock Screen).
@available(iOS 16.1, *)
struct SlowtideAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var title: String       // "rain · 174 Hz", or "Sprint 2 · work"
        var subtitle: String    // "Resonance Room", "fades in 28 min", the sounds under a sprint
        var phase: String       // "" | "work" | "rest"
        var ends: Date?         // when the current sprint phase ends; drives the countdown
        var playing: Bool
    }
    var kind: String
}

/// The pause button on the activity. Runs inside the app's process, so it can reach the audio.
@available(iOS 17.0, *)
struct SlowtidePauseIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause Slowtide"
    static var description = IntentDescription("Fades the room out.")
    static var openAppWhenRun: Bool = false
    init() {}
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: Notification.Name("SlowtidePause"), object: nil)
        return .result()
    }
}
