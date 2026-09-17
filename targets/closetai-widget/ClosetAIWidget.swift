import WidgetKit
import SwiftUI

// MARK: - Data models (must match widgetService.js JSON shape)

struct OutfitItem: Codable, Identifiable {
    var id: String { slot }
    let slot: String
    let type: String
    let color: String
}

struct WidgetOutfit: Codable {
    let outfitName: String
    let items: [OutfitItem]
    let generatedAt: String
}

struct OutfitEntry: TimelineEntry {
    let date: Date
    let outfit: WidgetOutfit?
}

// MARK: - Color parsing (mirrors parseColor() in BodyOutfitPreview.js)

extension Color {
    static func fromName(_ name: String) -> Color {
        let lower = name.lowercased()
        let map: [String: Color] = [
            "black":    Color(red: 0.10, green: 0.10, blue: 0.10),
            "white":    Color(red: 0.96, green: 0.96, blue: 0.96),
            "grey":     .gray,
            "gray":     .gray,
            "red":      Color(red: 0.94, green: 0.27, blue: 0.27),
            "blue":     Color(red: 0.23, green: 0.51, blue: 0.96),
            "navy":     Color(red: 0.12, green: 0.23, blue: 0.37),
            "green":    Color(red: 0.13, green: 0.77, blue: 0.37),
            "yellow":   Color(red: 0.98, green: 0.80, blue: 0.08),
            "orange":   Color(red: 0.98, green: 0.45, blue: 0.09),
            "purple":   Color(red: 0.66, green: 0.33, blue: 0.97),
            "pink":     Color(red: 0.93, green: 0.29, blue: 0.60),
            "brown":    Color(red: 0.57, green: 0.25, blue: 0.06),
            "beige":    Color(red: 0.91, green: 0.83, blue: 0.69),
            "cream":    Color(red: 1.00, green: 0.99, blue: 0.82),
            "tan":      Color(red: 0.82, green: 0.71, blue: 0.55),
            "khaki":    Color(red: 0.76, green: 0.69, blue: 0.57),
            "teal":     Color(red: 0.05, green: 0.58, blue: 0.53),
            "maroon":   Color(red: 0.50, green: 0.00, blue: 0.00),
            "denim":    Color(red: 0.08, green: 0.38, blue: 0.74),
            "olive":    Color(red: 0.42, green: 0.45, blue: 0.16),
            "charcoal": Color(red: 0.21, green: 0.27, blue: 0.31),
            "camel":    Color(red: 0.76, green: 0.60, blue: 0.42),
            "burgundy": Color(red: 0.50, green: 0.00, blue: 0.13),
            "mint":     Color(red: 0.61, green: 1.00, blue: 0.61),
            "coral":    Color(red: 1.00, green: 0.42, blue: 0.42),
            "lavender": Color(red: 0.90, green: 0.83, blue: 0.94),
            "gold":     Color(red: 1.00, green: 0.84, blue: 0.00),
            "silver":   Color(red: 0.75, green: 0.75, blue: 0.75),
            "rust":     Color(red: 0.72, green: 0.25, blue: 0.05),
            "sage":     Color(red: 0.56, green: 0.67, blue: 0.45),
            "slate":    Color(red: 0.39, green: 0.46, blue: 0.54),
            "sand":     Color(red: 0.76, green: 0.70, blue: 0.50),
        ]
        if let c = map[lower] { return c }
        for word in lower.split(separator: " ") {
            if let c = map[String(word)] { return c }
        }
        return .gray
    }
}

// MARK: - Timeline provider

struct Provider: TimelineProvider {
    private let appGroup   = "group.com.gregpark.closetai"
    private let storageKey = "todayOutfit"

    func placeholder(in context: Context) -> OutfitEntry {
        OutfitEntry(date: Date(), outfit: WidgetOutfit(
            outfitName: "Morning Look",
            items: [
                OutfitItem(slot: "top",    type: "Oxford Shirt", color: "White"),
                OutfitItem(slot: "bottom", type: "Slim Jeans",   color: "Navy"),
                OutfitItem(slot: "shoes",  type: "Sneakers",     color: "White"),
            ],
            generatedAt: ""
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (OutfitEntry) -> Void) {
        completion(OutfitEntry(date: Date(), outfit: load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OutfitEntry>) -> Void) {
        let entry = OutfitEntry(date: Date(), outfit: load())
        // Refresh tomorrow at 7 AM so the widget updates each morning
        var comps        = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comps.day        = (comps.day ?? 0) + 1
        comps.hour       = 7
        comps.minute     = 0
        let nextRefresh  = Calendar.current.date(from: comps) ?? Date().addingTimeInterval(86_400)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func load() -> WidgetOutfit? {
        guard
            let defaults   = UserDefaults(suiteName: appGroup),
            let jsonString = defaults.string(forKey: storageKey),
            let data       = jsonString.data(using: .utf8),
            let outfit     = try? JSONDecoder().decode(WidgetOutfit.self, from: data)
        else { return nil }
        return outfit
    }
}

// MARK: - Swatch row

struct SwatchRow: View {
    let items: [OutfitItem]

    var body: some View {
        HStack(spacing: 10) {
            ForEach(items.prefix(5)) { item in
                VStack(spacing: 3) {
                    Circle()
                        .fill(Color.fromName(item.color))
                        .frame(width: 28, height: 28)
                        .overlay(Circle().stroke(Color.black.opacity(0.10), lineWidth: 0.5))
                    Text(item.type)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                        .frame(maxWidth: 52)
                }
            }
            Spacer()
        }
    }
}

// MARK: - Widget view

struct ClosetAIWidgetView: View {
    let entry: OutfitEntry

    var body: some View {
        Group {
            if let outfit = entry.outfit {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("ClosetAI")
                            .font(.system(size: 11, weight: .black))
                            .foregroundColor(.primary)
                        Spacer()
                        Text(dayLabel(entry.date))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.secondary)
                    }
                    .padding(.bottom, 6)

                    Text("Today's outfit")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.secondary)
                        .padding(.bottom, 2)

                    Text(outfit.outfitName)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                        .padding(.bottom, 10)

                    SwatchRow(items: outfit.items)
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "tshirt.fill")
                        .font(.title)
                        .foregroundColor(.secondary)
                    Text("Open ClosetAI")
                        .font(.system(size: 13, weight: .bold))
                    Text("to generate today's outfit")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private func dayLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "E, MMM d"
        return f.string(from: date)
    }
}

// MARK: - Widget configuration

struct ClosetAIWidget: Widget {
    let kind = "ClosetAIWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                ClosetAIWidgetView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                ClosetAIWidgetView(entry: entry)
                    .padding()
                    .background(Color(UIColor.systemBackground))
            }
        }
        .configurationDisplayName("Today's Outfit")
        .description("See your AI outfit suggestion for the day at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
