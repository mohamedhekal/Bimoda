# Demo guide

Open `/` and press **Try Bimoda** (no sign-in). The first visit offers a 6-step tour; Ctrl/⌘ K opens the command palette.

1. **Mission Control**: counts come from synthetic data; AI/policy counters from real runs (time-range selector). Press *Generate insights* for an AI interpretation of the aggregates.
2. **Locked shipment (ORD-1002)**: *Propose → Change variant* → **DENY** (rule R-001). *Operational signals* shows the late request after dispatch. *Route to manual review* creates an approved-able internal flag.
3. **Free-shipping confusion (ORD-1001)**: the order card shows stated vs calculated total. *Analyze conversation*, then *Compose* (amounts come from records).
4. **Return dispute (ORD-1004)**: the return panel explains that a courier pickup is not warehouse receipt; *Propose → Restore inventory* → **DENY**.
5. **Address ambiguity (ORD-1003)**: *Propose → Change address* → **NEED MORE INFORMATION**.
6. **Delayed reply (ORD-1005)** and **prompt injection (ORD-1006)**: signals flag the lock and failed attempts; the analysis flags the injection and does not follow it.
7. **Approvals**: propose *Refund* as Agent (approve is disabled), switch Role to Manager, approve, *Execute (simulated)*.
8. **Hybrid AI Lab**: *Enable Local AI* (Chrome desktop), *Run all three*, compare source, duration and privacy. Switch to *Local only* and run B to see the block.
9. **Policy Studio** (Role: Admin): try disabling warehouse-receipt checks; it is rejected. **Audit & runs** lists approvals, AI runs and audit events.

10. **Sign in** (optional, top bar): create an Email/Password account (or Google). The badge turns to *Cloud sync live · admin*; approvals, AI runs, audit and policy now persist in Firestore and survive a reload. Sign out to return to local demo data.
11. **Language**: press the عربي button for the Arabic (beta) interface in RTL.
12. **Remote Config**: the Lab shows its status (`live`, timeout, cloud on/off). Setting `cloud_inference_enabled=false` in Remote Config disables cloud runs everywhere.
13. **Trust Center**: policy conformance shows 40/40. Pick *Quick sample* and press **Run evaluation** to run real inference (on-device in Hybrid/Local only, cloud in Cloud mode). Cloud runs are paced (free-tier limits) and stop after 3 consecutive failures.
14. **Decision trace** (Workspace): after *Analyze* or *Propose*, scroll to the trace; expand any step. Violet = model-generated, blue = deterministic rule, marigold = human.
15. **Privacy Evidence** (Lab): compare how each privacy mode routes each test, preview the redaction, run a test and read the preference handed to the SDK plus the diagnostic request count (supporting evidence, not proof).
16b. **Approval enforcement** (Trust Center): an independent test attempts prohibited approval transitions and requires every one to be refused.
16. **What-if simulator** (Policy Studio, Role: Admin): change *Order edits lock from*, see which scenarios change, try disabling the warehouse-receipt check (rejected), then apply or reset.
