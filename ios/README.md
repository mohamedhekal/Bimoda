# Bimoda for iOS

Native iOS client (Swift, SwiftUI) for [Bimoda](../README.md), using the **Firebase AI Logic hybrid SDK for Apple platforms**: Apple Foundation Models on the device when Apple Intelligence is available, cloud Gemini otherwise. It shares the web app's rules: the policy engine, the privacy routing gate and the redaction are ported rule for rule from `../src`.

## What it does

- **Cases:** six synthetic cases (the same scenario cases as the web and Android apps).
- **Read the case:** a real request through `FirebaseAILogic` (`generativeModelSession(model:)` and `respond(to:)`). The badge is derived from `response.rawResponse.modelVersion` (solid = on this device, dashed = cloud). Output is parsed and validated before use; prompt-injection attempts are flagged.
- **Check policy:** a deterministic engine returns ALLOW, DENY, REQUIRE APPROVAL or NEED MORE INFORMATION and stamps the case. The model only proposes.
- **Approve:** role-gated approval (agent vs manager), then a simulated execution. A DENY has no approval path.
- **Hybrid AI Lab:** on-device model status from the SDK, three test runs and the routing plan for the current privacy mode.

How the four inference preferences map to the Apple SDK (it has no mode enum; the choice is the model you hand the session):

| Preference | Model given to the session |
|---|---|
| `PREFER_ON_DEVICE` | `.hybridModel(primary: system model, secondary: Gemini)` |
| `ONLY_ON_DEVICE` | the system model alone: no cloud model exists in the session |
| `PREFER_IN_CLOUD` | `.hybridModel(primary: Gemini, secondary: system model)` |
| `ONLY_IN_CLOUD` | the Gemini model alone |

Firebase products used: AI Logic (hybrid inference), App Check (debug provider in debug builds, App Attest in release builds) and Remote Config (`cloud_model`, `ai_timeout_ms`, `cloud_inference_enabled`, the same keys as the web app).

## Verification status

| What | Status |
|---|---|
| Cloud inference through Firebase AI Logic (analysis, Lab test B) | Verified in the iOS 26 Simulator |
| Hybrid fallback: an on-device-first request answered by the cloud when the local model cannot run | Verified in the Simulator |
| Local only: cloud runs blocked before the SDK call; on-device-only failure reported as unavailable, nothing sent | Verified in the Simulator |
| Policy stamps, prompt-injection flag, Remote Config, App Check debug provider | Verified in the Simulator |
| Role-gated approval and simulated execution | Same logic as Android (unit tested there); not clicked through on iOS |
| **On-device inference with Apple Foundation Models** | **Not verified.** It needs an Apple Intelligence capable device (or an Apple silicon Mac for the Simulator). On an Intel Mac the Simulator reports the model as available but generation fails; the app reports that as unavailable. |

There are no unit tests in the iOS project yet.

Not included in the iOS client: sign-in, Firestore sync, the Trust Center evaluation and the policy simulator (these are in the web app).

## Run it

Requirements: Xcode 26.2 or newer, iOS 26 Simulator or device.

1. Create an iOS app with bundle ID `app.bimoda.ios` in your Firebase project (AI Logic and App Check enabled) and put its `GoogleService-Info.plist` in `ios/Bimoda/`. This file is not committed.
2. Open `ios/Bimoda.xcodeproj` and run the `Bimoda` scheme, or from a terminal (keep ad-hoc signing on: an unsigned Simulator build cannot use the keychain, and Remote Config then fails):
   ```bash
   cd ios
   xcodebuild -project Bimoda.xcodeproj -scheme Bimoda -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build CODE_SIGN_IDENTITY=- build
   ```
3. Debug builds use the App Check debug provider. Start the app, trigger one request, then read the token and register it in the Firebase console (App Check > Apps > your iOS app > Manage debug tokens):
   ```bash
   xcrun simctl spawn booted log show --last 10m --predicate 'process == "Bimoda"' | grep "App Check debug token"
   ```
   Treat the token as a secret and delete it when you finish.

All data is synthetic. Nothing real is sent, refunded or shipped.
