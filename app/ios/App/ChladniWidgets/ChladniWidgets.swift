import WidgetKit
import SwiftUI

/// Home-screen widgets: one tap starts a preset or a saved mix. The app writes the list into the shared
/// app-group container (WidgetBridgePlugin); each tile is a deep link the app plays on arrival.
struct Item: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var summary: String
    var url: String
    var kind: String   // "preset" or "mix"
}

struct Entry: TimelineEntry {
    let date: Date
    let items: [Item]
}

let brass = Color(red: 0.827, green: 0.659, blue: 0.318)
let cyan = Color(red: 0.392, green: 0.729, blue: 0.784)
let ink = Color(red: 0.914, green: 0.898, blue: 0.843)
let muted = Color(red: 0.545, green: 0.584, blue: 0.408)
let ground = Color(red: 0.051, green: 0.071, blue: 0.055)
let panel = Color(red: 0.082, green: 0.106, blue: 0.078)

let defaultItems: [Item] = [
    Item(id: "p-winddown", name: "Wind down", summary: "432 warm pad · theta beat", url: "chladni://play?preset=winddown", kind: "preset"),
    Item(id: "p-sleep", name: "Deep sleep", summary: "136.1 Om · brown noise", url: "chladni://play?preset=sleep", kind: "preset"),
    Item(id: "p-rain", name: "Rainy night", summary: "rain · 174 hum", url: "chladni://play?preset=rain", kind: "preset"),
    Item(id: "p-work", name: "Work", summary: "stream · beta 15 beat", url: "chladni://play?preset=work", kind: "preset")
]

func loadItems() -> [Item] {
    if let d = UserDefaults(suiteName: "group.lol.iamra.chladni"),
       let data = d.data(forKey: "widgetItems"),
       let items = try? JSONDecoder().decode([Item].self, from: data), !items.isEmpty {
        return items
    }
    return defaultItems
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: Date(), items: defaultItems) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: Date(), items: loadItems())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [Entry(date: Date(), items: loadItems())], policy: .never))
    }
}

/// The breathing rings of the Resonance Room, as a glyph.
struct Rings: View {
    var accent: Color = brass
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            Circle().stroke(cyan.opacity(0.35), lineWidth: 1).frame(width: size, height: size)
            Circle().stroke(cyan.opacity(0.7), lineWidth: 1.4).frame(width: size * 0.66, height: size * 0.66)
            Circle().stroke(accent, lineWidth: 2.2).frame(width: size * 0.42, height: size * 0.42)
                .shadow(color: accent.opacity(0.6), radius: 4)
            Circle().fill(accent).frame(width: size * 0.14, height: size * 0.14)
        }
    }
}

struct Tile: View {
    let item: Item
    var compact = false
    var body: some View {
        HStack(spacing: 10) {
            Rings(accent: item.kind == "mix" ? cyan : brass, size: compact ? 30 : 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(.system(size: compact ? 12 : 13, weight: .semibold, design: .rounded)).foregroundStyle(ink).lineLimit(1)
                Text(item.summary).font(.system(size: 9.5, weight: .medium, design: .monospaced)).foregroundStyle(muted).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(panel, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.white.opacity(0.06), lineWidth: 0.5))
    }
}

struct SmallView: View {
    let entry: Entry
    var body: some View {
        let item = entry.items.first ?? defaultItems[0]
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("RESONANCE ROOM").font(.system(size: 8.5, weight: .semibold, design: .monospaced)).tracking(1.4).foregroundStyle(muted)
                Spacer()
            }
            Spacer(minLength: 0)
            Rings(accent: item.kind == "mix" ? cyan : brass, size: 52)
            Spacer(minLength: 0)
            Text(item.name).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(ink).lineLimit(1)
            Text(item.summary).font(.system(size: 9.5, weight: .medium, design: .monospaced)).foregroundStyle(muted).lineLimit(2)
            HStack(spacing: 4) {
                Image(systemName: "play.fill").font(.system(size: 9, weight: .bold))
                Text("PLAY").font(.system(size: 9, weight: .semibold, design: .monospaced)).tracking(1.2)
            }.foregroundStyle(brass)
        }
        .widgetURL(URL(string: item.url))
    }
}

struct MediumView: View {
    let entry: Entry
    var body: some View {
        let items = Array(entry.items.prefix(4))
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("RESONANCE ROOM").font(.system(size: 8.5, weight: .semibold, design: .monospaced)).tracking(1.4).foregroundStyle(muted)
                Spacer()
                Text("tap to play").font(.system(size: 8.5, weight: .medium, design: .monospaced)).foregroundStyle(brass.opacity(0.8))
            }
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                ForEach(items) { item in
                    if let url = URL(string: item.url) {
                        Link(destination: url) { Tile(item: item, compact: true) }
                    }
                }
            }
        }
    }
}

struct ChladniWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    var body: some View {
        Group {
            switch family {
            case .systemMedium: MediumView(entry: entry)
            default: SmallView(entry: entry)
            }
        }
        .containerBackground(for: .widget) {
            LinearGradient(colors: [ground, Color(red: 0.09, green: 0.125, blue: 0.10)], startPoint: .top, endPoint: .bottom)
        }
    }
}

struct ChladniWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "ChladniResonance", provider: Provider()) { entry in
            ChladniWidgetView(entry: entry)
        }
        .configurationDisplayName("Resonance Room")
        .description("Start a preset or one of your saved mixes with one tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct ChladniWidgetBundle: WidgetBundle {
    var body: some Widget {
        ChladniWidget()
    }
}
