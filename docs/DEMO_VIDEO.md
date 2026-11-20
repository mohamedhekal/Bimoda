# Demo video script (target 2:50, hard limit 3:00)

Use desktop Chrome 139+ with the Prompt API flag and Gemini Nano already downloaded, at https://bimoda.web.app (or localhost). Record at 1440×900, mic on, captions burned in. Nothing in the video may be faked: run each step live and show the badge that appears.

Before recording: open the Lab once and press **Enable Local AI** (the first model load can take a while); set Privacy mode to **Hybrid**; Role **Agent**; skip the tour.

| Time | Scene | Do | Say (caption) |
|---|---|---|---|
| 0:00–0:15 | Problem | Show the landing page hero | "Support teams drown in messages that mix pricing, locked shipments, returns and even prompt injection. Cloud-only AI requires sending data off-device, which adds privacy and connectivity considerations." |
| 0:15–0:30 | Product | Click **Try Bimoda**; Mission Control | "Bimoda is a privacy-aware ops copilot built on Firebase AI Logic hybrid inference." |
| 0:30–1:05 | Real case | Workspace → **ORD-1006** (injection) → **Analyze conversation** | "A real request through Firebase AI Logic. The badge reads the SDK's inferenceSource: processed on this device. The injection is flagged and ignored." |
| 1:05–1:40 | Hybrid Lab | Lab → **Run all three**; point at A (device), B (cloud), C (hybrid); then switch to **Local only** and press **Run B** | "Same case, three preferences, real results with source and duration. In Local Only mode the cloud path is blocked: zero network requests." |
| 1:40–2:10 | Policy | Workspace → **ORD-1002** → Propose **Change variant** → DENY R-001; then **ORD-1004** → Restore inventory → DENY | "The model proposes, a deterministic policy decides. Shipped orders are locked, and courier status never proves warehouse receipt." |
| 2:10–2:30 | Approval + backend | Sign in; Refund as Agent (approve disabled) → switch to Manager → approve → execute (simulated) | "Roles are enforced by Firestore security rules, not just the UI. Nothing real is executed." |
| 2:30–2:50 | Insights + close | Mission Control → **Generate insights**; Audit page | "Counters come from real run records. Intelligent commerce operations shouldn't depend on one device, one model, or one connection." |

## Shot checklist
- [ ] Landing hero, Mission Control, Workspace (ORD-1006 analysis with badge), Lab (A/B/C results), Local-only block, policy DENY ×2, approval flow, Audit page
- [ ] Every AI badge visible for at least 2 seconds
- [ ] No debug token, API secret or personal email visible (the sign-in dialog shows only the email you type: use a throwaway)
- [ ] Final length ≤ 3:00 (only the first 3 minutes are judged)
