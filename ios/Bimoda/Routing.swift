import Foundation

enum PrivacyMode: String, CaseIterable, Identifiable {
    case hybrid = "Hybrid", localOnly = "Local only", cloud = "Cloud"
    var id: String { rawValue }
}

/// The four inference preferences. On Apple platforms the Firebase AI Logic SDK expresses them by model choice:
/// a hybrid model (primary, secondary), the system model alone, or the Gemini model alone.
enum Preference: String, CaseIterable { case PREFER_ON_DEVICE, ONLY_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD }

enum RunStatus: String { case success, failed_validation, unavailable, blocked_privacy, offline, timeout, error }

struct RoutePlan {
    /// The preference actually handed to the SDK.
    let effective: Preference
    /// Could this request reach the cloud model? False for ONLY_ON_DEVICE: no cloud model is configured at all.
    let mayReachCloud: Bool
    /// Redaction is applied before the SDK call.
    let redact: Bool
    let blocked: (status: RunStatus, reason: String)?
    let steps: [String]
}

/// The single source of truth for privacy routing, ported from the web app (src/ai/hybrid-engine/route.ts).
/// It only decides what is allowed: which model actually answers is decided by the Firebase SDK.
func planRoute(privacyMode: PrivacyMode, preference: Preference, cloudEnabled: Bool, online: Bool, allowIdentifiableCloud: Bool = false) -> RoutePlan {
    var steps: [String] = []
    var effective = preference
    if privacyMode == .localOnly || !cloudEnabled {
        let why = privacyMode == .localOnly ? "Local Only mode forbids cloud inference." : "Cloud inference is switched off by the operator (Remote Config)."
        if effective == .ONLY_IN_CLOUD || effective == .PREFER_IN_CLOUD {
            steps.append("Blocked: \(why)")
            return RoutePlan(effective: effective, mayReachCloud: false, redact: false, blocked: (.blocked_privacy, why), steps: steps)
        }
        if effective != .ONLY_ON_DEVICE { steps.append("PREFER_ON_DEVICE tightened to ONLY_ON_DEVICE so the SDK cannot silently fall back to the cloud.") }
        effective = .ONLY_ON_DEVICE
        steps.append(privacyMode == .localOnly ? "Local Only: the prompt stays on this device." : "Cloud switched off: the prompt stays on this device.")
    }
    let mayReachCloud = effective != .ONLY_ON_DEVICE
    if !mayReachCloud {
        return RoutePlan(effective: effective, mayReachCloud: false, redact: false, blocked: nil, steps: steps + ["No redaction needed: nothing is sent to the cloud model."])
    }
    let redact = !allowIdentifiableCloud
    steps.append(redact ? "May reach the cloud: names, phones, emails and addresses are redacted first." : "May reach the cloud: identifiable text is sent because consent is on.")
    if !online && effective == .ONLY_IN_CLOUD {
        let reason = "Device is offline and this request is cloud-only."
        return RoutePlan(effective: effective, mayReachCloud: true, redact: redact, blocked: (.offline, reason), steps: steps + ["Blocked: \(reason)"])
    }
    switch effective {
    case .PREFER_ON_DEVICE: steps.append("The SDK decides: the on-device model if available, otherwise the cloud model.")
    case .ONLY_IN_CLOUD: steps.append("The SDK sends the request to the cloud model.")
    default: steps.append("The SDK prefers the cloud model and may fall back to on-device.")
    }
    return RoutePlan(effective: effective, mayReachCloud: true, redact: redact, blocked: nil, steps: steps)
}

struct KnownEntities { var names: [String] = []; var phones: [String] = []; var emails: [String] = []; var addresses: [String] = [] }
struct Redaction { let text: String; let count: Int }

/// Deterministic redaction applied before any request that could reach the cloud. Known entities first, then generic patterns.
func redact(_ input: String, known: KnownEntities = KnownEntities()) -> Redaction {
    var text = input
    var count = 0
    func sub(_ pattern: String, _ token: String, keep: ((String) -> Bool)? = nil) {
        guard let re = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return }
        let ns = text as NSString
        var out = ""
        var last = 0
        for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let match = ns.substring(with: m.range)
            out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
            if let keep, keep(match) { out += match } else { out += token; count += 1 }
            last = m.range.location + m.range.length
        }
        out += ns.substring(from: last)
        text = out
    }
    func list(_ items: [String], _ token: String) {
        for item in items.filter({ !$0.trimmingCharacters(in: .whitespaces).isEmpty }).sorted(by: { $0.count > $1.count }) {
            sub(NSRegularExpression.escapedPattern(for: item), token)
            if token == "[CUSTOMER_NAME]" {
                for part in item.split(separator: " ").map(String.init) where part.count >= 3 { sub("\\b\(NSRegularExpression.escapedPattern(for: part))\\b", token) }
            }
        }
    }
    list(known.addresses, "[ADDRESS]")
    list(known.emails, "[EMAIL]")
    // generic e-mail pattern runs before names, so an address that contains the customer's name is removed whole
    sub("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", "[EMAIL]")
    list(known.phones, "[PHONE]")
    list(known.names, "[CUSTOMER_NAME]")
    // dates and short ids are not phone numbers
    sub("\\+?\\d[\\d\\s().-]{7,}\\d", "[PHONE]", keep: { m in
        m.filter(\.isNumber).count < 7 || m.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil
    })
    return Redaction(text: text, count: count)
}
