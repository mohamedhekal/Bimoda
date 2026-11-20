import type { User } from 'firebase/auth'
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc, writeBatch, type Unsubscribe } from 'firebase/firestore'
import type { AiRunRecord } from '../ai/hybrid-engine/types'
import { DEFAULT_POLICY, type PolicyConfig } from '../domain/policy'
import type { Role } from '../domain/types'
import { getDb } from '../firebase/db'
import { enterCloudMode, exitCloudMode, getState, setState, setSync, type ApprovalRecord, type AuditEvent } from '../stores/store'

const RANK: Record<Role, number> = { agent: 1, manager: 2, admin: 3 }
export const roleRank = (r: Role) => RANK[r]

/** Firestore rejects `undefined`; drop it (and keep plain JSON only). */
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

let unsubs: Unsubscribe[] = []
let current: { uid: string; orgId: string } | null = null

export function friendlyDbError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code === 'permission-denied') return 'The server security rules rejected this action (permission-denied).'
  if (code === 'unavailable') return 'You appear to be offline. Changes are queued and will sync when you reconnect.'
  if (code === 'failed-precondition') return 'Firestore needs an index or is not ready: ' + (e as Error).message
  return e instanceof Error ? e.message : 'Cloud sync failed.'
}

const orgDoc = (orgId: string, ...path: string[]) => doc(getDb(), 'orgs', orgId, ...path)
const orgCol = (orgId: string, name: string) => collection(getDb(), 'orgs', orgId, name)

function report(e: unknown) {
  setSync({ lastError: friendlyDbError(e) })
}

/** Signed-in mode: org bootstrap, realtime listeners, and write-through to Firestore (rules enforce the rest). */
export async function startCloud(user: User): Promise<void> {
  await stopCloud()
  const uid = user.uid
  const orgId = `demo-${uid}`
  current = { uid, orgId }
  setSync({ status: 'connecting', uid, orgId, email: user.email ?? undefined, lastError: undefined, maxRole: undefined })

  enterCloudMode({
    pushRun: (r: AiRunRecord) => void setDoc(orgDoc(orgId, 'aiRuns', r.id), clean({ ...r, userId: uid })).catch(report),
    pushAudit: (e: AuditEvent) => void setDoc(orgDoc(orgId, 'audit', e.id), clean({ ...e, uid })).catch(report),
    pushApproval: (a: ApprovalRecord) =>
      void setDoc(orgDoc(orgId, 'approvals', a.id), clean({ ...a, createdBy: uid, actingRole: a.actingRole ?? getState().settings.role })).catch(report),
    updateApproval: (id, patch) => {
      const role = getState().settings.role
      const body = clean({ ...patch, reviewerRole: patch.reviewerRole ?? role, reviewerUid: uid })
      void updateDoc(orgDoc(orgId, 'approvals', id), body).catch(report)
    },
    savePolicy: (p: PolicyConfig) => void setDoc(orgDoc(orgId, 'policy', 'current'), clean({ ...p, updatedBy: uid })).catch(report),
  })

  try {
    // Bootstrap: the user's own membership is readable even if absent; create the sandbox org + admin membership once.
    const mine = await getDoc(orgDoc(orgId, 'members', uid))
    if (!mine.exists()) {
      const batch = writeBatch(getDb())
      const now = new Date().toISOString()
      batch.set(orgDoc(orgId), { name: `${user.email ?? 'Demo'} sandbox`.slice(0, 80), ownerUid: uid, createdAt: now })
      batch.set(orgDoc(orgId, 'members', uid), clean({ role: 'admin', email: user.email ?? undefined, createdAt: now }))
      await batch.commit()
    }
  } catch (e) {
    setSync({ status: 'error', lastError: friendlyDbError(e) })
    return
  }
  if (current?.uid !== uid) return // user changed while bootstrapping

  const fail = (e: unknown) => setSync({ status: 'error', lastError: friendlyDbError(e) })
  unsubs = [
    onSnapshot(
      orgDoc(orgId, 'members', uid),
      (snap) => {
        const role = snap.data()?.role as Role | undefined
        if (!role) return
        setSync({ status: 'live', maxRole: role })
        // the UI role can never exceed what the server membership grants
        if (roleRank(getState().settings.role) > roleRank(role)) setState((s) => ({ ...s, settings: { ...s.settings, role } }))
      },
      fail,
    ),
    onSnapshot(
      query(orgCol(orgId, 'approvals'), orderBy('updatedAt', 'desc'), limit(200)),
      (snap) => setState((s) => ({ ...s, approvals: snap.docs.map((d) => d.data() as ApprovalRecord) })),
      fail,
    ),
    onSnapshot(
      query(orgCol(orgId, 'aiRuns'), orderBy('timestamp', 'desc'), limit(200)),
      (snap) => setState((s) => ({ ...s, runs: snap.docs.map((d) => d.data() as AiRunRecord) })),
      fail,
    ),
    onSnapshot(
      query(orgCol(orgId, 'audit'), orderBy('at', 'desc'), limit(300)),
      (snap) => setState((s) => ({ ...s, audit: snap.docs.map((d) => d.data() as AuditEvent) })),
      fail,
    ),
    onSnapshot(
      orgDoc(orgId, 'policy', 'current'),
      (snap) => {
        const d = snap.data()
        setState((s) => ({ ...s, policy: d ? ({ ...DEFAULT_POLICY, ...d, updatedBy: undefined } as PolicyConfig) : DEFAULT_POLICY }))
      },
      fail,
    ),
  ]
}

export async function stopCloud(): Promise<void> {
  unsubs.forEach((u) => u())
  unsubs = []
  if (current) {
    current = null
    exitCloudMode()
  }
}
