package app.bimoda.android.ai

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.ondevice.DownloadStatus
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
import com.google.firebase.ai.type.FirebaseAIOnDeviceNotAvailableException
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.remoteconfig.remoteConfig
import com.google.firebase.remoteconfig.remoteConfigSettings
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

enum class Source(val label: String) { ON_DEVICE("Processed on this device"), IN_CLOUD("Processed in cloud") }

/** Metadata about one run. The prompt text itself is never stored. */
data class RunResult(
    val status: RunStatus,
    val requested: Preference,
    val effective: Preference,
    val privacyMode: PrivacyMode,
    /** Read from the SDK response (inferenceSource); null when no model answered. */
    val source: Source? = null,
    val text: String? = null,
    val durationMs: Long = 0,
    val redactions: Int = 0,
    val error: String? = null,
)

enum class LocalModel(val label: String) { UNKNOWN("checking"), UNAVAILABLE("unavailable"), DOWNLOADABLE("downloadable"), DOWNLOADING("downloading"), AVAILABLE("available") }

/**
 * Thin wrapper over the Firebase AI Logic hybrid SDK. There is no custom router: the privacy gate ([planRoute])
 * decides which of the SDK's four modes may be requested, and the SDK decides where the answer is produced.
 */
@OptIn(PublicPreviewAPI::class)
class HybridEngine(private val context: Context) {
    var cloudModel: String = DEFAULT_CLOUD_MODEL
        private set
    var cloudEnabled: Boolean = true
        private set
    var timeoutMs: Long = 45_000
        private set
    var configSource: String = "defaults"
        private set

    /** Remote Config: cloud model name, timeout and the operator switch for cloud inference (same keys as the web app). */
    suspend fun refreshConfig() {
        try {
            val rc = Firebase.remoteConfig
            rc.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 600 }).await()
            rc.setDefaultsAsync(mapOf("cloud_model" to DEFAULT_CLOUD_MODEL, "ai_timeout_ms" to 45_000L, "cloud_inference_enabled" to true)).await()
            rc.fetchAndActivate().await()
            cloudModel = rc.getString("cloud_model").ifBlank { DEFAULT_CLOUD_MODEL }
            cloudEnabled = rc.getBoolean("cloud_inference_enabled")
            timeoutMs = rc.getLong("ai_timeout_ms").coerceIn(5_000, 120_000)
            configSource = "live"
        } catch (e: Exception) {
            configSource = "defaults (fetch failed)"
        }
    }

    fun isOnline(): Boolean {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return false
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    suspend fun localModelStatus(): LocalModel = try {
        when (FirebaseAIOnDevice.checkStatus()) {
            OnDeviceModelStatus.AVAILABLE -> LocalModel.AVAILABLE
            OnDeviceModelStatus.DOWNLOADABLE -> LocalModel.DOWNLOADABLE
            OnDeviceModelStatus.DOWNLOADING -> LocalModel.DOWNLOADING
            else -> LocalModel.UNAVAILABLE
        }
    } catch (e: Exception) {
        LocalModel.UNAVAILABLE
    }

    /** Starts the Gemini Nano download through AICore. Emits a short progress label; only a user action calls this. */
    fun downloadLocalModel(): Flow<String> = FirebaseAIOnDevice.download().map { s ->
        when (s) {
            is DownloadStatus.DownloadStarted -> "Download started"
            is DownloadStatus.DownloadInProgress -> "Downloading: ${s.totalBytesDownloaded / 1_000_000} MB"
            is DownloadStatus.DownloadCompleted -> "Download complete"
            is DownloadStatus.DownloadFailed -> "Download failed"
            else -> "Working"
        }
    }

    suspend fun run(prompt: String, preference: Preference, privacyMode: PrivacyMode, entities: KnownEntities = KnownEntities()): RunResult {
        val plan = planRoute(privacyMode, preference, cloudEnabled, isOnline())
        val base = RunResult(RunStatus.ERROR, preference, plan.effective, privacyMode)
        plan.blocked?.let { (status, reason) -> return base.copy(status = status, error = reason) }

        val redaction = if (plan.redact) redact(prompt, entities) else Redaction(prompt, 0)
        val mode = when (plan.effective) {
            Preference.PREFER_ON_DEVICE -> InferenceMode.PREFER_ON_DEVICE
            Preference.ONLY_ON_DEVICE -> InferenceMode.ONLY_ON_DEVICE
            Preference.PREFER_IN_CLOUD -> InferenceMode.PREFER_IN_CLOUD
            Preference.ONLY_IN_CLOUD -> InferenceMode.ONLY_IN_CLOUD
        }
        val started = System.currentTimeMillis()
        fun elapsed() = System.currentTimeMillis() - started
        return try {
            val model = Firebase.ai(backend = GenerativeBackend.googleAI())
                .generativeModel(modelName = cloudModel, onDeviceConfig = OnDeviceConfig(mode = mode, maxOutputTokens = 512))
            val response = withTimeout(timeoutMs) { model.generateContent(redaction.text) }
            val source = if (response.inferenceSource == InferenceSource.ON_DEVICE) Source.ON_DEVICE else Source.IN_CLOUD
            val text = response.text
            if (text.isNullOrBlank()) base.copy(status = RunStatus.ERROR, source = source, durationMs = elapsed(), redactions = redaction.count, error = "The model returned no text.")
            else base.copy(status = RunStatus.SUCCESS, source = source, text = text, durationMs = elapsed(), redactions = redaction.count)
        } catch (e: TimeoutCancellationException) {
            base.copy(status = RunStatus.TIMEOUT, durationMs = elapsed(), redactions = redaction.count, error = "No answer within ${timeoutMs / 1000}s. The request was cancelled.")
        } catch (e: FirebaseAIOnDeviceNotAvailableException) {
            base.copy(status = RunStatus.UNAVAILABLE, durationMs = elapsed(), redactions = redaction.count, error = "The on-device model is not available on this device. Nothing was sent to the cloud.")
        } catch (e: Exception) {
            base.copy(status = RunStatus.ERROR, durationMs = elapsed(), redactions = redaction.count, error = (e.message ?: e.javaClass.simpleName).take(220))
        }
    }

    companion object {
        const val DEFAULT_CLOUD_MODEL = "gemini-3.5-flash-lite"
    }
}
