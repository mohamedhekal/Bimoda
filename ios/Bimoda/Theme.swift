import CoreText
import SwiftUI
import UIKit

/// Bimoda identity, "the night dock": a quiet petrol desk, the open case as a paper docket lying on it,
/// decisions as rubber stamps, on-device drawn SOLID and cloud drawn DASHED. Marigold means "act here".
enum Dock {
    static let bg = Color(hex: 0x0A1D29)
    static let surface = Color(hex: 0x0F2937)
    static let surface2 = Color(hex: 0x163748)
    static let line = Color(hex: 0x234B5E)
    static let text = Color(hex: 0xEEF3F2)
    static let muted = Color(hex: 0xA3BAC4)
    static let accent = Color(hex: 0xFFB238)
    static let onAccent = Color(hex: 0x1D1400)
    static let go = Color(hex: 0x4FD69C)
    static let stop = Color(hex: 0xFF8585)
    static let hold = Color(hex: 0xC0ACFF)
    static let info = Color(hex: 0x86C0FF)
    static let paper = Color(hex: 0xF3EEDF)
    static let paperInk = Color(hex: 0x17242C)
    static let paperMuted = Color(hex: 0x55646D)
    static let paperLine = Color(hex: 0xD6CCB3)
    static let paperStop = Color(hex: 0xB3262F)
    static let paperGo = Color(hex: 0x0D6B47)
    static let paperHold = Color(hex: 0x5A3FC0)
    static let paperInfo = Color(hex: 0x1A5AA8)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
    }
}

/// Archivo variable font (weight and width axes), bundled with the app and registered at first use.
enum Archivo {
    private static let name: String = {
        guard let url = Bundle.main.url(forResource: "Archivo", withExtension: "ttf") else { return "" }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor]
        return descriptors?.first.flatMap { CTFontDescriptorCopyAttribute($0, kCTFontNameAttribute) as? String } ?? ""
    }()

    static func font(_ size: CGFloat, weight: CGFloat, width: CGFloat, relativeTo style: UIFont.TextStyle = .body) -> Font {
        guard !name.isEmpty else { return .system(size: size, weight: weight >= 650 ? .bold : .regular) }
        // axis tags: 'wght' = 0x77676874, 'wdth' = 0x77647468
        let descriptor = UIFontDescriptor(fontAttributes: [
            .name: name,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [0x7767_6874: weight, 0x7764_7468: width],
        ])
        // scaled with Dynamic Type so the app respects the user's text size
        return Font(UIFontMetrics(forTextStyle: style).scaledFont(for: UIFont(descriptor: descriptor, size: size)))
    }
}

/// Type roles. Display uses Archivo's width axis: narrow and heavy, like the bold line on a shipping label.
enum T {
    static func display(_ size: CGFloat) -> Font { Archivo.font(size, weight: 800, width: 68, relativeTo: .largeTitle) }
    static let title = Archivo.font(20, weight: 700, width: 88, relativeTo: .title3)
    static func body(_ size: CGFloat = 15) -> Font { Archivo.font(size, weight: 450, width: 100) }
    static func bold(_ size: CGFloat = 15) -> Font { Archivo.font(size, weight: 650, width: 100) }
    static let small = Archivo.font(13, weight: 450, width: 100, relativeTo: .footnote)
    static let label = Archivo.font(12, weight: 650, width: 100, relativeTo: .caption1)
    static func figure(_ size: CGFloat = 15) -> Font { Archivo.font(size, weight: 700, width: 75) }
    static func mono(_ size: CGFloat = 12) -> Font { .system(size: size, design: .monospaced) }
}
