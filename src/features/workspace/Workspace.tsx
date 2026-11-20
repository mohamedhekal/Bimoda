import { useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { engine } from '../../ai/engineInstance'
import { defaultPreference } from '../../ai/hybrid-engine/engine'
import { analyzeConversation, composeReply, type FeatureResult } from '../../ai/features'
import type { ConversationAnalysis } from '../../ai/validation/schemas'
import { conversations, getCustomer, getOrder } from '../../domain/seed'
import { computeOrderTotals, formatMoney } from '../../domain/pricing'
import { evaluatePolicy, type PolicyEvaluation } from '../../domain/policy'
import { returnStage, shippingSignals } from '../../domain/signals'
import type { CaseStatus, CaseType, Conversation, Priority, ProposedActionKind } from '../../domain/types'
import { Badge, Card } from '../../design-system/ui'
import { cx } from '../../design-system/utils'
import { useAppState } from '../../stores/store'
import { submitProposal } from './approvals'
import { buildDecisionTrace } from '../../domain/trace'
import { DecisionGraph } from './DecisionGraph'
import { IntelligencePanel } from './IntelligencePanel'
import { localeOf, useLang, useT } from '../../i18n'

const TYPE_LABEL: Record<CaseType, string> = {
  free_shipping: 'Pricing',
  locked_shipment: 'Locked shipment',
  address: 'Address',
  return: 'Return',
  late_reply: 'Late reply',
  injection: 'Risky message',
  shipping_delay: 'Shipping',
  general: 'General',
}
const STATUS_LABEL: Record<CaseStatus, string> = { open: 'Open', needs_review: 'Needs review', waiting_customer: 'Waiting on customer', resolved: 'Resolved' }
const PRIORITY_TONE = { low: 'neutral', medium: 'cyan', high: 'warn', critical: 'bad' } as const
const SEVERITY_TONE = { info: 'cyan', warn: 'warn', critical: 'bad' } as const

interface Filters {
  type: 'all' | CaseType
  status: 'all' | CaseStatus
  priority: 'all' | Priority
  assignee: 'all' | 'assigned' | 'unassigned'
}

function FilterSelect<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  const t = useT()
  return (
    <label className="block min-w-0 text-[11px] text-muted">
      {label}
      <select
        className="mt-0.5 w-full rounded-lg border border-line bg-surface p-1.5 text-xs text-ink"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function Workspace() {
  const t = useT()
  const lang = useLang()
  const money = (cents: number) => formatMoney(cents, localeOf(lang))
  const [selectedId, setSelectedId] = useState(conversations[0]!.id)
  const [filters, setFilters] = useState<Filters>({ type: 'all', status: 'all', priority: 'all', assignee: 'all' })
  const [analysis, setAnalysis] = useState<Record<string, FeatureResult<ConversationAnalysis>>>({})
  const [reply, setReply] = useState<Record<string, FeatureResult<string>>>({})
  const [evals, setEvals] = useState<Record<string, PolicyEvaluation[]>>({})
  const [busy, setBusy] = useState(false)
  const [tone, setTone] = useState<'friendly' | 'professional'>('professional')
  const [length, setLength] = useState<'short' | 'detailed'>('short')
  const [tryAction, setTryAction] = useState<ProposedActionKind>('CHANGE_VARIANT')
  const abortRef = useRef<AbortController | null>(null)
  const caseRef = useRef<HTMLDivElement>(null)

  const settings = useAppState((s) => s.settings)
  const policy = useAppState((s) => s.policy)
  const allApprovals = useAppState((s) => s.approvals)

  const convo = conversations.find((c) => c.id === selectedId)!
  const order = getOrder(convo.orderId)
  const customer = getCustomer(order.customerId)
  const totals = computeOrderTotals(order)
  const signals = shippingSignals(order, convo)
  const ret = order.returnCase ? returnStage(order.returnCase) : null
  const pref = defaultPreference(settings.privacyMode)
  const list = useMemo(
    () =>
      conversations.filter(
        (c) =>
          (filters.type === 'all' || c.type === filters.type) &&
          (filters.status === 'all' || c.status === filters.status) &&
          (filters.priority === 'all' || c.priority === filters.priority) &&
          (filters.assignee === 'all' || (filters.assignee === 'assigned') === (c.assignee !== null)),
      ),
    [filters],
  )

  const select = (id: string) => {
    setSelectedId(id)
    if (window.innerWidth < 1024)
      caseRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  const propose = (action: ProposedActionKind, proposedBy: 'ai' | 'user' = 'user') => {
    const evaluation = evaluatePolicy({ action, role: settings.role, order }, policy)
    setEvals((p) => ({ ...p, [selectedId]: [evaluation, ...(p[selectedId] ?? [])].slice(0, 6) }))
    submitProposal({ conversationId: selectedId, orderId: order.id, action, label: action.replaceAll('_', ' '), evaluation, proposedBy, role: settings.role })
    return evaluation
  }

  const withBusy = async (fn: (signal: AbortSignal) => Promise<void>) => {
    const ctl = new AbortController()
    abortRef.current = ctl
    setBusy(true)
    try {
      await fn(ctl.signal)
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const analyze = () =>
    withBusy(async (signal) => {
      const id = selectedId
      const r = await analyzeConversation(engine, convo, order, customer, pref, signal)
      setAnalysis((p) => ({ ...p, [id]: r }))
      if (r.ok) propose(r.data.suggestedAction, 'ai')
    })

  const compose = () =>
    withBusy(async (signal) => {
      const id = selectedId
      const direction = evals[id]?.[0]
      const a = analysis[id]
      const suggested = a?.ok ? a.data.suggestedAction : null
      const planned = direction
        ? `Latest policy decision${suggested ? ` for ${suggested}` : ''}: ${direction.decision} (${direction.explanation}). Do not promise anything the policy forbids; offer human review if blocked.`
        : 'No action decided yet: acknowledge, explain next steps, promise nothing.'
      const r = await composeReply(engine, convo, order, customer, pref, tone, length, planned, signal)
      setReply((p) => ({ ...p, [id]: r }))
    })

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_380px]">
      <h1 className="sr-only">{t('Operations workspace')}</h1>

      {/* Queue */}
      <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <FilterSelect
            label={t('Type')}
            value={filters.type}
            onChange={(type) => setFilters({ ...filters, type })}
            options={[['all', 'All types'], ...(Object.entries(TYPE_LABEL) as [CaseType, string][])]}
          />
          <FilterSelect
            label={t('Status')}
            value={filters.status}
            onChange={(status) => setFilters({ ...filters, status })}
            options={[['all', 'All statuses'], ...(Object.entries(STATUS_LABEL) as [CaseStatus, string][])]}
          />
          <FilterSelect
            label={t('Risk / priority')}
            value={filters.priority}
            onChange={(priority) => setFilters({ ...filters, priority })}
            options={[
              ['all', 'Any priority'],
              ['critical', 'Critical'],
              ['high', 'High'],
              ['medium', 'Medium'],
              ['low', 'Low'],
            ]}
          />
          <FilterSelect
            label={t('Assigned')}
            value={filters.assignee}
            onChange={(assignee) => setFilters({ ...filters, assignee })}
            options={[
              ['all', 'Anyone'],
              ['assigned', 'Assigned'],
              ['unassigned', 'Unassigned'],
            ]}
          />
        </div>
        <p className="text-xs text-muted" role="status">
          {list.length} {t('of')} {conversations.length} {t('cases')}
        </p>
        <ul className="max-h-[42vh] space-y-2 overflow-y-auto pe-1 lg:max-h-[70vh]" aria-label="Operations queue">
          {list.length === 0 && (
            <li className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">{t('No cases match these filters.')}</li>
          )}
          {list.map((c: Conversation) => (
            <li key={c.id}>
              <button
                onClick={() => select(c.id)}
                aria-current={c.id === selectedId}
                className={cx(
                  'w-full rounded-xl border p-3 text-start text-sm',
                  c.id === selectedId ? 'border-cyan bg-surface2' : 'border-line bg-surface hover:bg-surface2',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.orderId}</span>
                  <Badge tone={PRIORITY_TONE[c.priority]}>{t(c.priority)}</Badge>
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-muted">{c.messages.at(-1)!.text}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge>{t(TYPE_LABEL[c.type])}</Badge>
                  {c.status === 'needs_review' && <Badge tone="warn">review</Badge>}
                  {c.assignee && <Badge>{c.assignee}</Badge>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Case */}
      <div ref={caseRef} className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-1">
        <Card
          title={
            <>
              Case {convo.id} · {order.id}
            </>
          }
          action={<Badge tone={PRIORITY_TONE[convo.priority]}>{t(convo.priority)}</Badge>}
        >
          <div className="space-y-2">
            {convo.messages.map((m, i) => (
              <div key={i} className={cx('max-w-[90%] rounded-xl px-3 py-2 text-sm', m.from === 'customer' ? 'bg-surface2' : 'ms-auto bg-cyan/15')}>
                <div className="mb-0.5 text-[11px] uppercase text-muted">
                  {m.from === 'customer' ? customer.displayName : 'Agent'} · {m.at.slice(0, 10)}
                </div>
                {/* Rendered as plain text: customer content is untrusted */}
                {m.text}
              </div>
            ))}
          </div>
        </Card>

        <Card title={t('Order')}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1 text-sm">
              {order.items.map((i) => (
                <div key={i.sku} className="flex justify-between gap-2">
                  <span>
                    {i.qty}× {i.name} <span className="text-muted">({i.variant})</span>
                  </span>
                  <span>{money(i.unitPriceCents * i.qty)}</span>
                </div>
              ))}
              <hr className="border-line" />
              <div className="flex justify-between text-muted">
                <span>Subtotal</span>
                <span>{money(totals.subtotalCents)}</span>
              </div>
              {totals.discountCents > 0 && (
                <div className="flex justify-between text-muted">
                  <span>Discount</span>
                  <span>−{money(totals.discountCents)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted">
                <span>Shipping {totals.freeShippingApplied && '(free shipping applied)'}</span>
                <span>{money(totals.shippingFeeCents)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{money(totals.totalCents)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Due on delivery</span>
                <span>{money(totals.amountDueCents)}</span>
              </div>
              {order.statedTotalCents !== undefined && order.statedTotalCents !== totals.totalCents && (
                <p role="alert" className="mt-2 flex gap-2 rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> Confirmation message stated {money(order.statedTotalCents)} but the
                  calculated total is {money(totals.totalCents)}.
                </p>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-1">
                <Badge tone="cyan">{order.fulfillment}</Badge>
                <Badge>{order.paymentStatus}</Badge>
                {!order.address.complete && <Badge tone="warn">address incomplete</Badge>}
              </div>
              <div className="text-xs text-muted">{order.carrier ? `${order.carrier} · ${order.trackingRef}` : 'Not yet shipped'}</div>
              {order.shipmentEvents.length > 0 && (
                <ol className="space-y-1 border-s border-line ps-3 text-xs" aria-label="Shipment timeline">
                  {order.shipmentEvents.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.status}</span>{' '}
                      <span className="text-muted">
                        · {e.note} · {e.at.slice(0, 10)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              {ret && order.returnCase && (
                <div className="rounded-lg border border-line p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <b>{ret.label}</b>
                    <Badge tone={ret.physicallyReceived ? 'ok' : 'warn'}>{ret.physicallyReceived ? 'received' : 'not received'}</Badge>
                  </div>
                  <p className="mt-1 text-muted">
                    Pickup: {order.returnCase.pickup} · Warehouse receipt: {order.returnCase.warehouseReceipt} · Settlement: {order.returnCase.settlement}
                  </p>
                  <p className="mt-1">{ret.caveat}</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title={t('Operational signals')} action={<Badge>{t('rule-based, no AI')}</Badge>}>
          {signals.length === 0 ? (
            <p className="text-xs text-muted">No shipping or order signals for this case.</p>
          ) : (
            <ul className="space-y-2">
              {signals.map((s) => (
                <li key={s.id} className="rounded-lg border border-line p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge tone={SEVERITY_TONE[s.severity]}>{s.severity}</Badge>
                    <b>{s.title}</b>
                  </div>
                  <p className="mt-1 text-muted">{s.detail}</p>
                </li>
              ))}
            </ul>
          )}
          {order.notes.length > 0 && (
            <ul className="mt-2 list-disc ps-5 text-xs text-muted">
              {order.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>
        <DecisionGraph
          nodes={buildDecisionTrace({
            conversation: convo,
            order,
            analysis: analysis[selectedId],
            evaluation: evals[selectedId]?.[0],
            approvals: allApprovals.filter((x) => x.conversationId === selectedId),
            role: settings.role,
            signals,
          })}
        />
      </div>

      {/* Intelligence */}
      <div className="min-w-0 lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-span-2 xl:row-start-1">
        <IntelligencePanel
          preference={pref}
          busy={busy}
          role={settings.role}
          analysis={analysis[selectedId]}
          reply={reply[selectedId]}
          evaluations={evals[selectedId] ?? []}
          approvals={allApprovals.filter((x) => x.conversationId === selectedId)}
          tone={tone}
          length={length}
          tryAction={tryAction}
          onAnalyze={analyze}
          onCancel={() => abortRef.current?.abort()}
          onCompose={compose}
          onTone={setTone}
          onLength={setLength}
          onTryAction={setTryAction}
          onPropose={(a) => propose(a)}
          onRequestSend={() => propose('DRAFT_REPLY')}
        />
      </div>
    </div>
  )
}
