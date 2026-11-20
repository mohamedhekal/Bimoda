import { useSyncExternalStore } from 'react'
import type { AiRunRecord, PrivacySettings } from '../ai/hybrid-engine/types'
import { DEFAULT_POLICY, type PolicyConfig, type PolicyEvaluation } from '../domain/policy'
import type { ApprovalState, ProposedActionKind, Role } from '../domain/types'

export interface ApprovalRecord {
  id: string
  conversationId: string
  orderId: string
  action: ProposedActionKind
  label: string
  state: ApprovalState
  evaluation: PolicyEvaluation
  proposedBy: 'ai' | 'user'
  /** Role the proposer acted as (checked against their membership by the server rules) */
  actingRole?: Role
  createdBy?: string
  reviewer?: string
  reviewerRole?: Role
  reviewerUid?: string
  /** What executing means in this demo */
  note?: string
  createdAt: string
  updatedAt: string
}

export interface AuditEvent {
  id: string
  at: string
  actor: string
  action: string
  entity: string
  correlationId: string
  uid?: string
}

export interface SyncState {
  status: 'off' | 'connecting' | 'live' | 'error'
  uid?: string
  email?: string
  orgId?: string
  /** Highest role the server membership grants; the UI role can never exceed it */
  maxRole?: Role
  /** Last problem reported by Firestore (e.g. permission-denied from the security rules) */
  lastError?: string
}

export interface AppState {
  settings: PrivacySettings & { theme: 'dark' | 'light'; role: Role; toured: boolean; lang: 'en' | 'ar' }
  policy: PolicyConfig
  runs: AiRunRecord[]
  approvals: ApprovalRecord[]
  audit: AuditEvent[]
  /** Not persisted */
  sync: SyncState
}

/** Handlers registered by services/cloud.ts while a user is signed in; when set, writes go to Firestore instead of local state. */
export interface CloudWriters {
  pushRun(r: AiRunRecord): void
  pushAudit(e: AuditEvent): void
  pushApproval(a: ApprovalRecord): void
  updateApproval(id: string, patch: Partial<ApprovalRecord>): void
  savePolicy(p: PolicyConfig): void
}
let cloud: CloudWriters | null = null
let backup: Pick<AppState, 'runs' | 'approvals' | 'audit' | 'policy'> | null = null

const KEY = 'bimoda.state.v1'

const initial: AppState = {
  settings: { privacyMode: 'hybrid', allowIdentifiableCloud: false, theme: 'dark', role: 'agent', toured: false, lang: 'en' },
  policy: DEFAULT_POLICY,
  runs: [],
  approvals: [],
  audit: [],
  sync: { status: 'off' },
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<AppState>
      return { ...initial, ...p, settings: { ...initial.settings, ...p.settings }, sync: { status: 'off' } }
    }
  } catch {
    /* storage unavailable: run in memory */
  }
  return initial
}

let state: AppState = load()
const listeners = new Set<() => void>()

export const getState = () => state
export const cloudActive = () => cloud !== null

function persist() {
  // While signed in, server data must never leak into the local demo copy: persist the stashed local copy instead.
  const local = backup ? { ...state, ...backup } : state
  try {
    const { sync: _sync, ...rest } = local
    void _sync
    localStorage.setItem(KEY, JSON.stringify({ ...rest, runs: local.runs.slice(0, 200), audit: local.audit.slice(0, 300) }))
  } catch {
    /* ignore quota/unavailable */
  }
}

export function setState(update: (s: AppState) => AppState) {
  state = update(state)
  persist()
  listeners.forEach((l) => l())
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => selector(state),
  )
}

// ---- cloud mode (used only by services/cloud.ts) ----
export function enterCloudMode(writers: CloudWriters) {
  backup = { runs: state.runs, approvals: state.approvals, audit: state.audit, policy: state.policy }
  cloud = writers
  setState((s) => ({ ...s, runs: [], approvals: [], audit: [], policy: DEFAULT_POLICY }))
}
export function exitCloudMode() {
  const restore = backup
  cloud = null
  backup = null
  setState((s) => ({ ...s, ...(restore ?? { runs: [], approvals: [], audit: [], policy: DEFAULT_POLICY }), sync: { status: 'off' } }))
}
export const setSync = (patch: Partial<SyncState>) => setState((s) => ({ ...s, sync: { ...s.sync, ...patch } }))

// ---- writes: routed to Firestore when signed in, local otherwise ----
export function addRun(r: AiRunRecord) {
  if (cloud) cloud.pushRun(r)
  else setState((s) => ({ ...s, runs: [r, ...s.runs] }))
}

export function logAudit(actor: string, action: string, entity: string, correlationId = crypto.randomUUID()) {
  const e: AuditEvent = { id: crypto.randomUUID(), at: new Date().toISOString(), actor, action, entity, correlationId }
  if (cloud) cloud.pushAudit(e)
  else setState((s) => ({ ...s, audit: [e, ...s.audit] }))
}

export function createApproval(a: ApprovalRecord) {
  if (cloud) cloud.pushApproval(a)
  else setState((s) => ({ ...s, approvals: [a, ...s.approvals] }))
}

export function patchApproval(id: string, patch: Partial<ApprovalRecord>) {
  const full = { ...patch, updatedAt: new Date().toISOString() }
  if (cloud) cloud.updateApproval(id, full)
  else setState((s) => ({ ...s, approvals: s.approvals.map((a) => (a.id === id ? { ...a, ...full } : a)) }))
}

export function savePolicy(p: PolicyConfig) {
  if (cloud) cloud.savePolicy(p)
  else setState((s) => ({ ...s, policy: p }))
}

export function resetDemoData() {
  if (cloud) return // server data is append-only by design; reset only applies to the local demo copy
  setState((s) => ({ ...initial, settings: s.settings }))
}
