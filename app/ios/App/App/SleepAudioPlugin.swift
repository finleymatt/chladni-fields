import Foundation
import AVFoundation
import MediaPlayer
import UIKit
import Capacitor

/// Sleep mode. The web engine renders the current mix to a looping WAV and *arms* it here while the app is
/// in the foreground. When the app goes to the background (screen lock, Home), this class starts the file in
/// AVAudioPlayer on its own, without depending on the web view still running; when the app returns, it fades
/// the player out and the page reads what happened from `state`. Carries lock-screen Now Playing info, honours
/// pause/stop from the lock screen, an end time (the room's timer) and a hard cap (the free trial).
@objc(SleepAudioPlugin)
public class SleepAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SleepAudioPlugin"
    public let jsName = "SleepAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "arm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise)
    ]

    private struct Armed {
        var path: String; var title: String; var subtitle: String; var volume: Float
        var endsAt: Double   // epoch seconds when the room's timer ends; 0 = never
        var maxSeconds: Double; var trial: Bool
    }
    private var armed: Armed?
    private var player: AVAudioPlayer?
    private var stoppedBy = ""
    private var startedAt: Date?
    private var stopWork: DispatchWorkItem?
    private var fadeTimer: Timer?
    private var commandsWired = false
    private var observing = false
    /// what the last background run did, for the page to read when it comes back
    private var lastRun: [String: Any] = [:]
    private var log: [String] = []

    public override func load() { observe(); note("plugin loaded") }
    private func observe() {
        if observing { return }
        observing = true
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(wentBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(cameForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(pauseFromActivity), name: Notification.Name("SlowtidePause"), object: nil)
    }
    @objc private func pauseFromActivity() { if player != nil { note("paused from the Live Activity"); finish(by: "remote", fade: 1.2) } }

    deinit { NotificationCenter.default.removeObserver(self) }

    private func note(_ s: String) {
        let f = DateFormatter(); f.dateFormat = "HH:mm:ss"
        log.append(f.string(from: Date()) + " " + s)
        if log.count > 40 { log.removeFirst(log.count - 40) }
    }

    // MARK: - arming (foreground)

    @objc func arm(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("path is required"); return }
        let a = Armed(path: path, title: call.getString("title") ?? "Slowtide", subtitle: call.getString("subtitle") ?? "Sleep mode",
                      volume: Float(call.getDouble("volume") ?? 1.0), endsAt: call.getDouble("endsAt") ?? 0,
                      maxSeconds: call.getDouble("maxSeconds") ?? 0, trial: call.getBool("trial") ?? false)
        DispatchQueue.main.async {
            self.observe()
            self.armed = a
            // keep the session active now, while we are still in the foreground and allowed to
            do { try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers]); try AVAudioSession.sharedInstance().setActive(true) } catch { self.note("session: \(error.localizedDescription)") }
            self.note("armed \(a.trial ? "trial " : "")\(URL(string: path)?.lastPathComponent ?? path)")
            call.resolve(["armed": true])
        }
    }

    @objc func disarm(_ call: CAPPluginCall) {
        DispatchQueue.main.async { if self.armed != nil { self.note("disarmed") }; self.armed = nil; call.resolve() }
    }

    // MARK: - app lifecycle

    @objc private func wentBackground() {
        guard let a = armed, player == nil else { note("background: nothing armed"); return }
        note("background: starting")
        lastRun = [:]
        start(path: a.path, title: a.title, subtitle: a.subtitle, volume: a.volume, fadeIn: 0.4,
              fadeOutAfter: a.endsAt > 0 ? max(5, a.endsAt - Date().timeIntervalSince1970) : 0, maxSeconds: a.maxSeconds, trial: a.trial) { ok, err in
            if !ok { self.note("start failed: \(err)"); self.lastRun = ["ran": false, "error": err, "trial": a.trial] }
        }
    }

    @objc private func cameForeground() {
        guard let p = player else { return }
        let secs = startedAt.map { Date().timeIntervalSince($0) } ?? 0
        note("foreground after \(Int(secs)) s, stopping")
        finish(by: stoppedBy.isEmpty ? "foreground" : stoppedBy, fade: 0.4)
        _ = p
    }

    @objc private func interrupted(_ n: Notification) {
        guard let info = n.userInfo, let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt, let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
        if type == .began, player != nil { note("interrupted (call or another app)"); finish(by: "interrupted", fade: 0) }
    }

    // MARK: - playback

    private func start(path: String, title: String, subtitle: String, volume: Float, fadeIn: Double, fadeOutAfter: Double, maxSeconds: Double, trial: Bool, done: @escaping (Bool, String) -> Void) {
        guard let url = URL(string: path) ?? URL(string: "file://" + path) else { done(false, "bad path"); return }
        teardown()
        do {
            let session = AVAudioSession.sharedInstance()
            do { try session.setCategory(.playback, mode: .default, options: []) ; try session.setActive(true) } catch { note("session activate: \(error.localizedDescription)") }
            let p = try AVAudioPlayer(contentsOf: url)
            p.numberOfLoops = -1
            p.volume = fadeIn > 0 ? 0 : volume
            p.prepareToPlay()
            guard p.play() else { done(false, "play() returned false"); return }
            player = p
            stoppedBy = ""
            startedAt = Date()
            lastRun = ["ran": true, "trial": trial, "startedAt": Date().timeIntervalSince1970 * 1000]
            if fadeIn > 0 { p.setVolume(volume, fadeDuration: fadeIn) }
            wireRemoteCommands()
            nowPlaying(title: title, subtitle: subtitle)
            var limit: Double = 0
            if fadeOutAfter > 0 { limit = fadeOutAfter }
            if maxSeconds > 0 { limit = limit > 0 ? min(limit, maxSeconds) : maxSeconds }
            if limit > 0 {
                let by = (maxSeconds > 0 && (fadeOutAfter <= 0 || maxSeconds < fadeOutAfter)) ? "trial" : "timer"
                let work = DispatchWorkItem { [weak self] in self?.finish(by: by, fade: 10) }
                stopWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + max(1, limit - 10), execute: work)
            }
            note("playing (limit \(Int(limit)) s)")
            done(true, "")
        } catch {
            done(false, error.localizedDescription)
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.reject("path is required"); return }
        DispatchQueue.main.async {
            self.start(path: path, title: call.getString("title") ?? "Slowtide", subtitle: call.getString("subtitle") ?? "Sleep mode",
                       volume: Float(call.getDouble("volume") ?? 1.0), fadeIn: call.getDouble("fadeIn") ?? 0,
                       fadeOutAfter: call.getDouble("fadeOutAfter") ?? 0, maxSeconds: call.getDouble("maxSeconds") ?? 0, trial: call.getBool("trial") ?? false) { ok, err in
                if ok { call.resolve(["playing": true]) } else { call.reject("play failed: \(err)") }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        let fade = call.getDouble("fade") ?? 0.4
        DispatchQueue.main.async {
            if self.player != nil { self.finish(by: "js", fade: fade) }
            call.resolve()
        }
    }

    /// `ran`: a background run happened since the page last asked; `stoppedBy`: how it ended ("" = still playing)
    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var out: [String: Any] = ["playing": self.player?.isPlaying ?? false, "stoppedBy": self.stoppedBy, "armed": self.armed != nil, "log": self.log]
            for (k, v) in self.lastRun { out[k] = v }
            if let s = self.startedAt { out["elapsed"] = Date().timeIntervalSince(s) }
            else if let ms = self.lastRun["startedAt"] as? Double, let end = self.lastRun["endedAt"] as? Double { out["elapsed"] = (end - ms) / 1000 }
            self.lastRun = [:]
            call.resolve(out)
        }
    }

    private func finish(by: String, fade: Double) {
        stopWork?.cancel(); stopWork = nil
        guard let p = player else { return }
        stoppedBy = by
        if by != "foreground" && by != "js" { NotificationCenter.default.post(name: Notification.Name("SlowtideEnded"), object: nil) }
        lastRun["stoppedBy"] = by
        lastRun["endedAt"] = Date().timeIntervalSince1970 * 1000
        note("stopped by \(by)")
        if fade > 0.05 {
            p.setVolume(0, fadeDuration: fade)
            fadeTimer?.invalidate()
            fadeTimer = Timer.scheduledTimer(withTimeInterval: fade + 0.05, repeats: false) { [weak self] _ in
                guard let self = self, self.player === p else { return }
                self.teardown(keepReason: true)
                self.notifyListeners("stopped", data: ["by": by])
            }
        } else {
            teardown(keepReason: true)
            notifyListeners("stopped", data: ["by": by])
        }
    }

    private func teardown(keepReason: Bool = false) {
        fadeTimer?.invalidate(); fadeTimer = nil
        stopWork?.cancel(); stopWork = nil
        if let p = player { p.stop(); player = nil }
        if !keepReason { stoppedBy = "" }
        MPNowPlayingInfoCenter.default().playbackState = .stopped
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func nowPlaying(title: String, subtitle: String) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: subtitle,
            MPMediaItemPropertyAlbumTitle: "Slowtide",
            MPNowPlayingInfoPropertyIsLiveStream: true,
            MPNowPlayingInfoPropertyPlaybackRate: 1.0
        ]
        if let img = UIImage(named: "AppIcon") {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        MPNowPlayingInfoCenter.default().playbackState = .playing
        UIApplication.shared.beginReceivingRemoteControlEvents()
    }

    private func wireRemoteCommands() {
        if commandsWired { return }
        commandsWired = true
        let c = MPRemoteCommandCenter.shared()
        let stopHandler: (MPRemoteCommandEvent) -> MPRemoteCommandHandlerStatus = { [weak self] _ in
            self?.finish(by: "remote", fade: 1.5); return .success
        }
        c.pauseCommand.isEnabled = true; c.pauseCommand.addTarget(handler: stopHandler)
        c.stopCommand.isEnabled = true; c.stopCommand.addTarget(handler: stopHandler)
        c.togglePlayPauseCommand.isEnabled = true; c.togglePlayPauseCommand.addTarget(handler: stopHandler)
        c.playCommand.isEnabled = false
        c.nextTrackCommand.isEnabled = false
        c.previousTrackCommand.isEnabled = false
    }
}
