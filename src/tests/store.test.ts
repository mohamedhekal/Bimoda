import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addRun,
  createApproval,
  enterCloudMode,
  exitCloudMode,
  getState,
  logAudit,
  patchApproval,
  resetDemoData,
  savePolicy,
  type ApprovalRecord,
} from '../stores/store'
import { DEFAULT_POLICY } from '../domain/policy'
import type { AiRunRecord } from '../ai/hybrid-engine/types'
import { rcBool, rcNumber, rcString } from '../firebase/remoteConfig'

const run = {
  id: 'r1',
  feature: 'f',
  requestedPreference: 'PREFER_ON_DEVICE',
  effectivePreference: 'PREFER_ON_DEVICE',
  privacyMode: 'hybrid',
  source: 'ON_DEVICE',
  sourceBasis: 'sdk',
  status: 'success',
  durationMs: 1,
  inputChars: 1,
  redactions: 0,
  redactionApplied: false,
  timestamp: new Date().toISOString(),
} as AiRunRecord
const approval = {
  id: 'a1',
  conversationId: 'CV-001',
  orderId: 'ORD-1001',
  action: 'REFUND',
  label: 'REFUND',
  state: 'pending_approval',
  evaluation: { ruleId: 'R-006', decision: 'REQUIRE_APPROVAL', explanation: '', enforcement: '', facts: {}, policyVersion: 1, timestamp: '' },
  proposedBy: 'user',
  createdAt: '',
  updatedAt: '',
} as ApprovalRecord
const writers = () => ({ pushRun: vi.fn(), pushAudit: vi.fn(), pushApproval: vi.fn(), updateApproval: vi.fn(), savePolicy: vi.fn() })

afterEach(() => {
  exitCloudMode()
  resetDemoData()
})

describe('local mode', () => {
  it('stores writes locally', () => {
    addRun(run)
    createApproval(approval)
    logAudit('t', 'x', 'o')
    patchApproval('a1', { state: 'approved' })
    expect(getState().runs).toHaveLength(1)
    expect(getState().approvals[0]!.state).toBe('approved')
    expect(getState().audit).toHaveLength(1)
  })
})

describe('cloud mode routing', () => {
  it('sends every write to Firestore writers and keeps the local demo copy out of the UI state', () => {
    addRun(run)
    const w = writers()
    enterCloudMode(w)
    expect(getState().runs).toHaveLength(0) // server data only while signed in
    addRun({ ...run, id: 'r2' })
    createApproval(approval)
    logAudit('t', 'x', 'o')
    patchApproval('a1', { state: 'approved' })
    savePolicy({ ...DEFAULT_POLICY, version: 2 })
    expect(w.pushRun).toHaveBeenCalledOnce()
    expect(w.pushApproval).toHaveBeenCalledOnce()
    expect(w.pushAudit).toHaveBeenCalledOnce()
    expect(w.updateApproval).toHaveBeenCalledWith('a1', expect.objectContaining({ state: 'approved', updatedAt: expect.any(String) }))
    expect(w.savePolicy).toHaveBeenCalledOnce()
    expect(getState().runs).toHaveLength(0) // nothing written locally
  })
  it('restores the local demo copy on sign-out and never persists server data locally', () => {
    addRun(run)
    enterCloudMode(writers())
    const stored = JSON.parse(localStorage.getItem('bimoda.state.v1')!)
    expect(stored.runs).toHaveLength(1) // the stashed local copy, not the empty cloud view
    exitCloudMode()
    expect(getState().runs).toHaveLength(1)
    expect(getState().sync.status).toBe('off')
  })
  it('refuses to reset while signed in (server data is append-only)', () => {
    const w = writers()
    enterCloudMode(w)
    resetDemoData()
    expect(getState().sync.status).toBe('off') // sync state untouched, no throw
  })
})

describe('Remote Config defaults (before any fetch)', () => {
  it('falls back to safe in-code defaults', () => {
    expect(rcString('cloud_model')).toBe('gemini-3.5-flash-lite')
    expect(rcNumber('ai_timeout_ms')).toBe(45_000)
    expect(rcBool('cloud_inference_enabled')).toBe(true)
  })
})
