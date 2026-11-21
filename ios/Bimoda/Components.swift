import SwiftUI

/// Bimoda mark: two modes in one square. The solid half is "on this device", the dotted half is "over the wire".
struct Mark: View {
    var size: CGFloat = 28
    var body: some View {
        Canvas { ctx, sz in
            let u = sz.width / 28
            var solid = Path()
            solid.addRoundedRect(in: CGRect(x: 2 * u, y: 2 * u, width: 12 * u, height: 24 * u), cornerSize: CGSize(width: 6 * u, height: 6 * u))
            solid.addRect(CGRect(x: 9 * u, y: 2 * u, width: 5 * u, height: 24 * u))
            ctx.fill(solid, with: .color(Dock.accent))
            let dots: [(CGFloat, CGFloat)] = [(17, 2), (21.3, 2.6), (24.8, 5.4), (26, 9.6), (26, 14), (26, 18.4), (24.8, 22.6), (21.3, 25.4), (17, 26)]
            for (x, y) in dots {
                ctx.fill(Path(ellipseIn: CGRect(x: (x - 1.15) * u, y: (y - 1.15) * u, width: 2.3 * u, height: 2.3 * u)), with: .color(Dock.accent))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Solid = on this device, dashed = cloud. Shape, not hue, carries the route.
struct RouteGlyph: View {
    let mode: PrivacyMode
    var color: Color = Dock.text
    var body: some View {
        Canvas { ctx, sz in
            let y = sz.height / 2
            let solid = StrokeStyle(lineWidth: 2.6, lineCap: .round)
            let dashed = StrokeStyle(lineWidth: 2.6, lineCap: .round, dash: [3, 3.5])
            func line(_ from: CGFloat, _ to: CGFloat, _ style: StrokeStyle) {
                var p = Path()
                p.move(to: CGPoint(x: from, y: y))
                p.addLine(to: CGPoint(x: to, y: y))
                ctx.stroke(p, with: .color(color), style: style)
            }
            switch mode {
            case .localOnly: line(1.5, sz.width - 1.5, solid)
            case .cloud: line(1.5, sz.width - 1.5, dashed)
            case .hybrid:
                line(1.5, sz.width * 0.45, solid)
                line(sz.width * 0.6, sz.width - 1.5, dashed)
            }
        }
        .frame(width: 24, height: 8)
        .accessibilityHidden(true)
    }
}

struct RouteSwitch: View {
    @Binding var mode: PrivacyMode
    var body: some View {
        HStack(spacing: 4) {
            ForEach(PrivacyMode.allCases) { m in
                let on = m == mode
                Button {
                    withAnimation(.snappy(duration: 0.2)) { mode = m }
                } label: {
                    HStack(spacing: 6) {
                        RouteGlyph(mode: m, color: on ? Dock.onAccent : Dock.muted)
                        Text(m.rawValue).font(on ? T.bold(14) : T.body(14)).foregroundStyle(on ? Dock.onAccent : Dock.muted).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(on ? Dock.accent : .clear, in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Dock.surface, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Privacy mode")
    }
}

/// Where the answer was produced, read from the SDK response.
struct SourceBadge: View {
    let source: InferenceSource
    var body: some View {
        let device = source == .onDevice
        HStack(spacing: 6) {
            RouteGlyph(mode: device ? .localOnly : .cloud, color: device ? Dock.bg : Dock.text).frame(width: 18)
            Text(source.rawValue).font(T.bold(13)).foregroundStyle(device ? Dock.bg : Dock.text)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background {
            if device {
                RoundedRectangle(cornerRadius: 8).fill(Dock.text)
            } else {
                RoundedRectangle(cornerRadius: 8).strokeBorder(Dock.text, style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
            }
        }
    }
}

func decisionColor(_ d: Decision, onPaper: Bool) -> Color {
    switch d {
    case .ALLOW: onPaper ? Dock.paperGo : Dock.go
    case .DENY: onPaper ? Dock.paperStop : Dock.stop
    case .REQUIRE_APPROVAL: onPaper ? Dock.paperHold : Dock.hold
    case .NEED_MORE_INFORMATION: onPaper ? Dock.paperInfo : Dock.info
    }
}

/// A policy decision lands on the case as a rubber stamp.
struct Stamp: View {
    let decision: Decision
    var large = false
    var onPaper = false
    var body: some View {
        let color = decisionColor(decision, onPaper: onPaper)
        Text(decision.label)
            .font(T.display(large ? 24 : 12)).kerning(0.8).foregroundStyle(color).lineLimit(1)
            .padding(.horizontal, large ? 12 : 7).padding(.vertical, large ? 3 : 1)
            .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(color, lineWidth: 1))
            .padding(1.5)
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(color, lineWidth: large ? 3 : 2))
            .rotationEffect(.degrees(large ? -7 : -1.5))
            .opacity(large ? 0.92 : 1)
            .accessibilityLabel("Policy decision: \(decision.label)")
    }
}

struct Chip: View {
    let text: String
    var color: Color = Dock.muted
    var body: some View {
        Text(text).font(T.label).foregroundStyle(color).lineLimit(1)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(color.opacity(0.6), lineWidth: 1))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(T.bold(16)).foregroundStyle(Dock.onAccent)
            .frame(maxWidth: .infinity, minHeight: 50).padding(.horizontal, 14)
            .background(Dock.accent.opacity(enabled ? 1 : 0.4), in: RoundedRectangle(cornerRadius: 12))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct GhostButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(T.body()).foregroundStyle(enabled ? Dock.text : Dock.muted.opacity(0.5))
            .frame(maxWidth: .infinity, minHeight: 46).padding(.horizontal, 14)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Dock.line.opacity(enabled ? 1 : 0.4), lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 12))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// A dark panel on the desk.
struct Panel<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Dock.surface, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Dock.line.opacity(0.5), lineWidth: 1))
    }
}

/// The docket: a paper case sheet with a perforated tear-off edge, lying on the dark desk.
struct Docket<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(.horizontal, 18).padding(.top, 20).padding(.bottom, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                Canvas { ctx, sz in
                    ctx.fill(Path(roundedRect: CGRect(origin: .zero, size: sz), cornerRadius: 5), with: .color(Dock.paper))
                    var x: CGFloat = 6
                    while x < sz.width {
                        ctx.fill(Path(ellipseIn: CGRect(x: x - 3.4, y: -3.4, width: 6.8, height: 6.8)), with: .color(Dock.bg))
                        x += 12
                    }
                }
            }
            .padding(.top, 6)
    }
}

struct DashedRule: View {
    var color: Color = Dock.paperLine
    var body: some View {
        Rectangle().fill(.clear).frame(height: 1)
            .overlay(Line().stroke(color, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    }
    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            var p = Path()
            p.move(to: CGPoint(x: 0, y: rect.midY))
            p.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return p
        }
    }
}

/// Numbered step marker: the case really is a sequence (read, check policy, approve).
struct StepHeader: View {
    let n: Int
    let title: String
    var body: some View {
        HStack(spacing: 10) {
            Text("\(n)").font(T.figure(14)).foregroundStyle(Dock.onAccent)
                .frame(width: 26, height: 26).background(Dock.accent, in: Circle())
            Text(title).font(T.title).foregroundStyle(Dock.text)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

struct KeyValue: View {
    let key: String
    let value: String
    var valueColor: Color = Dock.text
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(key).font(T.small).foregroundStyle(Dock.muted).frame(width: 104, alignment: .leading)
            Text(value).font(T.body(14)).foregroundStyle(valueColor).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 2)
    }
}

/// Wrapping row for chips, so every action stays visible instead of hiding in a horizontal scroll.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
