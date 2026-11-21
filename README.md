# Bimoda — Hybrid Commerce Intelligence

> Commerce intelligence, on-device and in the cloud.

**Live demo: https://bimoda.web.app** (no sign-in needed, synthetic data) · Built for the **Google Firebase #BuildHybridAI 2026** hackathon (Web / Chrome) · Apache-2.0

**Demo video (2:20):** https://youtu.be/RcJDQtVZaDc

[![Watch the Bimoda demo on YouTube](demo-video/thumbnail.jpg)](https://youtu.be/RcJDQtVZaDc)

Video file: [demo-video/bimoda-demo.mp4](demo-video/bimoda-demo.mp4) · narration: [demo-video/narration.txt](demo-video/narration.txt)

<a id="platforms"></a>**Platforms:** Web (Chrome, this README), a native **Android** client in [`android/`](android/README.md) and a native **iOS** client in [`ios/`](ios/README.md), all on the Firebase AI Logic hybrid SDK with the same policy, routing and redaction rules.

| Platform | On-device model | Cloud inference | On-device inference |
|---|---|---|---|
| Web (Chrome) | Gemini Nano (Prompt API) | Verified on the live site | Verified on desktop Chrome |
| Android | Gemini Nano (AICore) | Verified on the emulator | Not verified: needs a supported phone |
| iOS | Apple Foundation Models | Verified in the iOS 26 Simulator | Not verified: needs an Apple Intelligence device |

Bimoda is a privacy-aware AI operations copilot for e-commerce teams. It analyzes customer conversations and order problems with **Firebase AI Logic hybrid inference** (Gemini Nano on-device in supported desktop Chrome, Gemini in the cloud otherwise). A **deterministic policy engine** decides what is allowed and a **human approves** anything risky. No real payment, refund, shipment or customer message is ever executed.

![Workspace: policy blocks an edit on a shipped order](docs/screenshots/workspace-policy-block.png)

| Mission Control | Hybrid AI Lab |
|---|---|
| ![](docs/screenshots/mission-control.png) | ![](docs/screenshots/hybrid-lab.png) |
| **Policy Studio** | **Arabic / RTL (beta)** |
| ![](docs/screenshots/policy-studio.png) | ![](docs/screenshots/arabic-rtl-dashboard.png) |
| **Decision trace** | **Privacy Evidence** |
| ![](docs/screenshots/decision-trace.png) | ![](docs/screenshots/privacy-evidence.png) |
| **Trust Center: AI evaluation (real run)** | **What-if policy simulator** |
| ![](docs/screenshots/trust-center-ai-evaluation.png) | ![](docs/screenshots/whatif-simulator.png) |

## Firebase products used
Firebase **AI Logic** (hybrid inference), **App Check** (reCAPTCHA Enterprise in production, debug tokens in dev), **Authentication** (Email/Password + Google), **Cloud Firestore** (+ security rules), **Remote Config**, **Hosting**.

## Features
- **Hybrid AI Engine** (`src/ai/hybrid-engine`): the four SDK modes via the official `firebase/ai` SDK. The shown source is read from `response.inferenceSource`; there is no custom router. Timeout + cancel, privacy gate, deterministic redaction, run telemetry without raw prompts.
- **Privacy modes**: Hybrid, Local Only (never calls the cloud; `PREFER_ON_DEVICE` is tightened to `ONLY_ON_DEVICE`), Cloud. Redaction before any cloud-capable request unless the user consents. An operator **Remote Config switch** can turn cloud inference off for clients that have fetched it (open tabs within seconds via realtime updates, others at the next fetch). It is an operator control, not a security boundary (see `SECURITY.md`).
- **AI features**: conversation intelligence (Zod-validated JSON, prompt-injection aware), response composer (amounts only from order records), operations insights (aggregates only, labeled as interpretation).
- **Rule-based signals**: failed delivery attempts, stale tracking, status regression, change requests after lock, uncertain address; return stages (a courier status never proves warehouse receipt).
- **Policy engine + Policy Studio**: ALLOW / DENY / REQUIRE_APPROVAL / NEED_MORE_INFORMATION with rule id, facts, version, timestamp; unsafe configs rejected (client **and** Firestore rules).
- **Approval workflow** (suggested → pending → approved/rejected → executed (simulated)), role-gated, audit log. Signed-in users get realtime Firestore sync; signed-out users get local demo data.
- **Trust Center**: a deterministic policy-conformance suite and a real-inference evaluation over **40 synthetic scenarios**. Every rate is shown with its denominator; failures of the model path (timeouts, rate limits) are reported separately, never as wrong answers.
- **Decision trace**: for each case, request → AI interpretation → verified facts → policy evaluation → authorization → outcome, with every step labelled by who produced it (customer, model, deterministic rule, human).
- **Privacy Evidence** (Hybrid AI Lab): the routing plan of every privacy mode (the same pure function the engine executes), a redaction preview, the preference actually handed to the SDK, and a diagnostic count of requests to the Gemini endpoints seen via Resource Timing. The count is supporting evidence, not proof of zero cloud requests; in Local Only the engine only ever hands the SDK `ONLY_ON_DEVICE` (tested at the engine and adapter boundaries).
- **Approval enforcement test** (Trust Center): an independent suite attempts prohibited approval transitions (blocked decisions, forged records, wrong roles, skipped or repeated states) with the real approval logic and requires every one to be refused; a mutation test shows it fails if the role check is broken.
- **What-if policy simulator** (Policy Studio): edit a draft policy and see which of the 40 scenarios would be decided differently; unsafe drafts are rejected; nothing is saved unless an admin applies it.
- **UX**: command palette (Ctrl/⌘ K), guided tour, light/dark, offline PWA shell, mobile bottom navigation, reduced-motion support, Arabic/RTL (beta, interface only).

## Verified (2026-11-20)
Desktop Chrome 157 (macOS), Firebase project `bimoda`.
- **Real inference through the SDK**: `ONLY_ON_DEVICE` → on device (~7 s), `ONLY_IN_CLOUD` → cloud (~1.4–1.9 s), `PREFER_ON_DEVICE` → on device (~8 s). Workspace analysis, composer and insights returned validated output on-device and in the cloud; the prompt-injection case was flagged.
- **Privacy**: Local Only blocked the cloud run (diagnostic count: 0 requests to the Gemini endpoints; supporting evidence only); consent ON sent unredacted text; offline reported `offline` with 0 requests; cancel reported `cancelled`; the Remote Config kill switch (flipped from the server, then restored) blocked cloud runs.
- **Firebase**: Email sign-up → sandbox org bootstrap → "Cloud sync live"; approval proposed as Agent, approved as Manager, executed; data survived a reload (read back from Firestore); policy v2 saved through the rules; test accounts and data deleted afterwards. The same flow ran on the production URL with App Check in production mode.
- **Security rules** (`npm run test:rules`, live against the project): **46/46** checks — org isolation, role ceilings, high-risk approvals, immutable evaluation, DENY never approvable, admin-only policy with safety invariants, no raw prompts in AI runs, append-only audit.
- **Automated**: 121 unit tests (mocked SDK adapters only in isolated tests), 38 Playwright e2e on real Chrome (flows, roles, policy, privacy gate, palette, tour, offline banner, Arabic/RTL, no horizontal overflow at 320–1920 px), 2 PWA e2e on the production build (offline reload from the service worker cache). `typecheck`, `lint` (no warnings) and `build` pass.

## Known limitations
- **The on-device path was not re-verified against the final deployed build (commit `b0a7936`).** On the day of the final release Chrome's local model stopped answering even the raw Prompt API (outside Bimoda), so only cloud, policy, approval, Firestore and Remote Config behaviour were re-checked live. The on-device runs reported under "Verified" were made earlier on the same site. One on-device-relevant change shipped since: `ONLY_ON_DEVICE` no longer carries any cloud configuration (the documented usage is mode only); it is covered by unit tests with `firebase/ai` mocked, not by a real-device run. If you can, run Lab A and Workspace analysis in Local only on a healthy Chrome before recording the video.
- **On-device evaluation has not been run yet.** The 40-scenario evaluation ran in cloud mode; when it was attempted on-device, Chrome's local model was unresponsive after earlier abandoned prompts and the run stopped early by design. Run it yourself on a healthy Chrome (Trust Center → Hybrid or Local only).
- **Free-tier rate limits:** the Gemini Developer API returned HTTP 429 after ~14 quick cloud calls, so cloud evaluation is paced (4 s between calls) with one retry after a 429, and stops after 3 consecutive no-answer runs.
- Approval **policy re-evaluation is not server-side**: Firestore rules validate the stored decision, role ceilings and state machine but cannot recompute the policy (Cloud Functions need the Blaze plan; not enabled).
- Orders, customers and conversations are a **synthetic in-app dataset**, not stored in Firestore.
- Each signed-in user gets a personal sandbox org (admin). Inviting other members works through the rules (admin writes `orgs/{org}/members/{uid}`; tested live) but has no UI.
- Arabic is a **beta of the interface only**; AI output and policy explanations stay English. Translations need native review.
- Not exercised: Safari/Firefox, Windows/Linux, completing a Google sign-in (the popup opens from the production site with no configuration error, but choosing an account is the user's step; Email/Password was tested end to end), a Chrome without Gemini Nano for the app flows (cloud fallback was seen in the Lab). Cost comparisons are not shown (no measured billing data).
- Cancelling or timing out an on-device call frees the UI but Chrome may keep generating for a while; piling up local requests can delay later ones (see `docs/HYBRID_AI.md`).
- Debug tokens work only on localhost dev builds; delete them in App Check when no longer needed.

## Run it
```bash
npm install
cp .env.example .env        # fill the Firebase web config (see FIREBASE_SETUP.md)
npm run dev
npm run typecheck && npm run lint && npm test
npm run test:e2e            # needs Chrome installed; starts the dev server
npm run test:pwa            # builds, then tests the offline app shell
npm run test:rules          # live security-rule checks (creates and deletes temporary users)
npm run screenshots         # regenerates docs/screenshots (needs `npm run dev` and Chrome)
```
Without Firebase env values the app still runs; AI requests report `config_missing`. Deploy: `npm run build && firebase deploy --only hosting,firestore:rules,remoteconfig --project <id>`.

## Supported devices
On-device: desktop Chrome 139+ with the Prompt API enabled (`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`) and enough storage for the model; single-turn text only. Everything else uses the cloud. See `docs/HYBRID_AI.md` for real-device findings and a manual checklist.

## Docs
`ARCHITECTURE.md` (docs/), `FIREBASE_SETUP.md`, `SECURITY.md`, `DEMO_GUIDE.md` (docs/), `DEVPOST_SUBMISSION.md`, `docs/DEMO_VIDEO.md`.

## License
Copyright 2026 Mohamed Hekal. Licensed under the [Apache License 2.0](LICENSE) (see also `NOTICE`). Third-party packages keep their own licenses.

**Repository:** https://github.com/mohamedhekal/Bimoda
