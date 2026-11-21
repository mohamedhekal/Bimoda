package app.bimoda.android.ai

enum class PrivacyMode(val label: String) { HYBRID("Hybrid"), LOCAL_ONLY("Local only"), CLOUD("Cloud") }

/** The four inference modes of the Firebase AI Logic hybrid SDK. */
enum class Preference { PREFER_ON_DEVICE, ONLY_ON_DEVICE, PREFER_IN_CLOUD, ONLY_IN_CLOUD }

enum class RunStatus { SUCCESS, FAILED_VALIDATION, UNAVAILABLE, BLOCKED_PRIVACY, OFFLINE, TIMEOUT, ERROR }

data class RoutePlan(
    /** The preference actually handed to the SDK. */
    val effective: Preference,
    /** Could this request reach the cloud model? False for ONLY_ON_DEVICE: the SDK never falls back. */
    val mayReachCloud: Boolean,
    /** Redaction is applied before the SDK call. */
    val redact: Boolean,
    val blocked: Pair<RunStatus, String>?,
    val steps: List<String>,
)

/**
 * The single source of truth for privacy routing, ported from the web app (src/ai/hybrid-engine/route.ts).
 * It only decides what is allowed: whether Gemini Nano or the cloud model answers is decided by the Firebase SDK.
 */
fun planRoute(privacyMode: PrivacyMode, preference: Preference, cloudEnabled: Boolean, online: Boolean, allowIdentifiableCloud: Boolean = false): RoutePlan {
    val steps = mutableListOf<String>()
    var effective = preference
    if (privacyMode == PrivacyMode.LOCAL_ONLY || !cloudEnabled) {
        val why = if (privacyMode == PrivacyMode.LOCAL_ONLY) "Local Only mode forbids cloud inference." else "Cloud inference is switched off by the operator (Remote Config)."
        if (effective == Preference.ONLY_IN_CLOUD || effective == Preference.PREFER_IN_CLOUD) {
            steps += "Blocked: $why"
            return RoutePlan(effective, false, false, RunStatus.BLOCKED_PRIVACY to why, steps)
        }
        if (effective != Preference.ONLY_ON_DEVICE) steps += "PREFER_ON_DEVICE tightened to ONLY_ON_DEVICE so the SDK cannot silently fall back to the cloud."
        effective = Preference.ONLY_ON_DEVICE
        steps += if (privacyMode == PrivacyMode.LOCAL_ONLY) "Local Only: the prompt stays on this device." else "Cloud switched off: the prompt stays on this device."
    }
    val mayReachCloud = effective != Preference.ONLY_ON_DEVICE
    if (!mayReachCloud) return RoutePlan(effective, false, false, null, steps + "No redaction needed: nothing is sent to the cloud model.")

    val redact = !allowIdentifiableCloud
    steps += if (redact) "May reach the cloud: names, phones, emails and addresses are redacted first." else "May reach the cloud: identifiable text is sent because consent is on."
    if (!online && effective == Preference.ONLY_IN_CLOUD) {
        val reason = "Device is offline and this request is cloud-only."
        return RoutePlan(effective, true, redact, RunStatus.OFFLINE to reason, steps + "Blocked: $reason")
    }
    steps += when (effective) {
        Preference.PREFER_ON_DEVICE -> "The SDK decides: Gemini Nano if available, otherwise the cloud model."
        Preference.ONLY_IN_CLOUD -> "The SDK sends the request to the cloud model."
        else -> "The SDK prefers the cloud model and may fall back to on-device."
    }
    return RoutePlan(effective, true, redact, null, steps)
}

data class KnownEntities(val names: List<String> = emptyList(), val phones: List<String> = emptyList(), val emails: List<String> = emptyList(), val addresses: List<String> = emptyList())
data class Redaction(val text: String, val count: Int)

/** Deterministic redaction applied before any request that could reach the cloud. Known entities first, then generic patterns. */
fun redact(input: String, known: KnownEntities = KnownEntities()): Redaction {
    var text = input
    var count = 0
    fun sub(re: Regex, token: String) {
        text = re.replace(text) { count++; token }
    }
    fun list(items: List<String>, token: String) {
        for (item in items.filter { it.isNotBlank() }.sortedByDescending { it.length }) {
            sub(Regex(Regex.escape(item), RegexOption.IGNORE_CASE), token)
            if (token == "[CUSTOMER_NAME]") for (part in item.split(Regex("\\s+")).filter { it.length >= 3 }) sub(Regex("\\b${Regex.escape(part)}\\b", RegexOption.IGNORE_CASE), token)
        }
    }
    list(known.addresses, "[ADDRESS]")
    list(known.emails, "[EMAIL]")
    // generic e-mail pattern runs before names, so an address that contains the customer's name is removed whole
    sub(Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"), "[EMAIL]")
    list(known.phones, "[PHONE]")
    list(known.names, "[CUSTOMER_NAME]")
    text = Regex("\\+?\\d[\\d\\s().-]{7,}\\d").replace(text) { m ->
        val v = m.value
        if (v.count { it.isDigit() } < 7 || Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(v)) v else { count++; "[PHONE]" }
    }
    return Redaction(text, count)
}
