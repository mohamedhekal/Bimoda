package app.bimoda.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.bimoda.android.APP_CHECK_MODE
import app.bimoda.android.ai.LAB_TEXT
import app.bimoda.android.ai.LocalModel
import app.bimoda.android.ai.Preference
import app.bimoda.android.ai.PrivacyMode
import app.bimoda.android.ai.RunResult
import app.bimoda.android.ai.RunStatus
import app.bimoda.android.ai.planRoute
import app.bimoda.android.domain.ActionKind
import app.bimoda.android.domain.ApprovalState
import app.bimoda.android.domain.CASES
import app.bimoda.android.domain.Case
import app.bimoda.android.domain.Decision
import app.bimoda.android.domain.Priority
import app.bimoda.android.domain.canApprove
import app.bimoda.android.domain.computeTotals
import app.bimoda.android.domain.money
import app.bimoda.android.domain.Role as UserRole

private enum class Tab(val label: String) { DESK("Cases"), LAB("Hybrid AI Lab") }

@Composable
fun BimodaRoot(vm: BimodaViewModel = viewModel()) {
    var tab by rememberSaveable { mutableStateOf(Tab.DESK) }
    var openId by rememberSaveable { mutableStateOf<String?>(null) }
    val open = CASES.firstOrNull { it.id == openId }
    BackHandler(enabled = open != null) { openId = null }

    Column(Modifier.fillMaxSize().background(Dock.Bg).statusBarsPadding().navigationBarsPadding()) {
        TopBar(vm, showBack = open != null, onBack = { openId = null })
        RouteSwitch(vm.mode, { vm.mode = it }, Modifier.padding(horizontal = 16.dp))
        Spacer(Modifier.height(10.dp))
        AnimatedContent(
            targetState = open?.id ?: tab.name,
            transitionSpec = {
                val forward = targetState.startsWith("CV")
                (slideInHorizontally { if (forward) it / 5 else -it / 5 } + fadeIn()) togetherWith (slideOutHorizontally { if (forward) -it / 5 else it / 5 } + fadeOut())
            },
            modifier = Modifier.weight(1f),
            label = "screen",
        ) { key ->
            val c = CASES.firstOrNull { it.id == key }
            when {
                c != null -> CaseScreen(vm, c)
                key == Tab.LAB.name -> LabScreen(vm)
                else -> DeskScreen(vm) { openId = it.id }
            }
        }
        if (open == null) BottomTabs(tab) { tab = it }
    }
}

@Composable
private fun TopBar(vm: BimodaViewModel, showBack: Boolean, onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        if (showBack) {
            Text("‹", style = Type.display.copy(fontSize = 34.sp, color = Dock.Accent), modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClickLabel = "Back to cases", role = Role.Button, onClick = onBack).padding(horizontal = 10.dp))
            Spacer(Modifier.width(4.dp))
        }
        Mark()
        Spacer(Modifier.width(8.dp))
        Text("Bimoda", style = Type.display.copy(fontSize = 26.sp), modifier = Modifier.weight(1f))
        // Role is part of the demo: approvals depend on who is acting.
        Row(
            Modifier.clip(RoundedCornerShape(10.dp)).border(1.dp, Dock.Line, RoundedCornerShape(10.dp))
                .clickable(onClickLabel = "Switch role", role = Role.Button) { vm.role = if (vm.role == UserRole.AGENT) UserRole.MANAGER else UserRole.AGENT }
                .padding(horizontal = 12.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Acting as ", style = Type.small)
            Text(vm.role.label, style = Type.bodyBold.copy(fontSize = 14.sp, color = Dock.Accent))
        }
    }
}

@Composable
private fun BottomTabs(tab: Tab, onSelect: (Tab) -> Unit) {
    Row(Modifier.fillMaxWidth().background(Dock.Surface).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Tab.entries.forEach { t ->
            val on = t == tab
            Box(
                Modifier.weight(1f).defaultMinSize(minHeight = 48.dp).clip(RoundedCornerShape(12.dp)).background(if (on) Dock.Surface2 else Color.Transparent)
                    .clickable(role = Role.Tab) { onSelect(t) },
                contentAlignment = Alignment.Center,
            ) { Text(t.label, style = if (on) Type.bodyBold else Type.body.copy(color = Dock.Muted)) }
        }
    }
}

private fun priorityColor(p: Priority) = when (p) {
    Priority.CRITICAL -> Dock.Stop
    Priority.HIGH -> Dock.Accent
    Priority.MEDIUM -> Dock.Info
    Priority.LOW -> Dock.Muted
}

// ------------------------------------------------------------------ cases

@Composable
private fun DeskScreen(vm: BimodaViewModel, onOpen: (Case) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Today’s cases", style = Type.display.copy(fontSize = 34.sp, lineHeight = 36.sp))
            Text("Six synthetic cases. Open one, let Bimoda read it, then let policy decide.", style = Type.small, modifier = Modifier.padding(top = 4.dp, bottom = 6.dp))
        }
        items(CASES, key = { it.id }) { c ->
            val st = vm.state(c.id)
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Dock.Surface).border(1.dp, Dock.Line.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                    .clickable(onClickLabel = "Open case", role = Role.Button) { onOpen(c) },
            ) {
                Box(Modifier.width(6.dp).height(108.dp).background(priorityColor(c.priority)))
                Column(Modifier.padding(14.dp).weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(c.order.id, style = Type.display.copy(fontSize = 22.sp, lineHeight = 24.sp), modifier = Modifier.weight(1f))
                        st.evaluation?.let { Stamp(it.decision) } ?: Chip(c.priority.name.lowercase(), priorityColor(c.priority))
                    }
                    Text(c.lastCustomerText, style = Type.body.copy(fontSize = 14.sp, color = Dock.Muted), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(vertical = 6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Chip(c.type)
                        Chip(c.order.fulfillment.label.replace('_', ' '))
                    }
                }
            }
        }
        item { Text("Synthetic demo data. No real payments, refunds or messages are executed.", style = Type.small, modifier = Modifier.padding(top = 8.dp)) }
    }
}

// ------------------------------------------------------------------ one case

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CaseScreen(vm: BimodaViewModel, c: Case) {
    val st = vm.state(c.id)
    val t = computeTotals(c.order)
    val haptic = LocalHapticFeedback.current
    var action by rememberSaveable(c.id) { mutableStateOf(ActionKind.CHANGE_VARIANT) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Docket {
            Text("Case ${c.id}", style = Type.label.copy(color = Dock.PaperMuted))
            Text(c.order.id, style = Type.display.copy(fontSize = 44.sp, lineHeight = 46.sp, color = Dock.PaperInk))
            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Chip(c.type, Dock.PaperMuted)
                Chip(c.order.fulfillment.label.replace('_', ' '), Dock.PaperMuted)
            }
            // The stamp gets its own line so a long decision never covers the order number.
            st.evaluation?.let { e ->
                Column(Modifier.fillMaxWidth().padding(top = 10.dp, end = 4.dp), horizontalAlignment = Alignment.End) {
                    Stamp(e.decision, large = true, onPaper = true, animateKey = e)
                    Text(e.action.label.lowercase(), style = Type.mono.copy(color = Dock.PaperMuted, fontSize = 11.sp), modifier = Modifier.padding(top = 8.dp))
                }
            }
            Spacer(Modifier.height(14.dp))
            c.messages.forEach { m ->
                Row(Modifier.padding(bottom = 8.dp)) {
                    Box(Modifier.width(3.dp).height(if (m.fromCustomer) 22.dp else 16.dp).background(if (m.fromCustomer) Dock.PaperInk else Dock.PaperLine))
                    Column(Modifier.padding(start = 10.dp)) {
                        Text(if (m.fromCustomer) c.order.customer.displayName else "Agent", style = Type.label.copy(color = Dock.PaperMuted))
                        Text(m.text, style = Type.body.copy(color = Dock.PaperInk, fontSize = 16.sp, lineHeight = 23.sp))
                    }
                }
            }
            Spacer(Modifier.height(6.dp))
            DashedRule()
            Spacer(Modifier.height(10.dp))
            c.order.items.forEach { i ->
                Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                    Text("${i.qty}× ${i.name} (${i.variant})", style = Type.body.copy(color = Dock.PaperInk, fontSize = 14.sp), modifier = Modifier.weight(1f))
                    Text(money(i.unitPriceCents * i.qty), style = Type.body.copy(color = Dock.PaperInk, fontFamily = Figure, fontSize = 14.sp))
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                Text(if (t.freeShippingApplied) "Total · free shipping applied" else "Total · shipping ${money(t.shippingFeeCents)}", style = Type.bodyBold.copy(color = Dock.PaperInk, fontSize = 14.sp), modifier = Modifier.weight(1f))
                Text(money(t.totalCents), style = Type.bodyBold.copy(color = Dock.PaperInk, fontFamily = Figure))
            }
            c.order.statedTotalCents?.takeIf { it != t.totalCents }?.let {
                Text("Confirmation message stated ${money(it)}; the calculated total is ${money(t.totalCents)}.", style = Type.small.copy(color = Dock.PaperStop), modifier = Modifier.padding(top = 6.dp))
            }
            c.order.returnCase?.let {
                Text("Return: pickup ${it.pickup.replace('_', ' ')}, warehouse receipt ${it.warehouseReceipt.replace('_', ' ')}.", style = Type.small.copy(color = Dock.PaperMuted), modifier = Modifier.padding(top = 6.dp))
            }
        }

        // 1. understand
        Panel {
            StepHeader(1, "Read the case")
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PrimaryButton(if (st.busy) "Working…" else "Analyze conversation", { vm.analyze(c) }, Modifier.weight(1f), enabled = !st.busy)
                if (st.busy) GhostButton("Cancel", { vm.cancel(c) })
            }
            Text("Runs a real Firebase AI Logic request in ${vm.mode.label} mode. Customer text is treated as untrusted data.", style = Type.small, modifier = Modifier.padding(top = 8.dp))
            st.run?.let { r ->
                Spacer(Modifier.height(12.dp))
                RunHeader(r)
                st.analysis?.let { a ->
                    if (a.suspectedPromptInjection) {
                        Text(
                            "Possible prompt-injection attempt detected in the customer text. It was treated as data and not followed.",
                            style = Type.body.copy(color = Dock.Stop, fontSize = 14.sp),
                            modifier = Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.dp, Dock.Stop.copy(alpha = 0.5f), RoundedCornerShape(10.dp)).padding(10.dp),
                        )
                    }
                    Text(a.summary, style = Type.body, modifier = Modifier.padding(vertical = 10.dp))
                    KeyValue("Intent", a.intent)
                    KeyValue("Main issue", a.mainIssue)
                    KeyValue("Urgency", a.urgency)
                    KeyValue("Suggested", a.suggestedAction.name, Dock.Hold)
                    Text("AI interpretation, not a calibrated confidence. The policy engine decides what is allowed.", style = Type.small, modifier = Modifier.padding(top = 8.dp))
                }
                st.validationError?.let { Text("The answer failed validation and was not used: $it", style = Type.body.copy(color = Dock.Stop, fontSize = 14.sp), modifier = Modifier.padding(top = 8.dp)) }
                if (r.status != RunStatus.SUCCESS && r.status != RunStatus.FAILED_VALIDATION) r.error?.let { Text(it, style = Type.body.copy(color = Dock.Accent, fontSize = 14.sp), modifier = Modifier.padding(top = 8.dp)) }
            }
        }

        // 2. policy
        Panel {
            StepHeader(2, "Check policy")
            Spacer(Modifier.height(10.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ActionKind.entries.forEach { k ->
                    val on = k == action
                    Text(
                        k.label,
                        style = if (on) Type.bodyBold.copy(color = Dock.OnAccent, fontSize = 14.sp) else Type.body.copy(fontSize = 14.sp),
                        modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(if (on) Dock.Accent else Dock.Surface2)
                            .clickable(role = Role.RadioButton) { action = k }.padding(horizontal = 12.dp, vertical = 11.dp),
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            GhostButton("Propose “${action.label}”", { vm.propose(c, action); haptic.performHapticFeedback(HapticFeedbackType.LongPress) }, Modifier.fillMaxWidth())
            st.evaluation?.let { e ->
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Stamp(e.decision)
                    Spacer(Modifier.width(10.dp))
                    Text("${e.ruleId} · policy v${e.policyVersion}", style = Type.mono.copy(color = Dock.Muted))
                }
                Text(e.explanation, style = Type.body, modifier = Modifier.padding(top = 8.dp))
                Text(e.enforcement, style = Type.small)
            } ?: Text("Fixed rules decide, not the model. Try “Change variant” on a shipped order.", style = Type.small, modifier = Modifier.padding(top = 8.dp))
        }

        // 3. authorize
        Panel {
            StepHeader(3, "Approve")
            Spacer(Modifier.height(8.dp))
            val ap = st.approval
            val e = st.evaluation
            when {
                e == null -> Text("Nothing proposed yet.", style = Type.small)
                e.decision == Decision.DENY -> Text("No approval path: a DENY cannot be overridden by approving it. Route to manual review.", style = Type.body.copy(fontSize = 14.sp))
                e.decision == Decision.NEED_MORE_INFORMATION -> Text("Waiting for information from the customer before any change.", style = Type.body.copy(fontSize = 14.sp))
                e.decision == Decision.ALLOW -> Text("Permitted by policy. Nothing real is changed in this demo.", style = Type.body.copy(fontSize = 14.sp))
                ap != null -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(e.action.label, style = Type.bodyBold, modifier = Modifier.weight(1f))
                        Chip(ap.state.label, if (ap.state == ApprovalState.REJECTED) Dock.Stop else if (ap.state == ApprovalState.PENDING) Dock.Accent else Dock.Go)
                    }
                    val allowed = canApprove(vm.role, e)
                    when (ap.state) {
                        ApprovalState.PENDING -> {
                            if (!allowed) Text("Needs manager or admin. You are acting as ${vm.role.label}.", style = Type.body.copy(color = Dock.Accent, fontSize = 14.sp), modifier = Modifier.padding(top = 6.dp))
                            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PrimaryButton("Approve", { vm.approve(c); haptic.performHapticFeedback(HapticFeedbackType.LongPress) }, Modifier.weight(1f), enabled = allowed)
                                GhostButton("Reject", { vm.reject(c) }, Modifier.weight(1f), enabled = allowed)
                            }
                        }
                        ApprovalState.APPROVED -> PrimaryButton("Execute (simulated)", { vm.execute(c) }, Modifier.fillMaxWidth().padding(top = 10.dp))
                        ApprovalState.EXECUTED -> Text("Simulated in demo: no payment, shipment, inventory or customer message was actually changed or sent.", style = Type.small, modifier = Modifier.padding(top = 8.dp))
                        ApprovalState.REJECTED -> Text("Rejected by ${ap.decidedBy?.label ?: "reviewer"}.", style = Type.small, modifier = Modifier.padding(top = 8.dp))
                    }
                }
            }
        }

        // why this outcome
        Panel {
            Text("Decision trace", style = Type.title)
            Spacer(Modifier.height(8.dp))
            TraceRow(Dock.Muted, "Customer request", "Customer text (untrusted)", c.lastCustomerText)
            TraceRow(Dock.Hold, "AI interpretation", "Model-generated", st.analysis?.let { "${it.intent}; suggests ${it.suggestedAction.name}" } ?: "Not analyzed yet.")
            TraceRow(Dock.Info, "Verified facts", "Deterministic rule", "Order ${c.order.id} is \"${c.order.fulfillment.label}\"; total ${money(t.totalCents)}.")
            TraceRow(Dock.Info, "Policy evaluation", "Deterministic rule", st.evaluation?.let { "${it.decision.name}: ${it.explanation}" } ?: "No action evaluated yet.")
            TraceRow(Dock.Accent, "Authorization", "Human decision", st.approval?.let { "${it.state.label}${it.decidedBy?.let { r -> " by ${r.label}" } ?: ""}" } ?: "No approval record.")
            Text("Model-generated text explains and proposes. Only the deterministic policy decision and a human approval can allow an action.", style = Type.small, modifier = Modifier.padding(top = 6.dp))
        }
    }
}

@Composable
private fun TraceRow(color: Color, title: String, kind: String, body: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        Box(Modifier.width(3.dp).height(44.dp).background(color))
        Column(Modifier.padding(start = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = Type.bodyBold.copy(fontSize = 14.sp))
                Spacer(Modifier.width(8.dp))
                Chip(kind, color)
            }
            Text(body, style = Type.small, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun RunHeader(r: RunResult) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (r.source != null) SourceBadge(r.source) else Chip("No model output")
        Chip(r.status.name.lowercase(), if (r.status == RunStatus.SUCCESS) Dock.Go else if (r.status == RunStatus.BLOCKED_PRIVACY) Dock.Stop else Dock.Accent)
        Text("${r.durationMs} ms", style = Type.mono.copy(color = Dock.Muted))
    }
    Text("${r.requested.name} → ${r.effective.name}${if (r.redactions > 0) " · redacted ×${r.redactions}" else ""}", style = Type.mono.copy(color = Dock.Muted, fontSize = 11.sp), modifier = Modifier.padding(top = 6.dp))
}

// ------------------------------------------------------------------ lab

@Composable
private fun LabScreen(vm: BimodaViewModel) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Column {
            Text("Hybrid AI Lab", style = Type.display.copy(fontSize = 34.sp, lineHeight = 36.sp))
            Text("Same synthetic case, three inference preferences. Results are real SDK executions; unavailable paths show as unavailable, never as fabricated output.", style = Type.small, modifier = Modifier.padding(top = 4.dp))
        }
        Panel {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Local AI (Gemini Nano)", style = Type.title, modifier = Modifier.weight(1f))
                Chip(vm.localModel.label, if (vm.localModel == LocalModel.AVAILABLE) Dock.Go else Dock.Accent)
            }
            Text("Runs through AICore on supported Android devices. The status comes from the SDK.", style = Type.small, modifier = Modifier.padding(top = 4.dp, bottom = 10.dp))
            when (vm.localModel) {
                LocalModel.DOWNLOADABLE, LocalModel.DOWNLOADING -> PrimaryButton("Enable Local AI", { vm.enableLocalAi() }, Modifier.fillMaxWidth())
                LocalModel.UNAVAILABLE -> Text("This device does not offer the on-device model. Hybrid mode falls back to the cloud; Local only reports unavailable.", style = Type.body.copy(fontSize = 14.sp, color = Dock.Accent))
                else -> GhostButton("Check again", { vm.refreshLocal() }, Modifier.fillMaxWidth())
            }
            vm.downloadLabel?.let { Text(it, style = Type.mono.copy(color = Dock.Muted), modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(10.dp))
            KeyValue("Privacy mode", vm.mode.label)
            KeyValue("App Check", APP_CHECK_MODE)
            KeyValue("Remote Config", vm.configLabel)
        }
        Docket {
            Text("Synthetic case", style = Type.label.copy(color = Dock.PaperMuted))
            Text(LAB_TEXT, style = Type.body.copy(color = Dock.PaperInk, fontSize = 16.sp, lineHeight = 23.sp), modifier = Modifier.padding(top = 6.dp))
        }
        LabTest(vm, "Test A · Local inference", "Never leaves the device. Fails if Gemini Nano is unavailable.", Preference.ONLY_ON_DEVICE, PrivacyMode.LOCAL_ONLY)
        LabTest(vm, "Test B · Cloud inference", "Firebase AI Logic cloud model. Redacted unless you consented.", Preference.ONLY_IN_CLOUD, PrivacyMode.CLOUD)
        LabTest(vm, "Test C · Hybrid inference", "SDK picks on-device, falls back to cloud. Source is read from the response.", Preference.PREFER_ON_DEVICE, PrivacyMode.HYBRID)
        Panel {
            Text("Routing plan for ${vm.mode.label}", style = Type.title)
            Text("The same function the engine runs. It decides what is allowed; the SDK decides where the answer is produced.", style = Type.small, modifier = Modifier.padding(top = 4.dp, bottom = 8.dp))
            Preference.entries.forEach { p ->
                val plan = planRoute(vm.mode, p, vm.engine.cloudEnabled, online = true)
                Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(p.name, style = Type.mono.copy(fontSize = 11.sp, color = Dock.Muted), modifier = Modifier.weight(1f))
                    when {
                        plan.blocked != null -> Chip("Blocked", Dock.Stop)
                        !plan.mayReachCloud -> Text("Stays on device", style = Type.bodyBold.copy(fontSize = 12.sp, color = Dock.Bg), modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Dock.Text).padding(horizontal = 8.dp, vertical = 4.dp))
                        else -> Text("Cloud-capable, redacted", style = Type.bodyBold.copy(fontSize = 12.sp), modifier = Modifier.dashedBorder(Dock.Text, 6.dp, 1.5.dp).padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun LabTest(vm: BimodaViewModel, title: String, body: String, pref: Preference, glyph: PrivacyMode) {
    val r = vm.lab[pref]
    val busy = vm.labBusy == pref
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            RouteGlyph(glyph, Dock.Text)
            Spacer(Modifier.width(8.dp))
            Text(title, style = Type.title)
        }
        Text(body, style = Type.small, modifier = Modifier.padding(top = 4.dp, bottom = 10.dp))
        r?.let {
            RunHeader(it)
            it.text?.let { t ->
                Text(t.trim(), style = Type.mono, modifier = Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Dock.Bg).padding(10.dp))
            }
            it.error?.let { e -> Text(e, style = Type.body.copy(fontSize = 14.sp, color = Dock.Accent), modifier = Modifier.padding(top = 8.dp)) }
            Spacer(Modifier.height(10.dp))
        }
        GhostButton(if (busy) "Running…" else "Run ${title.substringBefore(" ·").removePrefix("Test ")}", { vm.runLab(pref) }, Modifier.fillMaxWidth(), enabled = vm.labBusy == null)
    }
}
