import Foundation
import Observation

struct CaseState {
    var run: RunResult? = nil
    var analysis: Analysis? = nil
    var validationError: String? = nil
    var evaluation: PolicyEvaluation? = nil
    var approval: Approval? = nil
    var busy = false
}

@MainActor
@Observable
final class AppModel {
    let engine = HybridEngine()
    var mode: PrivacyMode = .hybrid
    var role: UserRole = .agent
    var localModel: LocalModel = .unavailable
    var configLabel = "loading"
    var cases: [String: CaseState] = [:]
    var lab: [Preference: RunResult] = [:]
    var labBusy: Preference? = nil
    private var tasks: [String: Task<Void, Never>] = [:]

    func start() async {
        localModel = engine.localModelStatus()
        await engine.refreshConfig()
        configLabel = "\(engine.configSource) · \(engine.cloudModel) · cloud \(engine.cloudEnabled ? "on" : "off")"
    }

    func state(_ id: String) -> CaseState { cases[id] ?? CaseState() }

    /// Hybrid and Local only ask for on-device first; Cloud mode asks for the cloud model. The privacy gate may tighten it.
    private func preference(for mode: PrivacyMode) -> Preference { mode == .cloud ? .ONLY_IN_CLOUD : .PREFER_ON_DEVICE }

    func analyze(_ c: SupportCase) {
        guard !state(c.id).busy else { return }
        var s = state(c.id)
        s.busy = true
        cases[c.id] = s
        tasks[c.id] = Task {
            var run = await engine.run(prompt: analysisPrompt(c), preference: preference(for: mode), privacyMode: mode, entities: entitiesFor(c.order))
            guard !Task.isCancelled else { return }
            var next = state(c.id)
            next.analysis = nil
            next.validationError = nil
            if run.status == .success {
                switch parseAnalysis(run.text ?? "") {
                case let .success(a):
                    next.analysis = a
                    // The model only proposes: its suggestion is evaluated by the deterministic policy engine, never applied.
                    let eval = evaluatePolicy(a.suggestedAction, role: role, order: c.order)
                    next.evaluation = eval
                    next.approval = eval.decision == .REQUIRE_APPROVAL ? Approval(evaluation: eval) : nil
                case let .failure(e):
                    next.validationError = e.message
                    run.status = .failed_validation
                }
            }
            next.run = run
            next.busy = false
            cases[c.id] = next
        }
    }

    func cancel(_ c: SupportCase) {
        tasks[c.id]?.cancel()
        var s = state(c.id)
        s.busy = false
        cases[c.id] = s
    }

    func propose(_ c: SupportCase, _ action: ActionKind) {
        let eval = evaluatePolicy(action, role: role, order: c.order)
        var s = state(c.id)
        s.evaluation = eval
        s.approval = eval.decision == .REQUIRE_APPROVAL ? Approval(evaluation: eval) : nil
        cases[c.id] = s
    }

    private func update(_ c: SupportCase, _ next: Approval?) {
        guard let next else { return }
        var s = state(c.id)
        s.approval = next
        cases[c.id] = s
    }
    func approve(_ c: SupportCase) { update(c, state(c.id).approval?.approve(role)) }
    func reject(_ c: SupportCase) { update(c, state(c.id).approval?.reject(role)) }
    func execute(_ c: SupportCase) { update(c, state(c.id).approval?.execute()) }

    func runLab(_ pref: Preference) {
        guard labBusy == nil else { return }
        labBusy = pref
        Task {
            lab[pref] = await engine.run(prompt: labPrompt(LAB_TEXT), preference: pref, privacyMode: mode, entities: LAB_ENTITIES)
            labBusy = nil
            localModel = engine.localModelStatus()
        }
    }

    func refreshLocal() { localModel = engine.localModelStatus() }
}
