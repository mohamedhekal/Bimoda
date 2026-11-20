// Live security-rules test against the REAL Firebase project (no emulator download needed).
// Creates two temporary email/password users, exercises the rules over the Firestore REST API, then deletes the users.
// Usage: node --env-file=.env scripts/rules-live-test.mjs
const KEY = process.env.VITE_FIREBASE_API_KEY
const PROJECT = process.env.VITE_FIREBASE_PROJECT_ID
if (!KEY || !PROJECT) throw new Error('Set VITE_FIREBASE_API_KEY and VITE_FIREBASE_PROJECT_ID (use --env-file=.env)')
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
const stamp = Date.now()

const enc = (v) => {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } }
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(v)
          .filter(([, x]) => x !== undefined)
          .map(([k, x]) => [k, enc(x)]),
      ),
    },
  }
}
const fields = (o) => enc(o).mapValue.fields

async function signUp(label) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `rules-test-${label}-${stamp}@example.test`, password: `Tmp-${stamp}-${label}`, returnSecureToken: true }),
  })
  const j = await r.json()
  if (!j.idToken) throw new Error('signUp failed: ' + JSON.stringify(j))
  return { uid: j.localId, token: j.idToken, orgId: `demo-${j.localId}` }
}
const deleteUser = (u) =>
  fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: u.token }),
  })

const call = async (u, method, path, body) => {
  const r = await fetch(`${DOCS}/${path}`, {
    method,
    headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { ok: r.ok, status: r.status }
}
const commit = async (u, writes) => {
  const r = await fetch(`${DOCS}:commit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${u.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ writes }),
  })
  return { ok: r.ok, status: r.status }
}
const create = (u, org, col, id, data) => call(u, 'POST', `orgs/${org}/${col}?documentId=${id}`, { fields: fields(data) })
const get = (u, path) => call(u, 'GET', path)
const patch = (u, org, col, id, data) =>
  call(
    u,
    'PATCH',
    `orgs/${org}/${col}/${id}?${Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${k}`)
      .join('&')}`,
    { fields: fields(data) },
  )
const now = () => new Date().toISOString()

const evaluation = (ruleId, decision) => ({ ruleId, decision, explanation: 'x', enforcement: 'y', facts: { a: 1 }, policyVersion: 1, timestamp: now() })
const approval = (uid, id, ruleId, decision, state, actingRole = 'agent') => ({
  id,
  conversationId: 'CV-001',
  orderId: 'ORD-1001',
  action: 'REFUND',
  label: 'REFUND',
  state,
  evaluation: evaluation(ruleId, decision),
  proposedBy: 'user',
  createdBy: uid,
  actingRole,
  createdAt: now(),
  updatedAt: now(),
})
const policy = (uid, over = {}) => ({
  version: 2,
  editLockFrom: 'processing',
  maxEditValueCents: 15000,
  refundApprovalThresholdCents: 10000,
  requireWarehouseReceipt: true,
  messagesRequireApproval: true,
  updatedBy: uid,
  ...over,
})

let pass = 0,
  fail = 0
const expect = (name, res, shouldSucceed) => {
  const good = res.ok === shouldSucceed
  if (good) pass++
  else fail++
  console.log(`${good ? 'PASS' : 'FAIL'}  ${name}  (${shouldSucceed ? 'allowed' : 'denied'} expected, HTTP ${res.status})`)
}

const A = await signUp('a'),
  B = await signUp('b')
try {
  const t = now()
  // --- bootstrap ---
  expect(
    'A bootstraps own org + admin membership (batch)',
    await commit(A, [
      {
        update: {
          name: `projects/${PROJECT}/databases/(default)/documents/orgs/${A.orgId}`,
          fields: fields({ name: 'A sandbox', ownerUid: A.uid, createdAt: t }),
        },
        currentDocument: { exists: false },
      },
      {
        update: {
          name: `projects/${PROJECT}/databases/(default)/documents/orgs/${A.orgId}/members/${A.uid}`,
          fields: fields({ role: 'admin', email: 'a@example.test', createdAt: t }),
        },
        currentDocument: { exists: false },
      },
    ]),
    true,
  )
  expect(
    "B cannot create an org under A's id",
    await commit(B, [
      {
        update: { name: `projects/${PROJECT}/databases/(default)/documents/orgs/${A.orgId}2`, fields: fields({ name: 'x', ownerUid: B.uid, createdAt: t }) },
        currentDocument: { exists: false },
      },
    ]),
    false,
  )
  expect("B cannot make itself member of A's org", await create(B, A.orgId, 'members', B.uid, { role: 'admin', email: 'b@example.test', createdAt: t }), false)
  expect(
    'B cannot self-promote by creating an admin member in its own org without the org',
    await create(B, B.orgId, 'members', B.uid, { role: 'admin', email: 'b', createdAt: t }),
    false,
  )
  expect(
    'B bootstraps its own org',
    await commit(B, [
      {
        update: {
          name: `projects/${PROJECT}/databases/(default)/documents/orgs/${B.orgId}`,
          fields: fields({ name: 'B sandbox', ownerUid: B.uid, createdAt: t }),
        },
        currentDocument: { exists: false },
      },
      {
        update: {
          name: `projects/${PROJECT}/databases/(default)/documents/orgs/${B.orgId}/members/${B.uid}`,
          fields: fields({ role: 'admin', email: 'b@example.test', createdAt: t }),
        },
        currentDocument: { exists: false },
      },
    ]),
    true,
  )

  // --- isolation ---
  expect("B cannot read A's org", await get(B, `orgs/${A.orgId}`), false)
  expect("B cannot read A's approvals", await get(B, `orgs/${A.orgId}/approvals`), false)
  expect('A can read own org', await get(A, `orgs/${A.orgId}`), true)
  expect('unauthenticated read is denied', await get({ token: '' }, `orgs/${A.orgId}`), false)

  // --- approvals (A is admin and may act as agent/manager) ---
  expect(
    'A creates REQUIRE_APPROVAL refund (R-006) as agent',
    await create(A, A.orgId, 'approvals', 'ap1', approval(A.uid, 'ap1', 'R-006', 'REQUIRE_APPROVAL', 'pending_approval')),
    true,
  )
  expect(
    'DENY decisions can never become approvals',
    await create(A, A.orgId, 'approvals', 'ap2', approval(A.uid, 'ap2', 'R-001', 'DENY', 'pending_approval')),
    false,
  )
  expect(
    'state must match the decision (ALLOW cannot be pending_approval)',
    await create(A, A.orgId, 'approvals', 'ap3', approval(A.uid, 'ap3', 'R-009', 'ALLOW', 'pending_approval')),
    false,
  )
  expect(
    'approval cannot be created pre-approved',
    await create(A, A.orgId, 'approvals', 'ap4', approval(A.uid, 'ap4', 'R-006', 'REQUIRE_APPROVAL', 'approved')),
    false,
  )
  expect(
    'approval with an unknown extra field is rejected',
    await create(A, A.orgId, 'approvals', 'ap5', { ...approval(A.uid, 'ap5', 'R-006', 'REQUIRE_APPROVAL', 'pending_approval'), isAdmin: true }),
    false,
  )
  expect(
    'A approving as agent is rejected for a high-risk rule',
    await patch(A, A.orgId, 'approvals', 'ap1', { state: 'approved', reviewer: 'a', reviewerRole: 'agent', reviewerUid: A.uid, updatedAt: now() }),
    false,
  )
  expect(
    'approval changes may not touch the evaluation',
    await patch(A, A.orgId, 'approvals', 'ap1', {
      state: 'approved',
      reviewer: 'a',
      reviewerRole: 'manager',
      reviewerUid: A.uid,
      updatedAt: now(),
      evaluation: evaluation('R-009', 'ALLOW'),
    }),
    false,
  )
  expect(
    'A approves as manager (allowed role ceiling)',
    await patch(A, A.orgId, 'approvals', 'ap1', { state: 'approved', reviewer: 'a', reviewerRole: 'manager', reviewerUid: A.uid, updatedAt: now() }),
    true,
  )
  expect(
    'cannot jump approved -> pending_approval',
    await patch(A, A.orgId, 'approvals', 'ap1', { state: 'pending_approval', reviewer: 'a', reviewerRole: 'manager', reviewerUid: A.uid, updatedAt: now() }),
    false,
  )
  expect(
    'A executes the approved action (simulated)',
    await patch(A, A.orgId, 'approvals', 'ap1', {
      state: 'executed',
      reviewer: 'a',
      reviewerRole: 'manager',
      reviewerUid: A.uid,
      note: 'sim',
      updatedAt: now(),
    }),
    true,
  )
  expect('approvals cannot be deleted', await call(A, 'DELETE', `orgs/${A.orgId}/approvals/ap1`), false)

  // --- members / role ceilings ---
  expect('A (admin) adds B as an agent member', await create(A, A.orgId, 'members', B.uid, { role: 'agent', email: 'b@example.test', createdAt: t }), true)
  expect("B can now read A's org", await get(B, `orgs/${A.orgId}`), true)
  expect(
    'B (agent) proposes a high-risk refund as agent',
    await create(B, A.orgId, 'approvals', 'ap6', approval(B.uid, 'ap6', 'R-006', 'REQUIRE_APPROVAL', 'pending_approval')),
    true,
  )
  expect(
    'B cannot propose while claiming manager',
    await create(B, A.orgId, 'approvals', 'ap7', approval(B.uid, 'ap7', 'R-006', 'REQUIRE_APPROVAL', 'pending_approval', 'manager')),
    false,
  )
  expect(
    'B cannot approve as manager (above its ceiling)',
    await patch(B, A.orgId, 'approvals', 'ap6', { state: 'approved', reviewer: 'b', reviewerRole: 'manager', reviewerUid: B.uid, updatedAt: now() }),
    false,
  )
  expect(
    'B cannot approve as agent a high-risk action',
    await patch(B, A.orgId, 'approvals', 'ap6', { state: 'approved', reviewer: 'b', reviewerRole: 'agent', reviewerUid: B.uid, updatedAt: now() }),
    false,
  )
  expect(
    'B may reject as agent',
    await patch(B, A.orgId, 'approvals', 'ap6', { state: 'rejected', reviewer: 'b', reviewerRole: 'agent', reviewerUid: B.uid, updatedAt: now() }),
    true,
  )
  expect('B cannot promote itself', await patch(B, A.orgId, 'members', B.uid, { role: 'admin' }), false)
  expect('B cannot add members', await create(B, A.orgId, 'members', 'someone', { role: 'agent', createdAt: t }), false)

  // --- policy ---
  expect('B (agent) cannot write policy', await call(B, 'PATCH', `orgs/${A.orgId}/policy/current`, { fields: fields(policy(B.uid)) }), false)
  expect('A (admin) writes a valid policy', await call(A, 'PATCH', `orgs/${A.orgId}/policy/current`, { fields: fields(policy(A.uid)) }), true)
  expect(
    'policy cannot disable the warehouse-receipt check',
    await call(A, 'PATCH', `orgs/${A.orgId}/policy/current`, { fields: fields(policy(A.uid, { version: 3, requireWarehouseReceipt: false })) }),
    false,
  )
  expect(
    'policy cannot disable message approval',
    await call(A, 'PATCH', `orgs/${A.orgId}/policy/current`, { fields: fields(policy(A.uid, { version: 3, messagesRequireApproval: false })) }),
    false,
  )
  expect('policy version must increase', await call(A, 'PATCH', `orgs/${A.orgId}/policy/current`, { fields: fields(policy(A.uid, { version: 2 })) }), false)
  expect(
    'policy rejects an invalid lock stage',
    await call(A, 'PATCH', `orgs/${A.orgId}/policy/current`, { fields: fields(policy(A.uid, { version: 3, editLockFrom: 'delivered' })) }),
    false,
  )

  // --- AI runs + audit ---
  const run = {
    id: 'r1',
    feature: 'x',
    requestedPreference: 'PREFER_ON_DEVICE',
    effectivePreference: 'PREFER_ON_DEVICE',
    privacyMode: 'hybrid',
    source: 'ON_DEVICE',
    sourceBasis: 'sdk',
    status: 'success',
    durationMs: 5,
    inputChars: 10,
    redactions: 0,
    redactionApplied: false,
    timestamp: now(),
    userId: B.uid,
  }
  expect('B records an AI run (metadata only)', await create(B, A.orgId, 'aiRuns', 'r1', run), true)
  expect('AI run with a raw prompt field is rejected', await create(B, A.orgId, 'aiRuns', 'r2', { ...run, id: 'r2', prompt: 'customer text' }), false)
  expect('AI run attributed to another user is rejected', await create(B, A.orgId, 'aiRuns', 'r3', { ...run, id: 'r3', userId: A.uid }), false)
  expect('AI runs are immutable', await patch(B, A.orgId, 'aiRuns', 'r1', { durationMs: 1 }), false)
  expect(
    'B appends an audit event',
    await create(B, A.orgId, 'audit', 'e1', { id: 'e1', at: now(), actor: 'b', action: 'x', entity: 'o', correlationId: 'c', uid: B.uid }),
    true,
  )
  expect('audit events cannot be edited', await patch(B, A.orgId, 'audit', 'e1', { action: 'tampered' }), false)
  expect('audit events cannot be deleted', await call(B, 'DELETE', `orgs/${A.orgId}/audit/e1`), false)
  expect(
    'audit event spoofing another uid is rejected',
    await create(B, A.orgId, 'audit', 'e2', { id: 'e2', at: now(), actor: 'a', action: 'x', entity: 'o', correlationId: 'c', uid: A.uid }),
    false,
  )
} finally {
  await deleteUser(A)
  await deleteUser(B)
  console.log(
    `\ntemporary test users deleted. Clean test data with:\n  firebase firestore:delete /orgs/${A.orgId} -r -f --project ${PROJECT}\n  firebase firestore:delete /orgs/${B.orgId} -r -f --project ${PROJECT}`,
  )
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
