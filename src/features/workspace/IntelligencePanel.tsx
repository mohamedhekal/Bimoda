import { Sparkles } from 'lucide-react'
import type { FeatureResult } from '../../ai/features'
import type { ConversationAnalysis } from '../../ai/validation/schemas'
import { canApprove, type PolicyEvaluation } from '../../domain/policy'
import type { ProposedActionKind, Role } from '../../domain/types'
import type { ReactNode } from 'react'
import { Badge, Button, DecisionBadge, Empty, SourceBadge } from '../../design-system/ui'
import type { ApprovalRecord } from '../../stores/store'
import { execute, review } from './approvals'
import { useT } from '../../i18n'

const ALL_ACTIONS: ProposedActionKind[] = [
  'DRAFT_REPLY',
  'CHANGE_VARIANT',
  'CHANGE_ADDRESS',
  'REFUND',
  'RESTORE_INVENTORY',
  'FLAG_ORDER',
  'REQUEST_CLARIFICATION',
  'ESCALATE_SHIPPING',
  'MANUAL_REVIEW',
]
const label = (a: ProposedActionKind) => a.replaceAll('_', ' ')

export interface PanelProps {
  preference: string
  busy: boolean
  role: Role
  analysis?: FeatureResult<ConversationAnalysis>
  reply?: FeatureResult<string>
  evaluations: PolicyEvaluation[]
  approvals: ApprovalRecord[]
  tone: 'friendly' | 'professional'
  length: 'short' | 'detailed'
  tryAction: ProposedActionKind
  onAnalyze: () => void
  onCancel: () => void
  onCompose: () => void
  onTone: (t: 'friendly' | 'professional') => void
  onLength: (l: 'short' | 'detailed') => void
  onTryAction: (a: ProposedActionKind) => void
  onPropose: (a: ProposedActionKind) => void
  onRequestSend: () => void
}

/** One step of the case flow: understand, check, reply, approve. The numbers are a real sequence. */
function Step({ n, title, action, last, children }: { n: number; title: ReactNode; action?: ReactNode; last?: boolean; children: ReactNode }) {
  return (
    <section className={last ? 'relative ps-10' : 'relative pb-7 ps-10'}>
      <span aria-hidden className="figure absolute start-0 top-0 grid h-7 w-7 place-items-center rounded-full bg-accent text-sm text-onaccent">
        {n}
      </span>
      {!last && <span aria-hidden className="absolute bottom-1 start-[13px] top-9 w-0.5 rounded bg-line" />}
      <header className="mb-2 flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

export function IntelligencePanel(p: PanelProps) {
  const t = useT()
  const a = p.analysis
  return (
    <div className="rounded-2xl border border-line/50 bg-surface p-5">
      <Step
        n={1}
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={14} className="text-violet" aria-hidden /> {t('Bimoda Intelligence')}
          </span>
        }
        action={<Badge>{p.preference}</Badge>}
      >
        <div className="flex gap-2">
          <Button onClick={p.onAnalyze} disabled={p.busy} className="flex-1">
            {p.busy ? 'Working…' : 'Analyze conversation'}
          </Button>
          {p.busy && (
            <Button variant="ghost" onClick={p.onCancel}>
              {t('Cancel')}
            </Button>
          )}
        </div>
        {!a && (
          <p className="mt-2 text-xs text-muted">Runs a real Firebase AI Logic request using your privacy mode. Customer text is treated as untrusted data.</p>
        )}
        {a && (
          <div className="mt-3 space-y-2 text-sm" aria-live="polite">
            <div className="flex flex-wrap gap-1">
              <SourceBadge record={a.record} />
              <Badge>{a.record.durationMs} ms</Badge>
              <Badge>{a.record.privacyMode}</Badge>
              {a.record.redactionApplied && <Badge tone="accent">redacted ×{a.record.redactions}</Badge>}
            </div>
            {a.ok ? (
              <>
                {a.data.suspectedPromptInjection && (
                  <p role="alert" className="rounded-lg border border-bad/50 bg-bad/10 p-2 text-xs text-bad">
                    Possible prompt-injection attempt detected in the customer text. It was treated as data and not followed.
                  </p>
                )}
                <p>{a.data.summary}</p>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                  <dt className="text-muted">Intent</dt>
                  <dd>{a.data.intent}</dd>
                  <dt className="text-muted">Main issue</dt>
                  <dd>{a.data.mainIssue}</dd>
                  <dt className="text-muted">Tone</dt>
                  <dd>{a.data.sentiment}</dd>
                  <dt className="text-muted">Urgency</dt>
                  <dd>{a.data.urgency}</dd>
                  <dt className="text-muted">Suggested</dt>
                  <dd>{a.data.suggestedAction}</dd>
                  {a.data.orderReferences.length > 0 && (
                    <>
                      <dt className="text-muted">Order refs</dt>
                      <dd>{a.data.orderReferences.join(', ')}</dd>
                    </>
                  )}
                </dl>
                {a.data.keyDetails.length > 0 && (
                  <p className="text-xs">
                    <b>Key details:</b> {a.data.keyDetails.join('; ')}
                  </p>
                )}
                {a.data.missingInformation.length > 0 && (
                  <p className="text-xs">
                    <b>Missing information:</b> {a.data.missingInformation.join('; ')}
                  </p>
                )}
                <p className="text-[11px] text-muted">AI interpretation, not a calibrated confidence. The policy engine decides what is allowed.</p>
              </>
            ) : (
              <div role="alert" className="rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">
                <p className="font-medium">
                  {a.kind === 'invalid_output' ? 'AI output failed validation and was discarded.' : `Could not run: ${a.record.status}`}
                </p>
                <p className="mt-1">{a.error}</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="ghost" className="min-h-8 px-2 text-xs" onClick={p.onAnalyze}>
                    {t('Retry')}
                  </Button>
                  <Button variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => p.onPropose('MANUAL_REVIEW')}>
                    Send to manual review
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Step>

      <Step n={2} title={t('Policy check')}>
        <div className="flex gap-2">
          <select
            aria-label="Action to evaluate"
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg p-2 text-sm"
            value={p.tryAction}
            onChange={(e) => p.onTryAction(e.target.value as ProposedActionKind)}
          >
            {ALL_ACTIONS.map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => p.onPropose(p.tryAction)}>
            {t('Propose')}
          </Button>
        </div>
        <ul className="mt-3 space-y-2" aria-live="polite">
          {p.evaluations.length === 0 && (
            <li>
              <Empty title="No evaluations yet" body="Propose an action, e.g. Change variant on the locked shipment." />
            </li>
          )}
          {p.evaluations.map((e, i) => (
            <li key={i} className="rounded-lg border border-line p-2 text-xs">
              <div className="flex items-center justify-between">
                <DecisionBadge decision={e.decision} />
                <span className="text-muted">
                  {e.ruleId} · policy v{e.policyVersion}
                </span>
              </div>
              <p className="mt-1">{e.explanation}</p>
              <p className="text-muted">{e.enforcement}</p>
              {(e.decision === 'DENY' || e.decision === 'NEED_MORE_INFORMATION') && (
                <Button variant="ghost" className="mt-2 min-h-8 px-2 text-xs" onClick={() => p.onPropose('MANUAL_REVIEW')}>
                  {t('Route to manual review')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Step>

      <Step n={3} title={t('Response composer')}>
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            aria-label="Tone"
            className="rounded-lg border border-line bg-bg p-1.5"
            value={p.tone}
            onChange={(e) => p.onTone(e.target.value as 'friendly' | 'professional')}
          >
            <option value="professional">{t('Professional')}</option>
            <option value="friendly">{t('Friendly')}</option>
          </select>
          <select
            aria-label="Length"
            className="rounded-lg border border-line bg-bg p-1.5"
            value={p.length}
            onChange={(e) => p.onLength(e.target.value as 'short' | 'detailed')}
          >
            <option value="short">{t('Short')}</option>
            <option value="detailed">{t('Detailed')}</option>
          </select>
          <Button variant="ghost" className="ms-auto min-h-8 px-3 text-xs" onClick={p.onCompose} disabled={p.busy}>
            {t('Compose')}
          </Button>
        </div>
        {p.reply && (
          <div className="mt-3 space-y-2 text-sm" aria-live="polite">
            <SourceBadge record={p.reply.record} />
            {p.reply.ok ? (
              <>
                <p className="whitespace-pre-wrap rounded-lg border border-line bg-bg p-2">{p.reply.data}</p>
                <Button onClick={p.onRequestSend} className="w-full">
                  {t('Request approval to send')}
                </Button>
                <p className="text-[11px] text-muted">Amounts are filled from order records. Sending is simulated after human approval.</p>
              </>
            ) : (
              <p role="alert" className="rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">
                {p.reply.error}
              </p>
            )}
          </div>
        )}
      </Step>

      <Step n={4} last title={t('Approvals for this case')}>
        {p.approvals.length === 0 ? (
          <p className="text-xs text-muted">Nothing proposed yet.</p>
        ) : (
          <ul className="space-y-2">
            {p.approvals.map((x) => {
              const allowed = canApprove(p.role, x.evaluation)
              return (
                <li key={x.id} className="rounded-lg border border-line p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <b>{x.label}</b>
                    <Badge tone={x.state === 'executed' ? 'ok' : x.state === 'rejected' ? 'bad' : x.state === 'pending_approval' ? 'warn' : 'accent'}>
                      {x.state.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="text-muted">
                    {x.proposedBy === 'ai' ? 'Suggested by AI' : 'Proposed by user'} · {x.evaluation.ruleId}
                    {x.reviewer ? ` · ${x.reviewer}` : ''}
                  </div>
                  {x.state === 'pending_approval' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button className="min-h-8 px-3 text-xs" disabled={!allowed} onClick={() => review(x, p.role, true)}>
                        {t('Approve')}
                      </Button>
                      <Button variant="danger" className="min-h-8 px-3 text-xs" onClick={() => review(x, p.role, false)}>
                        {t('Reject')}
                      </Button>
                      {!allowed && <span className="text-warn">Needs manager or admin</span>}
                    </div>
                  )}
                  {(x.state === 'approved' || (x.state === 'suggested' && x.evaluation.decision === 'ALLOW')) && (
                    <Button variant="ghost" className="mt-2 min-h-8 px-3 text-xs" onClick={() => execute(x, p.role)}>
                      {t('Execute (simulated)')}
                    </Button>
                  )}
                  {x.note && <p className="mt-1 text-muted">{x.note}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </Step>
    </div>
  )
}
