# Firebase setup

Everything below is already configured for the `bimoda` project; follow it to reproduce in your own project.

1. **Project + Web app**: create a Firebase project and a Web app; put its config into `.env` (`VITE_FIREBASE_*`, see `.env.example`).
2. **Firebase AI Logic**: Console → AI Logic → Get started → Gemini Developer API. Hybrid needs the `firebase` JS SDK ≥ 12.5 (this repo uses ^13).
3. **App Check** (enforced automatically for AI Logic): register the web app with reCAPTCHA Enterprise / Fraud Defense, set `VITE_APPCHECK_SITE_KEY`, and in Google Cloud restrict the key to your hosting domains (`<project>.web.app`, `<project>.firebaseapp.com`).
   - Local dev: `VITE_APPCHECK_DEBUG=true` prints a debug token per browser profile; register each under App Check → Apps → Manage debug tokens (otherwise `401 App Check token is invalid`). Debug mode is honored only in dev builds. `.env.production` forces it off. **Never commit tokens**; delete them when finished.
4. **Authentication**: Console → Authentication → Get started → enable **Email/Password** and **Google** (set a public-facing name and support email). `*.web.app` and `localhost` are authorized domains by default.
5. **Firestore**: Console → Firestore → Create database (Standard edition, production mode; we used `nam5`, which cannot be changed later). Deploy rules: `firebase deploy --only firestore:rules --project <id>`.
6. **Remote Config**: `firebase deploy --only remoteconfig --project <id>` publishes `remoteconfig.template.json` (`cloud_model`, `ai_timeout_ms`, `cloud_inference_enabled`). Setting `cloud_inference_enabled` to `false` and republishing makes clients that fetch the new template behave like Local Only: open tabs get it within seconds through realtime updates, others at the next fetch (5 min in production builds). It is an operator control, not a security boundary (see `SECURITY.md`). `VITE_CLOUD_FAIL_CLOSED=true` keeps cloud inference off until Remote Config has been fetched successfully.
7. **Hosting**: `npm run build && firebase deploy --only hosting --project <id>` → https://&lt;project&gt;.web.app. `sw.js` is served `no-cache`; hashed assets are immutable.
8. **Verify**: `npm run test:rules` runs 43 live checks against your rules (creates and deletes two temporary users; it prints the CLI commands to delete their test data).

Optional `VITE_CLOUD_MODEL` overrides the cloud model (otherwise the Remote Config value, default per the Firebase docs for SDK v13).
