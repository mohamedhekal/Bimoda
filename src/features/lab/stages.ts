import type { AiRunRecord } from '../../ai/hybrid-engine/types'

export type StageState = 'idle' | 'active' | 'done' | 'blocked'
export const STAGES = ['User input', 'Privacy policy', 'Firebase AI Logic', 'Model', 'Validated output', 'Policy engine', 'Human review'] as const

/** Maps the real state of the last run to the architecture diagram. Nothing animates unless a request is actually in flight. */
export function stageStates(running: boolean, record?: Pick<AiRunRecord, 'status'>): StageState[] {
  const s = STAGES.map<StageState>(() => 'idle')
  if (running) return s.map((_, i) => (i <= 1 ? 'done' : i === 2 ? 'active' : 'idle'))
  if (!record) return s
  const done = (n: number, blockedAt?: number) => s.map<StageState>((_, i) => (i === blockedAt ? 'blocked' : i < n ? 'done' : 'idle'))
  switch (record.status) {
    case 'success':
      return done(5) // policy engine + human review happen in the Workspace
    case 'blocked_privacy':
    case 'consent_required':
      return done(1, 1)
    case 'offline':
    case 'config_missing':
      return done(2, 2)
    case 'cancelled':
      return done(3)
    default: // unavailable | error
      return done(3, 3)
  }
}
