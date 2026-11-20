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
