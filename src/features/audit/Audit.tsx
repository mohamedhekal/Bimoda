import { Badge, Card, Empty, SourceBadge } from '../../design-system/ui'
import { statusTone } from '../../design-system/utils'
import { useAppState } from '../../stores/store'
import { useT } from '../../i18n'

const STATE_TONE = { suggested: 'accent', pending_approval: 'warn', approved: 'ok', rejected: 'bad', executed: 'ok' } as const

export function Audit() {
  const t = useT()
  const runs = useAppState((s) => s.runs)
  const audit = useAppState((s) => s.audit)
  const approvals = useAppState((s) => s.approvals)
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Audit & AI runs')}</h1>
        <p className="text-sm text-muted">
          Raw prompts are never stored. Only metadata (feature, source, duration, status, input size) is recorded, locally in this browser in the demo.
        </p>
      </div>

      <Card title={`Approvals (${approvals.length})`}>
        {approvals.length === 0 ? (
          <Empty title="No approvals yet" body="Propose an action in the Workspace; risky ones land here as pending approval." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-xs">
              <caption className="sr-only">Proposed actions and their approval state</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1">
                    Updated
                  </th>
                  <th scope="col">{t('Order')}</th>
                  <th scope="col">Action</th>
                  <th scope="col">State</th>
                  <th scope="col">Rule</th>
                  <th scope="col">Proposed by</th>
                  <th scope="col">Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {approvals.slice(0, 50).map((a) => (
                  <tr key={a.id} className="border-t border-line align-top">
                    <td className="py-1.5">{a.updatedAt.slice(11, 19)}</td>
                    <td>{a.orderId}</td>
                    <td>{a.label}</td>
                    <td>
                      <Badge tone={STATE_TONE[a.state]}>{a.state.replace('_', ' ')}</Badge>
                    </td>
                    <td>
                      {a.evaluation.ruleId} · {a.evaluation.decision.replaceAll('_', ' ')}
                    </td>
                    <td>{a.proposedBy}</td>
                    <td>{a.reviewer ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`AI runs (${runs.length})`}>
        {runs.length === 0 ? (
          <Empty title="No AI runs yet" body="Analyze a conversation or run the Hybrid AI Lab." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-xs">
              <caption className="sr-only">AI inference runs</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1">
                    Time
                  </th>
                  <th scope="col">Feature</th>
                  <th scope="col">Requested</th>
                  <th scope="col">Source</th>
                  <th scope="col">{t('Status')}</th>
                  <th scope="col">Duration</th>
                  <th scope="col">{t('Privacy')}</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 50).map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-1.5">{r.timestamp.slice(11, 19)}</td>
                    <td>{r.feature}</td>
                    <td>
                      {r.requestedPreference}
                      {r.effectivePreference !== r.requestedPreference && <span className="text-warn"> → {r.effectivePreference}</span>}
                    </td>
                    <td>
                      <SourceBadge record={r} />
                    </td>
                    <td>
                      <Badge tone={statusTone[r.status] ?? 'neutral'}>{r.status}</Badge>
                      {r.reason && <div className="max-w-56 text-muted">{r.reason}</div>}
                    </td>
                    <td>{r.durationMs} ms</td>
                    <td>
                      {r.privacyMode}
                      {r.redactionApplied ? ` · redacted ${r.redactions}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Audit events (${audit.length})`}>
        {audit.length === 0 ? (
          <Empty title="No audit events" body="Propose, approve or reject an action in the Workspace." />
        ) : (
          <ul className="divide-y divide-line text-xs">
            {audit.slice(0, 80).map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3 py-1.5">
                <span className="text-muted">{a.at.slice(11, 19)}</span>
                <b>{a.actor}</b>
                <span>{a.action}</span>
                <span className="text-muted">{a.entity}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
