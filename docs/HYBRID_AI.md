# Hybrid AI

Bimoda calls `getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })` from `firebase/ai` and reads `result.response.inferenceSource`. The SDK, not Bimoda, decides routing:

| Mode | Behavior (per Firebase docs) |
|---|---|
| PREFER_ON_DEVICE | on-device if available, else cloud |
| ONLY_ON_DEVICE | on-device or throw |
| PREFER_IN_CLOUD | cloud if available, else on-device |
| ONLY_IN_CLOUD | cloud or throw |

- "Enable Local AI" calls `model.initializeDeviceModel(progressCallback)` directly inside a click handler (Chrome user activation).
- Structured output: `onDeviceParams.promptOptions.responseConstraint` (JSON schema from Zod) on device; JSON mime type in cloud. Output is always re-validated with Zod.
- If the SDK does not report a source for an `ONLY_*` mode, the run is recorded with `sourceBasis: "mode"` and the UI labels it "(per mode)". Otherwise `sourceBasis: "sdk"`.
- Limits: on-device is single-turn text only; no tools. Hybrid does not support Live API, count tokens or server prompt templates.

## Manual real-device checklist (mocks do NOT prove this)
- [ ] Desktop Chrome 139+, `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled, restarted
- [ ] Lab shows status `downloadable`/`available`; click Enable Local AI; progress reaches 100%
- [ ] Test A (ONLY_ON_DEVICE) returns text with badge "Processed on this device"
- [ ] Test B (ONLY_IN_CLOUD) returns text with badge "Processed in cloud" (App Check token accepted)
- [ ] Test C (PREFER_ON_DEVICE): on-device when model ready; disable model/other browser → cloud
- [ ] Local Only mode + Test B → blocked, no network request to Firebase AI
- [ ] Workspace "Analyze" returns validated JSON on both paths
- [ ] Record results and screenshots for Devpost

## Findings from real-device testing (Chrome 157, macOS, 2026-11-20)
- **Unbounded arrays hang Gemini Nano; keep `maxItems`.** A schema whose arrays had no `maxItems` made generation run until our 45s timeout, reproduced twice with the raw Prompt API. The same schema with `maxItems` answered in ~6-10s. `toDeviceSchema()` strips only `$schema`, `additionalProperties`, `minLength` and `minItems` (all four combinations tested on fresh pages answered); Zod still validates everything.
- **Not reproduced:** an early SDK-driven analysis with the full Zod schema also hung, and afterwards even `LanguageModel.create()` timed out until a page reload. The full schema later answered on fresh pages, so that hang was probably a wedged model session rather than the schema. Treat on-device calls as able to hang: that is why the timeout/cancel below exists.
- **Every call has a 45s timeout** (`HybridEngine`): a hung on-device call becomes an `unavailable` result with a clear reason instead of freezing the UI. The SDK/Prompt API may keep running in the background; reload the page if the model stays unresponsive.
- **App Check debug tokens are per browser profile.** Each Chrome profile prints its own token; register each one under App Check → Manage debug tokens, otherwise cloud calls return `401 App Check token is invalid`. Delete tokens when done.
- **Redaction costs on-device quality in Hybrid mode**: the prompt is redacted before the SDK decides the route, so even on-device answers see `[ADDRESS]` placeholders. Use Local Only mode (no redaction, never leaves the device) when full context matters.
- First on-device call after a model load can be slow (~9s session creation).
- **Cancelled or timed-out on-device calls may keep Chrome's model busy.** Our timeout/cancel frees the UI immediately, but the underlying Prompt API generation can keep running. After several abandoned calls even a trivial raw `prompt()` waited more than 20 s, then recovered by itself (~1 min) and answered in 335 ms. Avoid piling up on-device requests; if the local model looks stuck, wait a minute or reload.
- Production check (2026-11-20, https://bimoda.web.app, Chrome 157): `ONLY_ON_DEVICE` on device (5.7 s), `ONLY_IN_CLOUD` cloud (1.4 s), `PREFER_ON_DEVICE` on device (4.6 s), App Check in production mode, Remote Config live.
