# Security

**Model**: every signed-in user owns a sandbox org (`orgs/demo-<uid>`) where they are admin. Roles (agent / manager / admin) live in `orgs/{org}/members/{uid}`; a client may act as any role up to its membership role, never above it.

**Enforced server-side by `firestore.rules` (verified live, 43 checks, `npm run test:rules`)**
- organization isolation: only members read or write an org's data; unauthenticated access is denied
- role ceilings; high-risk approvals (rules R-002, R-006) need an acting role of manager or admin
- approval state machine with immutable action/order/evaluation; DENY and NEED_MORE_INFORMATION can never become approvals; no deletes
- policy writes: admin only, schema-checked, receipt check and message approval cannot be disabled, version must increase
- AI run records are create-only metadata and reject raw prompts; audit events are append-only and cannot spoof another user

**Client-side controls (defense in depth, not the boundary)**: policy engine, Zod validation of all AI output, untrusted-text prompt framing, deterministic redaction, Local Only mode, Remote Config cloud kill switch.

**Known limits**
- Rules cannot recompute the policy decision; they trust the stored decision and validate its consistency. Server-side re-evaluation would need Cloud Functions (Blaze plan).
- Timestamps are client-supplied ISO strings.
- AI output is untrusted by design; it can only propose actions.
- App Check debug tokens (dev only) are secrets: do not publish them; revoke after use.
- The reCAPTCHA site key and Firebase web config are public identifiers, not secrets.

**Reporting**: open a private security advisory on the repository, or contact the maintainer directly. Please do not file public issues for vulnerabilities.
