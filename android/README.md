# Bimoda for Android

Native Android client (Kotlin, Jetpack Compose) for [Bimoda](../README.md), using the **Firebase AI Logic hybrid SDK**: Gemini Nano on the device through AICore when it is available, cloud Gemini otherwise. It shares the web app's rules: the policy engine, the privacy routing gate and the redaction are ported rule for rule from `../src`.

## What it does

- **Cases:** six synthetic cases (the same scenario cases as the web app).
- **Read the case:** a real `generateContent` call through `firebase-ai`; the badge is read from `response.inferenceSource` (solid = on this device, dashed = cloud). Output is parsed and validated before use; prompt-injection attempts are flagged.
- **Check policy:** a deterministic engine returns ALLOW, DENY, REQUIRE APPROVAL or NEED MORE INFORMATION and stamps the case. The model only proposes.
- **Approve:** role-gated approval (agent vs manager), then a simulated execution. A DENY has no approval path.
- **Hybrid AI Lab:** on-device model status from the SDK, three test runs (`ONLY_ON_DEVICE`, `ONLY_IN_CLOUD`, `PREFER_ON_DEVICE`) and the routing plan for the current privacy mode.

Firebase products used: AI Logic (hybrid inference), App Check (debug provider in debug builds, Play Integrity in release builds) and Remote Config (`cloud_model`, `ai_timeout_ms`, `cloud_inference_enabled`, the same keys as the web app).

## Verification status

| What | Status |
|---|---|
| Cloud inference through Firebase AI Logic (analysis, Lab tests B and C) | Verified on the Android Emulator (API 35) |
| Hybrid fallback: `PREFER_ON_DEVICE` answered by the cloud when no local model exists | Verified on the emulator |
| Local only: cloud runs blocked before the SDK call; `PREFER_ON_DEVICE` tightened to `ONLY_ON_DEVICE` | Verified on the emulator and by unit tests |
| Policy stamps, role-gated approval, simulated execution | Verified on the emulator and by unit tests |
| **On-device inference with Gemini Nano** | **Not verified.** The emulator has no AICore, so the SDK reports the local model as unavailable. It needs a supported physical device (for example Pixel 9 or newer, Galaxy S25 or newer). |

Not included in the Android client: sign-in, Firestore sync, the Trust Center evaluation and the policy simulator (these are in the web app).

## Run it

Requirements: JDK 17, Android SDK 36, a device or emulator on API 26+.

1. Create an Android app with package `app.bimoda.android` in your Firebase project (AI Logic and App Check enabled) and put its `google-services.json` in `android/app/`. This file is not committed.
2. Build and install:
   ```bash
   cd android
   ./gradlew :app:installDebug
   ```
3. Debug builds use the App Check debug provider. Start the app, trigger one request, then read the token and register it in the Firebase console (App Check > Apps > your Android app > Manage debug tokens):
   ```bash
   adb logcat -d | grep "App Check debug token:"
   ```
   Treat the token as a secret and delete it when you finish.
4. Unit tests (policy, approvals, routing, redaction, output validation):
   ```bash
   ./gradlew :app:testDebugUnitTest
   ```

On a supported phone, open **Hybrid AI Lab** and press **Enable Local AI** to download Gemini Nano through AICore.

All data is synthetic. Nothing real is sent, refunded or shipped.
