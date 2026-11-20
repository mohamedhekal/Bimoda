# Devpost submission — Bimoda

**Deadline: Nov 30, 2026, 2:00 PM Pacific.** (Rules read from the official Devpost page on 2026-11-20.)

**Title:** Bimoda — Hybrid Commerce Intelligence
**Tagline:** Commerce intelligence, on-device and in the cloud.
**Track:** Web (Chrome) — Gemini Nano via Firebase AI Logic, with cloud fallback.
**Live demo:** https://bimoda.web.app (no sign-in needed; synthetic data)
**Repository:** https://github.com/mohamedhekal/Bimoda (Apache-2.0, see `LICENSE`)
**Video:** _paste the public YouTube URL here_ (≤ 3:00, script in `docs/DEMO_VIDEO.md`)

## Short description
A privacy-aware AI operations copilot that helps e-commerce teams resolve operational issues using on-device and cloud intelligence through Firebase AI Logic, with a deterministic policy engine and human approval in the loop.

## Inspiration
Support and fulfillment teams juggle messages that mix pricing confusion, locked shipments, ambiguous addresses, disputed returns and even prompt-injection attempts. Cloud-only AI requires sending customer data off the device, which adds privacy and connectivity considerations, and a model alone should not decide what is allowed. We wanted an assistant that keeps data local when it can, says exactly where each answer was produced, and can never silently change an order.

## What it does
- **Conversation intelligence:** intent, issue, tone, urgency, missing information, order references and a proposed action, as Zod-validated JSON. Customer text is treated as untrusted data; injection attempts are flagged and not followed.
- **Policy engine (deterministic, not the model):** ALLOW / DENY / REQUIRE_APPROVAL / NEED_MORE_INFORMATION with rule id, facts, version and timestamp. Example: a variant change on a shipped order is denied (R-001); a courier "pickup confirmed" never proves warehouse receipt, so inventory is not restored (R-004).
- **Human-in-the-loop approvals:** suggested → pending → approved/rejected → executed (simulated). Role-gated; role ceilings and the state machine are validated by Firestore security rules (the policy decision itself is computed in the client).
- **Response composer:** amounts come only from order records; a draft that invents an amount is rejected.
- **Operations insights:** AI interpretation of aggregate counts only, labeled as interpretation.
- **Hybrid AI Lab:** the same case run as local-only, cloud-only and hybrid, each showing the actual source, duration and privacy handling.
- **Trust Center:** a deterministic policy-conformance suite plus a real-inference evaluation of 40 synthetic scenarios, with every rate shown with its denominator. **Decision trace** explains each outcome and separates model text from deterministic rules. **Privacy Proof Mode** shows the routing plan and measured requests to the model endpoint. **What-if simulator** previews a policy change before it is applied.
- Rule-based shipping/return signals, Mission Control analytics from real run records, audit trail, command palette, guided tour, offline PWA shell, Arabic/RTL (beta).

## How we use Firebase AI Logic (hybrid inference)
`src/ai/hybrid-engine/firebaseAdapter.ts` calls `getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })` from `firebase/ai` for the four documented modes (`PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`) and reads `response.inferenceSource` to display where inference happened. There is no custom router. "Enable Local AI" calls `initializeDeviceModel()` inside a click handler (user activation). Structured output uses `responseConstraint` on device and a JSON MIME type in the cloud. Around the SDK, `HybridEngine` adds a privacy gate (Local Only never calls the cloud; redaction before cloud-capable requests; explicit consent), timeout/cancel and run telemetry without raw prompts.

## Firebase products used
| Product | How |
|---|---|
| Firebase AI Logic | hybrid on-device/cloud inference (every AI feature) |
| App Check | reCAPTCHA Enterprise in production; debug tokens in development |
| Authentication | Email/Password and Google sign-in (optional; demo needs none) |
| Cloud Firestore | per-user sandbox org: approvals, AI run metadata, audit log, policy; security rules enforce isolation, role ceilings and the approval state machine; they cannot recompute the policy decision |
| Remote Config | operator-controlled cloud model, AI timeout and a cloud on/off switch (realtime updates; an operator control, not a security boundary) |
| Hosting | https://bimoda.web.app |

## How we built it
React + TypeScript (strict) + Vite + Tailwind; Zod validation for every AI output; Playwright (36 e2e + 2 PWA e2e on real Chrome), Vitest (100 tests), and a live security-rules test (`npm run test:rules`, 43 checks against the real project).

## Challenges we faced
- On-device availability and hangs: Chrome's model session can stall; we added a per-call timeout and cancel and treat on-device calls as able to hang. Arrays without `maxItems` made Gemini Nano generate until timeout; we keep array limits in the constraint schema.
- Privacy vs quality: redacting before the SDK chooses a route means even on-device answers see placeholders in Hybrid mode (Local Only keeps full context).
- App Check debug tokens are per browser profile.
- Firestore rules cannot re-run the policy engine, so they validate the stored decision and role ceilings rather than recomputing it.

## Accomplishments (verified)
See `README.md` → "Verified". Highlights: a 40-scenario real-inference evaluation (cloud mode: 40/40 valid answers, 100% intent accuracy vs. the authors' labels, 100% injection recall, 0 blocked-but-approvable) reported with denominators and caveats; real on-device and cloud runs through the SDK on Chrome 157, privacy gate verified with zero requests to the AI model endpoint in Local Only (other Firebase services may still be contacted), 43/43 live security-rule checks, offline reload from the service worker cache on the production build, and the live site running with production App Check.

## What we learned
Hybrid inference is most useful when the product is honest about the route taken, and when business-critical decisions never depend on a model.

## What's next
Server-side policy re-evaluation (Cloud Functions on the Blaze plan), the same evaluation run on-device on a healthy Chrome, real order/ticket integrations behind the same approval gates, richer Arabic coverage, and measured cost comparisons from real billing.

## Disclosure
Built during the submission period with an AI coding assistant (Claude Code). No pre-existing project code was reused.

## Submission checklist
- [x] Public repository: https://github.com/mohamedhekal/Bimoda; `LICENSE` is Apache-2.0 (verify GitHub shows the license badge)
- [ ] README explains setup, Firebase configuration and testing (it does; re-read once)
- [ ] Demo video ≤ 3:00 uploaded to YouTube as **public**, link added
- [ ] This text pasted into the Devpost form (how AI Logic is used, features, value proposition)
- [ ] Live URL works in a clean Chrome profile; App Check debug tokens are only needed for localhost
- [ ] Screenshots from `docs/screenshots/` uploaded
- [ ] Submit before **Nov 30, 2026, 2:00 PM PT**
