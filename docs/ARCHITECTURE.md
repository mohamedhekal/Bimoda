# Architecture

`UI (React) → features → ai/features.ts → HybridEngine → firebaseAdapter (firebase/ai) → Gemini Nano | Gemini cloud → Zod validation → policy engine (domain/policy.ts) → approval workflow → audit`

- **Privacy boundary** (`HybridEngine.run`): decides before any SDK call. Local Only blocks cloud-capable preferences and tightens `PREFER_ON_DEVICE`. Cloud-capable runs are redacted (`ai/privacy/redact.ts`) unless the user consented; placeholders echoed by the model are restored locally afterwards.
- **Robustness**: every call races a 45 s timeout and a user cancel; `AbortSignal` is passed to the adapter. Outcomes are explicit statuses (`success`, `unavailable`, `blocked_privacy`, `consent_required`, `offline`, `config_missing`, `cancelled`, `error`); a source is never guessed (only `ONLY_*` modes may derive it, flagged `sourceBasis: "mode"`).
- **Policy**: the model proposes, `evaluatePolicy` decides. DENY / NEED_MORE_INFORMATION can never become approvals.
- **Money**: `computeOrderTotals` is the only source of amounts; the composer uses placeholders filled from records and rejects invented amounts.
- **Signals** (`domain/signals.ts`): rule-based shipping/return analysis on recorded events only, deterministic against a fixed demo date.
- **State and sync**: `src/stores/store.ts` keeps local demo data in localStorage. When a user signs in, `src/services/cloud.ts` bootstraps `orgs/demo-<uid>` (org + admin membership in one batch), stashes the local copy, and drives approvals / AI runs / audit / policy from realtime Firestore listeners; every write goes through Firestore (rules enforce authorization). Sign-out restores the local copy; server data is never persisted locally. Firestore uses an IndexedDB cache so writes queue offline.
- **Remote Config** (`firebase/remoteConfig.ts`): `cloud_model`, `ai_timeout_ms` (clamped 1-300 s) and `cloud_inference_enabled` (operator kill switch that behaves like Local Only). In-code defaults apply until a fetch succeeds.
- **i18n** (`src/i18n`): English strings are the keys; `ar.ts` holds the Arabic (beta) interface translations; a unit test fails if a `t('…')` literal has no translation. Logical CSS utilities + `dir="rtl"` handle mirroring; AI output stays English.
- **PWA**: `public/sw.js` caches the app shell and hashed assets (production only), never cross-origin requests, so Firebase/AI calls always hit the network. Every route is in the first bundle so it can be cached.
- **Design system**: `src/design-system` (ui + utils), Tailwind v4 tokens in `src/index.css`.
