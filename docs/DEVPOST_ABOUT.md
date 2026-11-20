# Bimoda — Hybrid AI Intelligence for Modern Commerce

## Inspiration 💡

E-commerce support and fulfillment teams handle messages that mix pricing confusion, locked shipments, unclear addresses, disputed returns and, sometimes, prompt-injection attempts. Rigid automation breaks on these cases. Cloud-only AI requires sending customer data off the device, which adds privacy and connectivity considerations, and a model alone should not decide what a business is allowed to do.

So we asked: **what if an operations copilot kept data on the device whenever it could, said exactly where each answer was produced, and could never change an order by itself?**

That question became **Bimoda**.

## What it does 🚀

Bimoda is a hybrid AI operations copilot for e-commerce teams. Try it at **https://bimoda.web.app** (no sign-in, synthetic data only).

- **Understands the case.** It reads the conversation and the order and returns intent, urgency, missing information and a proposed action as validated JSON. Customer text is treated as untrusted data: injection attempts are flagged and not followed.
- **Shows where the AI ran.** Every answer carries a badge read from the Firebase SDK's `inferenceSource`: solid for "on this device", dashed for "cloud".
- **Lets policy decide, not the model.** A deterministic policy engine returns ALLOW, DENY, REQUIRE APPROVAL or NEED MORE INFORMATION with the rule that applied. A shipped order stays locked; a courier "picked up" status never counts as warehouse receipt. The decision lands on the case as a stamp.
- **Keeps a person in the loop.** Risky actions wait for approval by the right role. Nothing real is sent, refunded or shipped in the demo.
- **Explains every outcome.** A decision trace walks from the customer request to the AI interpretation, verified facts, policy rule, authorization and outcome, and labels each step as model-generated, deterministic or human.
- **Proves its claims.** The Trust Center runs 40 synthetic scenarios through real inference and reports every rate with its denominator, plus an independent test that tries forbidden approvals and requires every attempt to be refused.
- **Hybrid AI Lab and Privacy Evidence.** Run the same case as on-device only, cloud only and hybrid, and see the routing plan and a redaction preview for each privacy mode.
- **What-if policy simulator.** Preview which scenarios a policy change would affect before applying it.

## How we used Firebase AI Logic 🔥

Hybrid inference is the core of the product, not an add-on:

- Bimoda calls `getGenerativeModel` from `firebase/ai` with the four documented modes (`PREFER_ON_DEVICE`, `ONLY_ON_DEVICE`, `PREFER_IN_CLOUD`, `ONLY_IN_CLOUD`) and reads `response.inferenceSource`. There is no custom router.
- **Gemini Nano** runs on-device in supported desktop Chrome; "Enable Local AI" calls `initializeDeviceModel()` from a user click. Cloud Gemini is the fallback.
- Structured output uses `responseConstraint` on-device and JSON mode in the cloud, then Zod validates every answer.
- A privacy gate sits in front of the SDK: **Local only** hands the SDK only `ONLY_ON_DEVICE`; cloud-capable requests are redacted (names, phones, emails, addresses) unless the user consents.

Other Firebase products: **App Check** (reCAPTCHA Enterprise), **Authentication**, **Cloud Firestore** with security rules (approvals, AI run metadata, audit log and policy for signed-in users), **Remote Config** (cloud model, timeout and an operator switch for cloud inference) and **Hosting**.

## How we built it 🛠️

React, TypeScript and Vite with Tailwind CSS; Zod for validation; Playwright and Vitest for tests. The interface is designed around the subject: the open case is a paper docket, decisions are stamps, and the route is drawn solid or dashed. It works offline as a PWA and has an Arabic (RTL) interface in beta.

## Challenges 🧩

- **On-device reliability.** Chrome's local model can stall, so every call has a timeout and a cancel, and the evaluation stops instead of piling up requests. We also found that unbounded arrays in the output schema made Gemini Nano run until timeout.
- **Privacy versus quality.** Redacting before the SDK chooses a route means even on-device answers see placeholders in Hybrid mode; Local only keeps full context.
- **Honest evidence.** Browser request counts are diagnostic, not proof, so the guarantee is the routing rule itself, tested at the engine and adapter boundaries.
- **Rate limits.** The free cloud tier returned HTTP 429 during evaluation, so cloud runs are paced and retried once.

## What we verified ✅

- Real on-device and cloud inference through the SDK on desktop Chrome, with the source read from the response.
- A 40-scenario cloud evaluation on the live site: 40/40 valid answers, intent accuracy 100% (40/40) against our own labels, prompt-injection recall 6/6. It is a small synthetic sanity suite, not a benchmark, and results vary slightly between runs.
- 46 live checks of the Firestore security rules, 121 unit tests and 38 end-to-end tests.

## Known limits

- The policy decision is computed in the browser; Firestore rules enforce roles and the approval state machine but cannot recompute the decision. Server-side re-evaluation is the next step.
- Orders and conversations are synthetic and live in the app, not in Firestore.
- The 40-scenario evaluation has been completed in cloud mode only.

## What's next 🌍

Server-side policy enforcement, integrations with real store and carrier systems behind the same approval gates, a full on-device evaluation, and native Android and iOS clients using Firebase AI Logic.

**Bimoda — Commerce intelligence, on-device and in the cloud.**

*Built for the Firebase #BuildHybridAI 2026 hackathon. Built with an AI coding assistant (Claude Code); no pre-existing project code was reused.*
