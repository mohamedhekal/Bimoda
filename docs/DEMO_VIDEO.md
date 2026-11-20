# Demo video script (target 2:50, hard limit 3:00)

Judging weighs Technological Implementation, Design, Potential Impact and Quality of the Idea equally, so the video shows **real** hybrid inference, then proves it is trustworthy. Run every step live; never fake a result. Use desktop Chrome 139+ with the Prompt API flag and Gemini Nano already downloaded, at https://bimoda.web.app (or localhost), 1440×900, mic on, captions burned in.

Before recording: open the Lab once and press **Enable Local AI**; privacy mode **Hybrid**, role **Agent**, skip the tour. Wait a minute after any earlier heavy on-device use: a stuck local model makes the first answer slow (see `docs/HYBRID_AI.md`). Rehearse once so the cloud rate limit (free tier) is not hit: do not run the 40-scenario evaluation live; use the quick sample or show a result you ran just before.

| Time | Scene | Do | Say (caption) |
|---|---|---|---|
| 0:00–0:15 | Problem | Landing hero | "Support teams get messages that mix pricing, locked shipments, returns and even prompt injection. Cloud-only AI requires sending data off-device, which adds privacy and connectivity considerations." |
| 0:15–0:30 | Idea | **Try Bimoda** → Mission Control | "Bimoda is a hybrid AI ops copilot on Firebase AI Logic: it keeps data on the device when it can, and proves what happened." |
| 0:30–1:05 | Real hybrid AI | Workspace → **ORD-1006** (injection) → **Analyze conversation** | "A real request. The badge shows the SDK's inferenceSource: processed on this device. The injection attempt is flagged and not followed." |
| 1:05–1:35 | Decision trace | Scroll to **Decision trace**; expand Policy evaluation; propose **Refund** | "Every decision is explained step by step. Model text is violet; deterministic rules are blue. The policy decision lands on the case as a stamp. The model proposes; only policy and a human can allow." |
| 1:35–2:05 | Privacy evidence | Lab → **Run all three**; show **Privacy Evidence** (routing matrix, redaction preview, preference handed to the SDK, diagnostic request count); Local only → Run B | "The same function the engine runs explains the routing for every privacy mode. In Local Only the SDK is only ever asked for on-device inference. The request count beside it is diagnostic evidence, not proof." |
| 2:05–2:35 | Trust Center | Trust Center → policy conformance 40/40 → **Approval enforcement** (every prohibited attempt refused) → the AI evaluation result you ran before (or the quick sample) | "Forty synthetic scenarios, real inference. Every number has its denominator and model failures are listed separately. A separate test tries to push forbidden approvals through, and every attempt is refused." |
| 2:35–2:50 | What-if + close | Policy Studio → What-if simulator: lock edits from *shipped* → affected scenarios | "Managers can test a policy change before applying it. Intelligent commerce operations shouldn't depend on one device, one model, or one connection." |

## Shot checklist
- [ ] Badge visible for ≥ 2 s on every AI answer; decision trace legend visible
- [ ] Privacy Evidence matrix + the "diagnostic" line; the scope note is not hidden
- [ ] No debug token, API secret or personal email on screen (use a throwaway account if you show sign-in)
- [ ] Final length ≤ 3:00 (only the first 3 minutes are judged)
- [ ] Audio claims match the README ("Known limitations"); never say "server-enforced policy", "zero network traffic" or that the request count "proves" anything (it is diagnostic evidence)
