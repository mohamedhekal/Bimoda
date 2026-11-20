# Security

**Scope of this document:** what is enforced where. Anything labelled *client-side* can be bypassed by someone who controls their own browser; it protects honest users and keeps the product coherent, it is not a security boundary.

## Enforced server-side by `firestore.rules` (verified live: `npm run test:rules`, 43 checks)
- organization isolation: only members read or write an org's data; unauthenticated access is denied
- role ceilings: a client may act as any role up to its membership role, never above it; high-risk approvals (rules R-002, R-006) need an acting role of manager or admin
- approval state machine with immutable action/order/evaluation; DENY and NEED_MORE_INFORMATION decisions can never become approvals; no deletes
- policy writes: admin only, schema-checked, receipt check and message approval cannot be disabled, version must increase
- AI run records are create-only metadata and reject raw prompts; audit events are append-only and cannot spoof another user

## Client-side only (not a security boundary)
- **The policy engine itself.** Firestore rules cannot recompute a policy decision; they trust the stored decision and validate its consistency (and that blocked decisions never become approvals). A user who edits their own client could write a different but self-consistent evaluation. Server-side re-evaluation needs trusted code (Cloud Functions, Blaze plan), which is not enabled. Do not treat Bimoda's policy decisions as server-enforced before that exists.
- Zod validation of AI output, untrusted-text prompt framing, deterministic redaction, Local Only mode, the Privacy Proof panel and the Trust Center figures (all computed in the browser).
- AI output is untrusted by design; it can only propose actions.

## Remote Config cloud switch: an operator control, not a kill switch you can rely on
`cloud_inference_enabled=false` makes participating clients behave like Local Only. Limits:
- It reaches a client only after that client fetches the new template. Open tabs receive realtime updates (seconds, when the realtime channel is connected); otherwise the fetch interval applies (5 minutes in production builds, also re-checked when a tab becomes visible). Older or offline clients keep the last values they activated.
- If Remote Config cannot be fetched, clients keep their last activated values or the in-code default (**cloud on**, fail-open, for availability). Build with `VITE_CLOUD_FAIL_CLOSED=true` to keep cloud inference **off** until a fetch has succeeded. The Lab shows the freshness (`live`, `stale`, `error`, `default`).
- It is enforced in the browser, so anyone with the public web config can still call the AI endpoint directly. The controls that actually limit cloud usage are **App Check enforcement**, API quotas and billing alerts in Google Cloud, and (for real cost control) a server-side proxy.

## Privacy Proof Mode: what it proves
It runs the same routing function the engine executes and measures requests to the Gemini model endpoints with the Resource Timing API. That shows the *prompt* was or was not sent to the cloud model in this browser. It does not show that the page makes no network requests: the Firebase SDK can contact App Check, Remote Config, Auth and Firestore.

## Other
- App Check debug tokens (dev only) are secrets: do not publish them; revoke after use. The reCAPTCHA site key and the Firebase web config are public identifiers.
- Timestamps are client-supplied ISO strings.

**Reporting:** open a private security advisory on the repository, or contact the maintainer directly. Please do not file public issues for vulnerabilities.
