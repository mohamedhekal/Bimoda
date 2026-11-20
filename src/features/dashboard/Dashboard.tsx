import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { engine } from '../../ai/engineInstance'
import { defaultPreference } from '../../ai/hybrid-engine/engine'
import { generateInsights, type FeatureResult } from '../../ai/features'
import type { Insights } from '../../ai/validation/schemas'
import { conversations, orders } from '../../domain/seed'
import { computeObservedStats, type Range } from '../../domain/stats'
import { Badge, Button, Card, SourceBadge, Stat } from '../../design-system/ui'
import { useAppState } from '../../stores/store'
import { localeOf, useLang, useT } from '../../i18n'

const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const
const RANGES: [Range, string][] = [
  ['24h', 'Last 24 hours'],
  ['7d', 'Last 7 days'],
  ['all', 'All time'],
]

export function Dashboard() {
  const t = useT()
  const nf = new Intl.NumberFormat(localeOf(useLang()))
  const runs = useAppState((s) => s.runs)
  const approvals = useAppState((s) => s.approvals)
  const audit = useAppState((s) => s.audit)
  const settings = useAppState((s) => s.settings)
  const [range, setRange] = useState<Range>('all')
  const [insights, setInsights] = useState<FeatureResult<Insights> | null>(null)
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const stats = useMemo(() => computeObservedStats({ conversations, orders, approvals, audit, runs, range }), [approvals, audit, runs, range])
  const needs = conversations.filter((c) => c.status === 'needs_review').sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  const byType = Object.entries(stats.byType).map(([name, cases]) => ({ name: name.replaceAll('_', ' '), cases }))
  const sourceData = [
    { name: 'On-device', value: stats.runs.onDevice, color: 'var(--ok)' },
    { name: 'Cloud', value: stats.runs.cloud, color: 'var(--violet)' },
  ]

  const runInsights = async () => {
    const ctl = new AbortController()
    abortRef.current = ctl
    setBusy(true)
    setInsights(await generateInsights(engine, stats, defaultPreference(settings.privacyMode), ctl.signal))
    setBusy(false)
    abortRef.current = null
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{t('Mission Control')}</h1>
          <p className="text-sm text-muted">
            {t('Case and order counts come from the synthetic demo dataset. AI and policy counters come from real records in this browser.')}
          </p>
        </div>
        <label className="text-xs text-muted">
          {t('AI / policy time range')}
          <select className="ms-2 rounded-lg border border-line bg-surface p-1.5 text-ink" value={range} onChange={(e) => setRange(e.target.value as Range)}>
            {RANGES.map(([v, l]) => (
              <option key={v} value={v}>
                {t(l)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('Orders')} value={nf.format(orders.length)} hint={t('synthetic')} />
        <Stat label={t('Cases needing review')} value={nf.format(stats.needsReview)} tone="warn" />
        <Stat
          label={t('Shipping exceptions')}
          value={nf.format(stats.shippingExceptions)}
          tone={stats.shippingExceptions ? 'bad' : undefined}
          hint={t('rule-based signals')}
        />
        <Stat label={t('Returns, no receipt')} value={nf.format(stats.returnsWithoutReceipt)} hint={t('warehouse not confirmed')} />
        <Stat label={t('Conversations')} value={nf.format(stats.cases)} />
        <Stat label={t('Pending approvals')} value={nf.format(stats.pendingApprovals)} tone={stats.pendingApprovals ? 'warn' : undefined} />
        <Stat
          label={t('AI runs ok / total')}
          value={`${nf.format(stats.runs.success)}/${nf.format(stats.runs.total)}`}
          hint={
            stats.runs.successRate === null
              ? t('run an analysis')
              : `${Math.round(stats.runs.successRate * 100)}% success · median ${stats.runs.medianMs ?? '–'} ms`
          }
        />
        <Stat label={t('Policy-blocked actions')} value={nf.format(stats.policyBlocked)} tone="ok" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title={t('Needs attention')}
          className="lg:col-span-2"
          action={
            <Link to="/app/workspace" className="text-xs text-cyan underline">
              {t('Open workspace')}
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {needs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <b>{c.orderId}</b> <span className="text-muted">· {c.type.replaceAll('_', ' ')}</span>
                  <span className="line-clamp-1 block text-xs text-muted">{c.messages.at(-1)!.text}</span>
                </span>
                <Badge tone={c.priority === 'critical' ? 'bad' : 'warn'}>{c.priority}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t('Inference source (actual runs)')}>
          {stats.runs.onDevice + stats.runs.cloud === 0 ? (
            <p className="text-sm text-muted">{t('No successful runs in this range. Run an analysis in the Workspace or the Hybrid AI Lab.')}</p>
          ) : (
            <div className="h-44" role="img" aria-label={`On-device ${stats.runs.onDevice}, cloud ${stats.runs.cloud}`}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70}>
                    {sourceData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs text-muted">
            On-device: {stats.runs.onDevice} · Cloud: {stats.runs.cloud}
          </p>
        </Card>
      </div>

      <Card title={t('Cases by category (synthetic)')}>
        <div className="h-56" role="img" aria-label={`Cases by category: ${byType.map((b) => `${b.name} ${b.cases}`).join(', ')}`}>
          <ResponsiveContainer>
            <BarChart data={byType}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} />
              <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)' }} />
              <Bar dataKey="cases" fill="var(--cyan)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title={t('AI operations insights')} action={<Badge tone="violet">{t('AI interpretation, not observed data')}</Badge>}>
        <p className="text-xs text-muted">
          The model receives only the aggregate counts above (no names, contacts or message text). It is told not to claim causation or savings.
        </p>
        <div className="mt-2 flex gap-2">
          <Button onClick={runInsights} disabled={busy}>
            {busy ? 'Working…' : 'Generate insights'}
          </Button>
          {busy && (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              {t('Cancel')}
            </Button>
          )}
        </div>
        {insights && (
          <div className="mt-3 space-y-3 text-sm" aria-live="polite">
            <div className="flex flex-wrap gap-1">
              <SourceBadge record={insights.record} />
              <Badge>{insights.record.durationMs} ms</Badge>
            </div>
            {insights.ok ? (
              <>
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted">{t('Patterns')}</h3>
                  <ul className="list-disc ps-5">
                    {insights.data.patterns.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted">{t('Suggested process improvements')}</h3>
                  <ul className="list-disc ps-5">
                    {insights.data.suggestions.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
                {insights.data.limitations.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted">{t('Limitations')}</h3>
                    <ul className="list-disc ps-5 text-muted">
                      {insights.data.limitations.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <p role="alert" className="rounded-lg border border-warn/50 bg-warn/10 p-2 text-xs text-warn">
                {insights.kind === 'invalid_output' ? 'AI output failed validation and was discarded: ' : `Could not run (${insights.record.status}): `}
                {insights.error}
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
