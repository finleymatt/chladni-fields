import WidgetKit
import SwiftUI
import ActivityKit

/// The room, while it plays: a compact readout in the Dynamic Island (rings on the left, a countdown or the
/// sounds on the right), a fuller card when held, and a Lock Screen card with a pause button.
@available(iOS 17.0, *)
struct SlowtideLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: SlowtideAttributes.self) { context in
            LockCard(state: context.state)
                .activityBackgroundTint(ground)
                .activitySystemActionForegroundColor(brass)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Rings(accent: context.state.phase == "rest" ? brass : cyan, size: 44).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Button(intent: SlowtidePauseIntent()) {
                        Image(systemName: "pause.fill").font(.system(size: 18, weight: .bold)).foregroundStyle(ground)
                            .frame(width: 44, height: 44).background(brass, in: Circle())
                    }.buttonStyle(.plain)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.title).font(.system(size: 15, weight: .semibold, design: .rounded)).foregroundStyle(ink).lineLimit(1)
                        Text(context.state.subtitle).font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundStyle(muted).lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let ends = context.state.ends, !context.state.phase.isEmpty {
                        HStack {
                            Text(context.state.phase == "work" ? "SPRINT" : "REST").font(.system(size: 10, weight: .semibold, design: .monospaced)).tracking(1.4).foregroundStyle(muted)
                            Spacer()
                            Text(timerInterval: Date.now...max(Date.now, ends), countsDown: true)
                                .font(.system(size: 22, weight: .bold, design: .rounded)).monospacedDigit()
                                .foregroundStyle(context.state.phase == "work" ? cyan : brass).multilineTextAlignment(.trailing)
                        }.padding(.horizontal, 6)
                    }
                }
            } compactLeading: {
                Rings(accent: context.state.phase == "rest" ? brass : cyan, size: 22)
            } compactTrailing: {
                if let ends = context.state.ends, !context.state.phase.isEmpty {
                    Text(timerInterval: Date.now...max(Date.now, ends), countsDown: true)
                        .font(.system(size: 13, weight: .semibold, design: .rounded)).monospacedDigit()
                        .foregroundStyle(context.state.phase == "work" ? cyan : brass).frame(maxWidth: 52).multilineTextAlignment(.trailing)
                } else {
                    Text(context.state.title).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundStyle(ink).lineLimit(1).frame(maxWidth: 76)
                }
            } minimal: {
                Rings(accent: cyan, size: 20)
            }
            .keylineTint(brass)
        }
    }
}

@available(iOS 17.0, *)
struct LockCard: View {
    let state: SlowtideAttributes.ContentState
    var body: some View {
        HStack(spacing: 14) {
            Rings(accent: state.phase == "rest" ? brass : cyan, size: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text(state.phase.isEmpty ? "SLOWTIDE" : (state.phase == "work" ? "SLOWTIDE · SPRINT" : "SLOWTIDE · REST"))
                    .font(.system(size: 9.5, weight: .semibold, design: .monospaced)).tracking(1.4).foregroundStyle(muted)
                Text(state.title).font(.system(size: 17, weight: .bold, design: .rounded)).foregroundStyle(ink).lineLimit(1)
                if let ends = state.ends, !state.phase.isEmpty {
                    Text(timerInterval: Date.now...max(Date.now, ends), countsDown: true)
                        .font(.system(size: 26, weight: .bold, design: .rounded)).monospacedDigit()
                        .foregroundStyle(state.phase == "work" ? cyan : brass).multilineTextAlignment(.leading)
                } else {
                    Text(state.subtitle).font(.system(size: 11.5, weight: .medium, design: .monospaced)).foregroundStyle(muted).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Button(intent: SlowtidePauseIntent()) {
                Image(systemName: state.playing ? "pause.fill" : "stop.fill").font(.system(size: 20, weight: .bold)).foregroundStyle(ground)
                    .frame(width: 50, height: 50).background(brass, in: Circle())
            }.buttonStyle(.plain)
        }
        .padding(16)
    }
}
