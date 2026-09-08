import Foundation
import AVFoundation
import MediaPlayer
import Capacitor

/// Sleep mode. The web engine renders the current mix to a looping WAV; when the screen locks the page
/// hands that file here and AVAudioPlayer keeps it sounding (Web Audio is paused in the background).
/// Carries lock-screen Now Playing info and honours the pause/stop buttons, an optional fade-out time
/// (the room's timer) and a hard cap (the free trial).
@objc(SleepAudioPlugin)
public class SleepAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SleepAudioPlugin"
    public let jsName = "SleepAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise)
    ]

    private var player: AVAudioPlayer?
    private var stoppedBy = ""
    private var startedAt: Date?
    private var stopWork: DispatchWorkItem?
    private var fadeTimer: Timer?
    private var commandsWired = false

    @objc func play(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let url = URL(string: path) ?? URL(string: "file://" + path) else { call.reject("path is required"); return }
        let title = call.getString("title") ?? "Chladni Fields"
        let subtitle = call.getString("subtitle") ?? "Resonance Room"
        let volume = Float(call.getDouble("volume") ?? 1.0)
        let fadeIn = call.getDouble("fadeIn") ?? 0
        let fadeOutAfter = call.getDouble("fadeOutAfter") ?? 0   // seconds until the room's timer ends; 0 = never
        let maxSeconds = call.getDouble("maxSeconds") ?? 0       // hard cap (the free trial); 0 = none
        DispatchQueue.main.async {
            self.teardown()
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [])
                try session.setActive(true)
                let p = try AVAudioPlayer(contentsOf: url)
                p.numberOfLoops = -1
                p.volume = fadeIn > 0 ? 0 : volume
                p.prepareToPlay()
                guard p.play() else { call.reject("could not start playback"); return }
                self.player = p
                self.stoppedBy = ""
                self.startedAt = Date()
                if fadeIn > 0 { p.setVolume(volume, fadeDuration: fadeIn) }
                self.wireRemoteCommands()
                self.nowPlaying(title: title, subtitle: subtitle)
                var limit: Double = 0
                if fadeOutAfter > 0 { limit = fadeOutAfter }
                if maxSeconds > 0 { limit = limit > 0 ? min(limit, maxSeconds) : maxSeconds }
                if limit > 0 {
                    let by = (maxSeconds > 0 && (fadeOutAfter <= 0 || maxSeconds < fadeOutAfter)) ? "trial" : "timer"
                    let work = DispatchWorkItem { [weak self] in self?.finish(by: by, fade: 10) }
                    self.stopWork = work
                    DispatchQueue.main.asyncAfter(deadline: .now() + max(1, limit - 10), execute: work)
                }
                call.resolve(["playing": true])
            } catch {
                call.reject("play failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        let fade = call.getDouble("fade") ?? 0.4
        DispatchQueue.main.async {
            self.finish(by: "js", fade: fade)
            call.resolve()
        }
    }

    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let playing = self.player?.isPlaying ?? false
            let elapsed = self.startedAt.map { Date().timeIntervalSince($0) } ?? 0
            call.resolve(["playing": playing, "stoppedBy": self.stoppedBy, "elapsed": elapsed])
        }
    }

    private func finish(by: String, fade: Double) {
        stopWork?.cancel(); stopWork = nil
        guard let p = player else { return }
        stoppedBy = by
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
            MPMediaItemPropertyAlbumTitle: "Chladni Fields",
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
