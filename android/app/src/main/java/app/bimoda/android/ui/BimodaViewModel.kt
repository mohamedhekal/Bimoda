package app.bimoda.android.ui

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.bimoda.android.ai.Analysis
import app.bimoda.android.ai.HybridEngine
import app.bimoda.android.ai.LAB_ENTITIES
import app.bimoda.android.ai.LAB_TEXT
import app.bimoda.android.ai.LocalModel
import app.bimoda.android.ai.Preference
import app.bimoda.android.ai.PrivacyMode
import app.bimoda.android.ai.RunResult
import app.bimoda.android.ai.RunStatus
import app.bimoda.android.ai.analysisPrompt
import app.bimoda.android.ai.entitiesFor
import app.bimoda.android.ai.labPrompt
import app.bimoda.android.ai.parseAnalysis
import app.bimoda.android.domain.ActionKind
import app.bimoda.android.domain.Approval
import app.bimoda.android.domain.Case
import app.bimoda.android.domain.Decision
import app.bimoda.android.domain.PolicyEvaluation
import app.bimoda.android.domain.Role
import app.bimoda.android.domain.evaluatePolicy
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

data class CaseState(
    val run: RunResult? = null,
    val analysis: Analysis? = null,
    val validationError: String? = null,
    val evaluation: PolicyEvaluation? = null,
    val approval: Approval? = null,
    val busy: Boolean = false,
)

class BimodaViewModel(app: Application) : AndroidViewModel(app) {
    val engine = HybridEngine(app)

    var mode by mutableStateOf(PrivacyMode.HYBRID)
    var role by mutableStateOf(Role.AGENT)
    var localModel by mutableStateOf(LocalModel.UNKNOWN)
    var downloadLabel by mutableStateOf<String?>(null)
    var configLabel by mutableStateOf("loading")
    val cases = mutableStateMapOf<String, CaseState>()
    val lab = mutableStateMapOf<Preference, RunResult>()
    var labBusy by mutableStateOf<Preference?>(null)
    private var job: Job? = null

    init {
        viewModelScope.launch {
            localModel = engine.localModelStatus()
            engine.refreshConfig()
            configLabel = "${engine.configSource} · ${engine.cloudModel} · cloud ${if (engine.cloudEnabled) "on" else "off"}"
        }
    }

    fun state(id: String) = cases[id] ?: CaseState()

    /** Hybrid and Local only ask for on-device first; Cloud mode asks for the cloud model. The privacy gate may tighten it. */
    private fun preferenceFor(mode: PrivacyMode) = if (mode == PrivacyMode.CLOUD) Preference.ONLY_IN_CLOUD else Preference.PREFER_ON_DEVICE

    fun analyze(c: Case) {
        if (state(c.id).busy) return
        cases[c.id] = state(c.id).copy(busy = true)
        job = viewModelScope.launch {
            val run = engine.run(analysisPrompt(c), preferenceFor(mode), mode, entitiesFor(c.order))
            var analysis: Analysis? = null
            var err: String? = null
            var finalRun = run
            if (run.status == RunStatus.SUCCESS) {
                parseAnalysis(run.text.orEmpty()).fold({ analysis = it }, { err = it.message ?: "Invalid output"; finalRun = run.copy(status = RunStatus.FAILED_VALIDATION) })
            }
            val prev = state(c.id)
            // The model only proposes: its suggestion is evaluated by the deterministic policy engine, never applied.
            val eval = analysis?.let { evaluatePolicy(it.suggestedAction, role, c.order) } ?: prev.evaluation
            cases[c.id] = prev.copy(run = finalRun, analysis = analysis, validationError = err, evaluation = eval, approval = approvalFor(eval, prev), busy = false)
        }
    }

    fun cancel(c: Case) {
        job?.cancel()
        cases[c.id] = state(c.id).copy(busy = false)
    }

    fun propose(c: Case, action: ActionKind) {
        val eval = evaluatePolicy(action, role, c.order)
        cases[c.id] = state(c.id).copy(evaluation = eval, approval = if (eval.decision == Decision.REQUIRE_APPROVAL) Approval(eval) else null)
    }

    private fun approvalFor(eval: PolicyEvaluation?, prev: CaseState): Approval? =
        if (eval != null && eval.decision == Decision.REQUIRE_APPROVAL) Approval(eval) else if (eval == prev.evaluation) prev.approval else null

    fun approve(c: Case) = state(c.id).approval?.approve(role)?.let { cases[c.id] = state(c.id).copy(approval = it) }
    fun reject(c: Case) = state(c.id).approval?.reject(role)?.let { cases[c.id] = state(c.id).copy(approval = it) }
    fun execute(c: Case) = state(c.id).approval?.execute()?.let { cases[c.id] = state(c.id).copy(approval = it) }

    fun runLab(pref: Preference) {
        if (labBusy != null) return
        labBusy = pref
        viewModelScope.launch {
            lab[pref] = engine.run(labPrompt(LAB_TEXT), pref, mode, LAB_ENTITIES)
            labBusy = null
            localModel = engine.localModelStatus()
        }
    }

    fun enableLocalAi() {
        viewModelScope.launch {
            try {
                engine.downloadLocalModel().collect { downloadLabel = it }
            } catch (e: Exception) {
                downloadLabel = "Not supported on this device"
            }
            localModel = engine.localModelStatus()
        }
    }

    fun refreshLocal() = viewModelScope.launch { localModel = engine.localModelStatus() }
}
