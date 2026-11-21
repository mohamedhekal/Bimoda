package app.bimoda.android

import app.bimoda.android.ai.KnownEntities
import app.bimoda.android.ai.Preference
import app.bimoda.android.ai.PrivacyMode
import app.bimoda.android.ai.RunStatus
import app.bimoda.android.ai.parseAnalysis
import app.bimoda.android.ai.planRoute
import app.bimoda.android.ai.redact
import app.bimoda.android.domain.ActionKind
import app.bimoda.android.domain.Approval
import app.bimoda.android.domain.ApprovalState
import app.bimoda.android.domain.CASES
import app.bimoda.android.domain.Decision
import app.bimoda.android.domain.Role
import app.bimoda.android.domain.computeTotals
import app.bimoda.android.domain.evaluatePolicy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoreTest {
    private fun order(id: String) = CASES.first { it.order.id == id }.order

    @Test fun freeShippingComesFromRecords() {
        val t = computeTotals(order("ORD-1001"))
        assertEquals(16_200, t.totalCents)
        assertTrue(t.freeShippingApplied)
    }

    @Test fun shippedOrderIsLocked() {
        val e = evaluatePolicy(ActionKind.CHANGE_VARIANT, Role.ADMIN, order("ORD-1002"))
        assertEquals(Decision.DENY, e.decision)
        assertEquals("R-001", e.ruleId)
    }

    @Test fun incompleteAddressNeedsInformation() =
        assertEquals(Decision.NEED_MORE_INFORMATION, evaluatePolicy(ActionKind.CHANGE_ADDRESS, Role.AGENT, order("ORD-1003")).decision)

    @Test fun courierPickupIsNotWarehouseReceipt() {
        assertEquals(Decision.DENY, evaluatePolicy(ActionKind.RESTORE_INVENTORY, Role.MANAGER, order("ORD-1004")).decision)
        assertEquals(Decision.DENY, evaluatePolicy(ActionKind.REFUND, Role.MANAGER, order("ORD-1004")).decision)
    }

    @Test fun refundNeedsManagerAndCannotSkipStates() {
        val e = evaluatePolicy(ActionKind.REFUND, Role.AGENT, order("ORD-1006"))
        assertEquals(Decision.REQUIRE_APPROVAL, e.decision)
        val pending = Approval(e)
        assertNull("agent must not approve a refund", pending.approve(Role.AGENT))
        assertNull("cannot execute before approval", pending.execute())
        val approved = pending.approve(Role.MANAGER)
        assertNotNull(approved)
        assertEquals(ApprovalState.EXECUTED, approved!!.execute()!!.state)
        assertNull("cannot approve twice", approved.approve(Role.MANAGER))
    }

    @Test fun deniedDecisionCanNeverBeApprovedOrExecuted() {
        val denied = evaluatePolicy(ActionKind.CHANGE_VARIANT, Role.ADMIN, order("ORD-1002"))
        assertNull(Approval(denied).approve(Role.ADMIN))
        // even a forged "approved" record with a DENY decision must not execute
        assertNull(Approval(denied, ApprovalState.APPROVED, Role.ADMIN).execute())
    }

    @Test fun localOnlyNeverAllowsCloud() {
        for (p in Preference.entries) {
            val plan = planRoute(PrivacyMode.LOCAL_ONLY, p, cloudEnabled = true, online = true)
            assertFalse("$p must not reach the cloud in Local only", plan.mayReachCloud)
            if (plan.blocked == null) assertEquals(Preference.ONLY_ON_DEVICE, plan.effective)
        }
        assertEquals(RunStatus.BLOCKED_PRIVACY, planRoute(PrivacyMode.LOCAL_ONLY, Preference.ONLY_IN_CLOUD, true, true).blocked!!.first)
    }

    @Test fun operatorSwitchBlocksCloud() {
        assertFalse(planRoute(PrivacyMode.HYBRID, Preference.PREFER_ON_DEVICE, cloudEnabled = false, online = true).mayReachCloud)
        assertNotNull(planRoute(PrivacyMode.CLOUD, Preference.ONLY_IN_CLOUD, cloudEnabled = false, online = true).blocked)
    }

    @Test fun cloudCapableRequestsAreRedacted() {
        assertTrue(planRoute(PrivacyMode.HYBRID, Preference.PREFER_ON_DEVICE, true, true).redact)
        val r = redact("Hi, this is Jordan Hart, call +1-555-0142 or jordan@example.test, 12 Harbor Lane. Order placed 2026-11-20.", KnownEntities(names = listOf("Jordan Hart"), addresses = listOf("12 Harbor Lane")))
        assertFalse(r.text.contains("Jordan"))
        assertFalse(r.text.contains("555"))
        assertFalse(r.text.contains("example.test"))
        assertFalse(r.text.contains("Harbor"))
        assertTrue("dates are not phone numbers", r.text.contains("2026-11-20"))
    }

    @Test fun modelOutputIsValidated() {
        val ok = parseAnalysis("""Sure: {"intent":"order_status","mainIssue":"Where is the order","urgency":"medium","suggestedAction":"DRAFT_REPLY","summary":"Asks for status.","suspectedPromptInjection":true}""")
        assertTrue(ok.isSuccess)
        assertTrue(ok.getOrThrow().suspectedPromptInjection)
        assertTrue(parseAnalysis("no json here").isFailure)
        assertTrue(parseAnalysis("""{"intent":"grant_refund","mainIssue":"x y z","urgency":"medium","suggestedAction":"REFUND","summary":"abc","suspectedPromptInjection":false}""").isFailure)
        assertTrue(parseAnalysis("""{"intent":"other","mainIssue":"x y z","urgency":"medium","suggestedAction":"APPROVE_EVERYTHING","summary":"abc","suspectedPromptInjection":false}""").isFailure)
    }
}
