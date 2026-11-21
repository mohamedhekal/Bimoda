import SwiftUI

private enum Tab: String, CaseIterable { case desk = "Cases", lab = "Hybrid AI Lab" }

struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var tab: Tab = .desk
    @State private var path: [String] = []

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            TopBar(showBack: !path.isEmpty) { path.removeAll() }
            RouteSwitch(mode: $model.mode).padding(.horizontal, 16).padding(.bottom, 10)
            NavigationStack(path: $path) {
                Group {
                    if tab == .desk { DeskScreen { path = [$0.id] } } else { LabScreen() }
                }
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: String.self) { id in
                    if let c = CASES.first(where: { $0.id == id }) {
                        CaseScreen(c: c).toolbar(.hidden, for: .navigationBar)
                    }
                }
            }
            if path.isEmpty { BottomTabs(tab: $tab) }
        }
        .background(Dock.bg.ignoresSafeArea())
        .tint(Dock.accent)
    }
}

private struct TopBar: View {
    @Environment(AppModel.self) private var model
    let showBack: Bool
    let onBack: () -> Void
    var body: some View {
        HStack(spacing: 8) {
            if showBack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left").font(.system(size: 20, weight: .bold)).foregroundStyle(Dock.accent).frame(width: 40, height: 44)
                }
                .accessibilityLabel("Back to cases")
            }
            Mark()
            Text("Bimoda").font(T.display(26)).foregroundStyle(Dock.text)
            Spacer()
            // Role is part of the demo: approvals depend on who is acting.
            Button {
                model.role = model.role == .agent ? .manager : .agent
            } label: {
                HStack(spacing: 0) {
                    Text("Acting as ").font(T.small).foregroundStyle(Dock.muted)
                    Text(model.role.rawValue).font(T.bold(14)).foregroundStyle(Dock.accent)
                }
                .padding(.horizontal, 12).frame(minHeight: 40)
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Dock.line, lineWidth: 1))
            }
            .accessibilityLabel("Acting as \(model.role.rawValue). Switch role")
        }
        .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 12)
    }
}

private struct BottomTabs: View {
    @Binding var tab: Tab
    var body: some View {
        HStack(spacing: 8) {
            ForEach(Tab.allCases, id: \.self) { t in
                let on = t == tab
                Button { tab = t } label: {
                    Text(t.rawValue).font(on ? T.bold() : T.body()).foregroundStyle(on ? Dock.text : Dock.muted)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(on ? Dock.surface2 : .clear, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.horizontal, 12).padding(.top, 8)
        .background(Dock.surface.ignoresSafeArea(edges: .bottom))
    }
}

private func priorityColor(_ p: Priority) -> Color {
    switch p {
    case .critical: Dock.stop
    case .high: Dock.accent
    case .medium: Dock.info
    case .low: Dock.muted
    }
}

// MARK: - Cases

private struct DeskScreen: View {
    @Environment(AppModel.self) private var model
    let onOpen: (SupportCase) -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("Today’s cases").font(T.display(34)).foregroundStyle(Dock.text)
                Text("Six synthetic cases. Open one, let Bimoda read it, then let policy decide.").font(T.small).foregroundStyle(Dock.muted).padding(.bottom, 4)
                ForEach(CASES) { c in
                    Button { onOpen(c) } label: {
                        HStack(spacing: 0) {
                            Rectangle().fill(priorityColor(c.priority)).frame(width: 6)
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(c.order.id).font(T.display(22)).foregroundStyle(Dock.text)
                                    Spacer()
                                    if let e = model.state(c.id).evaluation { Stamp(decision: e.decision) } else { Chip(text: c.priority.rawValue, color: priorityColor(c.priority)) }
                                }
                                Text(c.lastCustomerText).font(T.body(14)).foregroundStyle(Dock.muted).lineLimit(2).multilineTextAlignment(.leading)
                                HStack(spacing: 6) {
                                    Chip(text: c.type)
                                    Chip(text: c.order.fulfillment.label.replacingOccurrences(of: "_", with: " "))
                                }
                            }
                            .padding(14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .background(Dock.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Dock.line.opacity(0.5), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens the case")
                }
                Text("Synthetic demo data. No real payments, refunds or messages are executed.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 8)
            }
            .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 20)
        }
        .background(Dock.bg)
    }
}

// MARK: - One case

private struct CaseScreen: View {
    @Environment(AppModel.self) private var model
    let c: SupportCase
    @State private var action: ActionKind = .CHANGE_VARIANT
    @State private var stampScale: CGFloat = 1

    var body: some View {
        let st = model.state(c.id)
        let t = computeTotals(c.order)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Docket {
                    Text("Case \(c.id)").font(T.label).foregroundStyle(Dock.paperMuted)
                    Text(c.order.id).font(T.display(44)).foregroundStyle(Dock.paperInk)
                    HStack(spacing: 6) {
                        Chip(text: c.type, color: Dock.paperMuted)
                        Chip(text: c.order.fulfillment.label.replacingOccurrences(of: "_", with: " "), color: Dock.paperMuted)
                    }
                    .padding(.top, 6)
                    // The stamp gets its own line so a long decision never covers the order number.
                    if let e = st.evaluation {
                        VStack(alignment: .trailing, spacing: 8) {
                            Stamp(decision: e.decision, large: true, onPaper: true).scaleEffect(stampScale)
                            Text(e.action.label.lowercased()).font(T.mono(11)).foregroundStyle(Dock.paperMuted)
                        }
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .padding(.top, 10).padding(.trailing, 4)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(c.messages.enumerated()), id: \.offset) { _, m in
                            HStack(alignment: .top, spacing: 10) {
                                Rectangle().fill(m.fromCustomer ? Dock.paperInk : Dock.paperLine).frame(width: 3)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(m.fromCustomer ? c.order.customer.displayName : "Agent").font(T.label).foregroundStyle(Dock.paperMuted)
                                    Text(m.text).font(T.body(16)).foregroundStyle(Dock.paperInk).lineSpacing(3)
                                }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.top, 14)
                    DashedRule().padding(.vertical, 12)
                    ForEach(Array(c.order.items.enumerated()), id: \.offset) { _, i in
                        HStack {
                            Text("\(i.qty)× \(i.name) (\(i.variant))").font(T.body(14))
                            Spacer()
                            Text(money(i.unitPriceCents * i.qty)).font(T.figure(14))
                        }
                        .foregroundStyle(Dock.paperInk).padding(.vertical, 2)
                    }
                    HStack {
                        Text(t.freeShippingApplied ? "Total · free shipping applied" : "Total · shipping \(money(t.shippingFeeCents))").font(T.bold(14))
                        Spacer()
                        Text(money(t.totalCents)).font(T.figure())
                    }
                    .foregroundStyle(Dock.paperInk).padding(.top, 6)
                    if let stated = c.order.statedTotalCents, stated != t.totalCents {
                        Text("Confirmation message stated \(money(stated)); the calculated total is \(money(t.totalCents)).").font(T.small).foregroundStyle(Dock.paperStop).padding(.top, 6)
                    }
                    if let rc = c.order.returnCase {
                        Text("Return: pickup \(rc.pickup.replacingOccurrences(of: "_", with: " ")), warehouse receipt \(rc.warehouseReceipt.replacingOccurrences(of: "_", with: " ")).").font(T.small).foregroundStyle(Dock.paperMuted).padding(.top, 6)
                    }
                }

                // 1. read
                Panel {
                    StepHeader(n: 1, title: "Read the case")
                    HStack(spacing: 8) {
                        Button(st.busy ? "Working…" : "Analyze conversation") { model.analyze(c) }.buttonStyle(PrimaryButtonStyle()).disabled(st.busy)
                        if st.busy { Button("Cancel") { model.cancel(c) }.buttonStyle(GhostButtonStyle()).frame(width: 96) }
                    }
                    .padding(.top, 10)
                    Text("Runs a real Firebase AI Logic request in \(model.mode.rawValue) mode. Customer text is treated as untrusted data.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 8)
                    if let r = st.run {
                        RunHeader(r: r).padding(.top, 12)
                        if let a = st.analysis {
                            if a.suspectedPromptInjection {
                                Text("Possible prompt-injection attempt detected in the customer text. It was treated as data and not followed.")
                                    .font(T.body(14)).foregroundStyle(Dock.stop).padding(10).frame(maxWidth: .infinity, alignment: .leading)
                                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Dock.stop.opacity(0.5), lineWidth: 1)).padding(.top, 10)
                            }
                            Text(a.summary).font(T.body()).foregroundStyle(Dock.text).padding(.vertical, 10)
                            KeyValue(key: "Intent", value: a.intent)
                            KeyValue(key: "Main issue", value: a.mainIssue)
                            KeyValue(key: "Urgency", value: a.urgency)
                            KeyValue(key: "Suggested", value: a.suggestedAction.rawValue, valueColor: Dock.hold)
                            Text("AI interpretation, not a calibrated confidence. The policy engine decides what is allowed.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 8)
                        }
                        if let err = st.validationError {
                            Text("The answer failed validation and was not used: \(err)").font(T.body(14)).foregroundStyle(Dock.stop).padding(.top, 8)
                        }
                        if r.status != .success, r.status != .failed_validation, let e = r.error {
                            Text(e).font(T.body(14)).foregroundStyle(Dock.accent).padding(.top, 8)
                        }
                    }
                }

                // 2. policy
                Panel {
                    StepHeader(n: 2, title: "Check policy")
                    FlowLayout(spacing: 8) {
                        ForEach(ActionKind.allCases) { k in
                            let on = k == action
                            Button { action = k } label: {
                                Text(k.label).font(on ? T.bold(14) : T.body(14)).foregroundStyle(on ? Dock.onAccent : Dock.text)
                                    .padding(.horizontal, 12).frame(minHeight: 44)
                                    .background(on ? Dock.accent : Dock.surface2, in: RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    }
                    .padding(.top, 10)
                    Button("Propose “\(action.label)”") { model.propose(c, action) }.buttonStyle(GhostButtonStyle()).padding(.top, 10)
                        .sensoryFeedback(.impact(weight: .heavy), trigger: st.evaluation)
                    if let e = st.evaluation {
                        HStack(spacing: 10) {
                            Stamp(decision: e.decision)
                            Text("\(e.ruleId) · policy v\(e.policyVersion)").font(T.mono()).foregroundStyle(Dock.muted)
                        }
                        .padding(.top, 12)
                        Text(e.explanation).font(T.body()).foregroundStyle(Dock.text).padding(.top, 8)
                        Text(e.enforcement).font(T.small).foregroundStyle(Dock.muted)
                    } else {
                        Text("Fixed rules decide, not the model. Try “Change variant” on a shipped order.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 8)
                    }
                }

                // 3. approve
                Panel {
                    StepHeader(n: 3, title: "Approve")
                    Group {
                        if let e = st.evaluation {
                            switch e.decision {
                            case .DENY: Text("No approval path: a DENY cannot be overridden by approving it. Route to manual review.").font(T.body(14)).foregroundStyle(Dock.text)
                            case .NEED_MORE_INFORMATION: Text("Waiting for information from the customer before any change.").font(T.body(14)).foregroundStyle(Dock.text)
                            case .ALLOW: Text("Permitted by policy. Nothing real is changed in this demo.").font(T.body(14)).foregroundStyle(Dock.text)
                            case .REQUIRE_APPROVAL:
                                if let ap = st.approval { ApprovalBlock(c: c, e: e, ap: ap) }
                            }
                        } else {
                            Text("Nothing proposed yet.").font(T.small).foregroundStyle(Dock.muted)
                        }
                    }
                    .padding(.top, 8)
                }

                // why this outcome
                Panel {
                    Text("Decision trace").font(T.title).foregroundStyle(Dock.text).accessibilityAddTraits(.isHeader)
                    TraceRow(color: Dock.muted, title: "Customer request", kind: "Customer text (untrusted)", text: c.lastCustomerText).padding(.top, 8)
                    TraceRow(color: Dock.hold, title: "AI interpretation", kind: "Model-generated", text: st.analysis.map { "\($0.intent); suggests \($0.suggestedAction.rawValue)" } ?? "Not analyzed yet.")
                    TraceRow(color: Dock.info, title: "Verified facts", kind: "Deterministic rule", text: "Order \(c.order.id) is \"\(c.order.fulfillment.label)\"; total \(money(t.totalCents)).")
                    TraceRow(color: Dock.info, title: "Policy evaluation", kind: "Deterministic rule", text: st.evaluation.map { "\($0.decision.rawValue): \($0.explanation)" } ?? "No action evaluated yet.")
                    TraceRow(color: Dock.accent, title: "Authorization", kind: "Human decision", text: st.approval.map { "\($0.state.rawValue)\($0.decidedBy.map { " by \($0.rawValue)" } ?? "")" } ?? "No approval record.")
                    Text("Model-generated text explains and proposes. Only the deterministic policy decision and a human approval can allow an action.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 6)
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 28)
        }
        .background(Dock.bg)
        .onChange(of: st.evaluation) { _, new in
            guard new != nil else { return }
            stampScale = 2.2
            withAnimation(.spring(response: 0.28, dampingFraction: 0.55)) { stampScale = 1 }
        }
    }
}

private struct ApprovalBlock: View {
    @Environment(AppModel.self) private var model
    let c: SupportCase
    let e: PolicyEvaluation
    let ap: Approval
    var body: some View {
        let allowed = canApprove(model.role, e)
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(e.action.label).font(T.bold()).foregroundStyle(Dock.text)
                Spacer()
                Chip(text: ap.state.rawValue, color: ap.state == .rejected ? Dock.stop : ap.state == .pending ? Dock.accent : Dock.go)
            }
            switch ap.state {
            case .pending:
                if !allowed {
                    Text("Needs manager or admin. You are acting as \(model.role.rawValue).").font(T.body(14)).foregroundStyle(Dock.accent).padding(.top, 6)
                }
                HStack(spacing: 8) {
                    Button("Approve") { model.approve(c) }.buttonStyle(PrimaryButtonStyle()).disabled(!allowed)
                    Button("Reject") { model.reject(c) }.buttonStyle(GhostButtonStyle()).disabled(!allowed)
                }
                .padding(.top, 10)
            case .approved:
                Button("Execute (simulated)") { model.execute(c) }.buttonStyle(PrimaryButtonStyle()).padding(.top, 10)
            case .executed:
                Text("Simulated in demo: no payment, shipment, inventory or customer message was actually changed or sent.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 8)
            case .rejected:
                Text("Rejected by \(ap.decidedBy?.rawValue ?? "reviewer").").font(T.small).foregroundStyle(Dock.muted).padding(.top, 8)
            }
        }
    }
}

private struct TraceRow: View {
    let color: Color
    let title: String
    let kind: String
    let text: String
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Rectangle().fill(color).frame(width: 3)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(title).font(T.bold(14)).foregroundStyle(Dock.text)
                    Chip(text: kind, color: color)
                }
                Text(text).font(T.small).foregroundStyle(Dock.muted).lineLimit(3)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 5)
    }
}

private struct RunHeader: View {
    let r: RunResult
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if let s = r.source { SourceBadge(source: s) } else { Chip(text: "No model output") }
                Chip(text: r.status.rawValue, color: r.status == .success ? Dock.go : r.status == .blocked_privacy ? Dock.stop : Dock.accent)
                Text("\(String(r.durationMs)) ms").font(T.mono()).foregroundStyle(Dock.muted)
            }
            Text("\(r.requested.rawValue) → \(r.effective.rawValue)\(r.redactions > 0 ? " · redacted ×\(r.redactions)" : "")").font(T.mono(11)).foregroundStyle(Dock.muted)
        }
    }
}

// MARK: - Lab

private struct LabScreen: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Hybrid AI Lab").font(T.display(34)).foregroundStyle(Dock.text)
                    Text("Same synthetic case, three inference preferences. Results are real SDK executions; unavailable paths show as unavailable, never as fabricated output.").font(T.small).foregroundStyle(Dock.muted)
                }
                Panel {
                    HStack {
                        Text("Local AI (Apple Intelligence)").font(T.title).foregroundStyle(Dock.text)
                        Spacer()
                        Chip(text: model.localModel.rawValue, color: model.localModel == .available ? Dock.go : Dock.accent)
                    }
                    Text("Apple Foundation Models through Firebase AI Logic. The status comes from the SDK; an app cannot download the model or switch Apple Intelligence on.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 4).padding(.bottom, 10)
                    if model.localModel != .available {
                        Text(localHint(model.localModel)).font(T.body(14)).foregroundStyle(Dock.accent).padding(.bottom, 10)
                    }
                    Button("Check again") { model.refreshLocal() }.buttonStyle(GhostButtonStyle()).padding(.bottom, 10)
                    KeyValue(key: "Privacy mode", value: model.mode.rawValue)
                    KeyValue(key: "App Check", value: appCheckMode)
                    KeyValue(key: "Remote Config", value: model.configLabel)
                }
                Docket {
                    Text("Synthetic case").font(T.label).foregroundStyle(Dock.paperMuted)
                    Text(LAB_TEXT).font(T.body(16)).foregroundStyle(Dock.paperInk).lineSpacing(3).padding(.top, 6)
                }
                LabTest(title: "Test A · Local inference", text: "Never leaves the device. Fails if the on-device model is unavailable.", pref: .ONLY_ON_DEVICE, glyph: .localOnly, short: "A")
                LabTest(title: "Test B · Cloud inference", text: "Firebase AI Logic cloud model. Redacted unless you consented.", pref: .ONLY_IN_CLOUD, glyph: .cloud, short: "B")
                LabTest(title: "Test C · Hybrid inference", text: "SDK tries on-device, falls back to cloud. Source is read from the response.", pref: .PREFER_ON_DEVICE, glyph: .hybrid, short: "C")
                Panel {
                    Text("Routing plan for \(model.mode.rawValue)").font(T.title).foregroundStyle(Dock.text)
                    Text("The same function the engine runs. It decides what is allowed; the SDK decides where the answer is produced.").font(T.small).foregroundStyle(Dock.muted).padding(.top, 4).padding(.bottom, 8)
                    ForEach(Preference.allCases, id: \.self) { p in
                        let plan = planRoute(privacyMode: model.mode, preference: p, cloudEnabled: model.engine.cloudEnabled, online: true)
                        HStack {
                            Text(p.rawValue).font(T.mono(11)).foregroundStyle(Dock.muted)
                            Spacer()
                            if plan.blocked != nil {
                                Chip(text: "Blocked", color: Dock.stop)
                            } else if !plan.mayReachCloud {
                                Text("Stays on device").font(T.bold(12)).foregroundStyle(Dock.bg).padding(.horizontal, 8).padding(.vertical, 4).background(Dock.text, in: RoundedRectangle(cornerRadius: 6))
                            } else {
                                Text("Cloud-capable, redacted").font(T.bold(12)).foregroundStyle(Dock.text).padding(.horizontal, 8).padding(.vertical, 4)
                                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Dock.text, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                            }
                        }
                        .padding(.vertical, 5)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 24)
        }
        .background(Dock.bg)
    }

    private func localHint(_ s: LocalModel) -> String {
        switch s {
        case .deviceNotEligible: "This device is not eligible for Apple Intelligence. Hybrid mode falls back to the cloud; Local only reports unavailable."
        case .notEnabled: "Apple Intelligence is switched off. Turn it on in Settings to run on this device."
        case .notReady: "The on-device model is still downloading. Try again in a few minutes."
        default: "The on-device model is unavailable. Hybrid mode falls back to the cloud; Local only reports unavailable."
        }
    }
}

private struct LabTest: View {
    @Environment(AppModel.self) private var model
    let title: String
    let text: String
    let pref: Preference
    let glyph: PrivacyMode
    let short: String
    var body: some View {
        let busy = model.labBusy == pref
        Panel {
            HStack(spacing: 8) {
                RouteGlyph(mode: glyph)
                Text(title).font(T.title).foregroundStyle(Dock.text)
            }
            Text(text).font(T.small).foregroundStyle(Dock.muted).padding(.top, 4).padding(.bottom, 10)
            if let r = model.lab[pref] {
                RunHeader(r: r)
                if let out = r.text {
                    Text(out.trimmingCharacters(in: .whitespacesAndNewlines)).font(T.mono()).foregroundStyle(Dock.text)
                        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Dock.bg, in: RoundedRectangle(cornerRadius: 10)).padding(.top, 10)
                }
                if let e = r.error { Text(e).font(T.body(14)).foregroundStyle(Dock.accent).padding(.top, 8) }
                Spacer().frame(height: 10)
            }
            Button(busy ? "Running…" : "Run \(short)") { model.runLab(pref) }.buttonStyle(GhostButtonStyle()).disabled(model.labBusy != nil)
        }
    }
}
