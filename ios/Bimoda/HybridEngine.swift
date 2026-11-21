import FirebaseAILogic
import FirebaseRemoteConfig
import Foundation
import Network

enum InferenceSource: String { case onDevice = "Processed on this device", inCloud = "Processed in cloud" }

/// Metadata about one run. The prompt text itself is never stored.
struct RunResult {
    var status: RunStatus
    let requested: Preference
    let effective: Preference
    let privacyMode: PrivacyMode
    /// Derived from the SDK response (rawResponse.modelVersion); nil when no model answered.
    var source: InferenceSource? = nil
    var text: String? = nil
    var durationMs: Int = 0
    var redactions: Int = 0
    var error: String? = nil
}

enum LocalModel: String {
    case available, deviceNotEligible = "device not eligible", notEnabled = "Apple Intelligence off", notReady = "model not ready", unavailable
}

private struct TimeoutError: Error {}

/// Thin wrapper over the Firebase AI Logic hybrid SDK for Apple platforms. There is no custom router: the privacy
/// gate (`planRoute`) decides which model combination may be requested, and the SDK decides where the answer is produced.
@MainActor
final class HybridEngine {
    static let defaultCloudModel = "gemini-3.5-flash-lite"
    /// Model version string the SDK reports for Apple's on-device system model.
    static let onDeviceModelVersion = "apple-foundation-models-system-language-model"

    private(set) var cloudModel = HybridEngine.defaultCloudModel
    private(set) var cloudEnabled = true
    private(set) var timeoutSeconds: Double = 45
    private(set) var configSource = "defaults"
    private var online = true
    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in self?.online = path.status == .satisfied }
        }
        monitor.start(queue: DispatchQueue(label: "bimoda.network"))
    }

    /// Remote Config: cloud model name, timeout and the operator switch for cloud inference (same keys as the web app).
    func refreshConfig() async {
        let rc = RemoteConfig.remoteConfig()
        let settings = RemoteConfigSettings()
        settings.minimumFetchInterval = 600
        rc.configSettings = settings
        rc.setDefaults(["cloud_model": HybridEngine.defaultCloudModel as NSObject, "ai_timeout_ms": 45_000 as NSObject, "cloud_inference_enabled": true as NSObject])
        do {
            _ = try await rc.fetchAndActivate()
            let name = rc.configValue(forKey: "cloud_model").stringValue
            cloudModel = name.isEmpty ? HybridEngine.defaultCloudModel : name
            cloudEnabled = rc.configValue(forKey: "cloud_inference_enabled").boolValue
            timeoutSeconds = min(120, max(5, rc.configValue(forKey: "ai_timeout_ms").numberValue.doubleValue / 1000))
            configSource = "live"
        } catch {
            configSource = "defaults (fetch failed)"
        }
    }

    /// Status of Apple's on-device model, read from the SDK. An app cannot download it or enable Apple Intelligence.
    func localModelStatus() -> LocalModel {
        switch FirebaseAI.SystemLanguageModel.default.availability {
        case .available: return .available
        case .unavailable(.deviceNotEligible): return .deviceNotEligible
        case .unavailable(.appleIntelligenceNotEnabled): return .notEnabled
        case .unavailable(.modelNotReady): return .notReady
        default: return .unavailable
        }
    }

    /// Turns an SDK error into one plain sentence for the screen; the raw dump stays out of the UI.
    static func readable(_ error: Error) -> String {
        let raw = String(describing: error)
        if raw.contains("App Check") {
            return "Firebase App Check rejected this app. Register this build's debug token in the Firebase console (see ios/README.md), then try again."
        }
        if raw.contains("429") || raw.localizedCaseInsensitiveContains("quota") || raw.localizedCaseInsensitiveContains("resourceExhausted") {
            return "The cloud model is rate limited right now. Wait a minute and try again."
        }
        if let r = raw.range(of: "message: \"[^\"]+\"", options: .regularExpression) {
            return String(raw[r].dropFirst(10).dropLast(1).prefix(200))
        }
        return String(raw.prefix(200))
    }

    private func gemini() -> GeminiModelProvider { .geminiModel(name: cloudModel) }
    private func system() -> FirebaseAI.SystemLanguageModel { FirebaseAI.SystemLanguageModel.default }
    private func hybrid(_ primary: any LanguageModelProvider, _ secondary: any LanguageModelProvider) -> HybridModelProvider {
        .hybridModel(primary: primary, secondary: secondary)
    }

    func run(prompt: String, preference: Preference, privacyMode: PrivacyMode, entities: KnownEntities = KnownEntities()) async -> RunResult {
        let plan = planRoute(privacyMode: privacyMode, preference: preference, cloudEnabled: cloudEnabled, online: online)
        var result = RunResult(status: .error, requested: preference, effective: plan.effective, privacyMode: privacyMode)
        if let blocked = plan.blocked {
            result.status = blocked.status
            result.error = blocked.reason
            return result
        }
        let redaction = plan.redact ? redact(prompt, known: entities) : Redaction(text: prompt, count: 0)
        result.redactions = redaction.count

        // ONLY_ON_DEVICE configures the system model alone: no cloud model exists in the session, so nothing can be sent.
        if plan.effective == .ONLY_ON_DEVICE && !FirebaseAI.SystemLanguageModel.default.isAvailable {
            result.status = .unavailable
            result.error = "The on-device model is not available on this device (\(localModelStatus().rawValue)). Nothing was sent to the cloud."
            return result
        }
        let model: any LanguageModelProvider
        switch plan.effective {
        case .PREFER_ON_DEVICE: model = hybrid(system(), gemini())
        case .ONLY_ON_DEVICE: model = system()
        case .PREFER_IN_CLOUD: model = hybrid(gemini(), system())
        case .ONLY_IN_CLOUD: model = gemini()
        }
        let ai = FirebaseAI.firebaseAI(backend: .googleAI())
        // A session keeps chat history, so every request gets a new one (single turn).
        let session = ai.generativeModelSession(model: model)
        let started = Date()
        let text = redaction.text
        let limit = timeoutSeconds
        do {
            let (content, version) = try await withThrowingTaskGroup(of: (String, String?).self) { group in
                group.addTask {
                    let response = try await session.respond(to: text)
                    let version: String? = response.rawResponse.modelVersion
                    return (response.content, version)
                }
                group.addTask {
                    try await Task.sleep(nanoseconds: UInt64(limit * 1_000_000_000))
                    throw TimeoutError()
                }
                guard let first = try await group.next() else { throw TimeoutError() }
                group.cancelAll()
                return first
            }
            result.durationMs = Int(Date().timeIntervalSince(started) * 1000)
            result.source = version == HybridEngine.onDeviceModelVersion ? .onDevice : .inCloud
            if content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                result.error = "The model returned no text."
            } else {
                result.status = .success
                result.text = content
            }
        } catch is TimeoutError {
            result.durationMs = Int(Date().timeIntervalSince(started) * 1000)
            result.status = .timeout
            result.error = "No answer within \(Int(limit))s. The request was cancelled."
        } catch is CancellationError {
            result.status = .error
            result.error = "Cancelled."
        } catch {
            result.durationMs = Int(Date().timeIntervalSince(started) * 1000)
            if plan.effective == .ONLY_ON_DEVICE {
                // Only the system model was configured, so a failure here is a local failure: there is no cloud to fall back to.
                result.status = .unavailable
                result.error = "The on-device model could not run on this device (Apple Intelligence reported an error). Nothing was sent to the cloud."
            } else {
                result.error = HybridEngine.readable(error)
            }
        }
        return result
    }
}
