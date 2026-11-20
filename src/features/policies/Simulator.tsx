import { useMemo, useState } from 'react'
import { SCENARIOS } from '../../domain/scenarios'
import { simulatePolicy, type DecisionCounts } from '../../domain/simulator'
import { validatePolicyConfig, type Decision, type PolicyConfig } from '../../domain/policy'
import { Badge, Button, Card, DecisionBadge } from '../../design-system/ui'
import { useT } from '../../i18n'
import { logAudit, savePolicy, useAppState } from '../../stores/store'

const DECISIONS: Decision[] = ['ALLOW', 'REQUIRE_APPROVAL', 'NEED_MORE_INFORMATION', 'DENY']

/** What-if: edit a DRAFT policy and see how the 40 synthetic scenarios would be decided. Nothing is saved unless "Apply" is pressed. */
export function PolicySimulator() {
  const t = useT()
  const policy = useAppState((s) => s.policy)
  const role = useAppState((s) => s.settings.role)
  const [draft, setDraft] = useState<PolicyConfig>(policy)
  const [onlyChanged, setOnlyChanged] = useState(true)
  const [applied, setApplied] = useState(false)
  const sim = useMemo(() => simulatePolicy(SCENARIOS, policy, draft), [policy, draft])
  const edit = (patch: Partial<PolicyConfig>) => {
    setApplied(false)
    setDraft({ ...draft, ...patch })
  }
  const dollars = (k: 'maxEditValueCents' | 'refundApprovalThresholdCents', label: string) => (
    <label className="block text-xs">
      {label} (USD)
      <input
        type="number"
        min={0}
        className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm"
        value={draft[k] / 100}
        onChange={(e) => edit({ [k]: Math.round(Number(e.target.value) * 100) })}
      />
    </label>
  )
  const count = (c: DecisionCounts, d: Decision) => c[d]

  const apply = () => {
    const v = validatePolicyConfig({ ...draft, version: policy.version + 1 })
    if (!v.ok) return
    savePolicy(v.config) // same path as Policy Studio: local state, or Firestore (admin-only, checked by the security rules) when signed in
    logAudit(`${role} (demo)`, `policy_applied_from_simulator:v${v.config.version}`, 'policy')
    setApplied(true)
  }

  return (
    <Card title={t('What-if policy simulator')} action={<Badge tone="accent">{t('draft only, nothing is saved')}</Badge>}>
      <p className="text-xs text-muted">
        {t(
          'Change a draft below and compare how the 40 synthetic scenarios would be decided under the current policy and under the draft. Case data and the live policy are not touched.',
        )}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block text-xs">
          {t('Order edits lock from')}
          <select
            className="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-sm"
            value={draft.editLockFrom}
            onChange={(e) => edit({ editLockFrom: e.target.value as PolicyConfig['editLockFrom'] })}
          >
            <option value="processing">processing</option>
            <option value="packed">packed</option>
            <option value="shipped">shipped</option>
          </select>
        </label>
        {dollars('maxEditValueCents', t('Agent edit limit'))}
        {dollars('refundApprovalThresholdCents', t('Refund approval threshold'))}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={draft.requireWarehouseReceipt} onChange={(e) => edit({ requireWarehouseReceipt: e.target.checked })} />{' '}
          {t('Require confirmed warehouse receipt')}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={draft.messagesRequireApproval} onChange={(e) => edit({ messagesRequireApproval: e.target.checked })} />{' '}
          {t('Outbound messages need approval')}
        </label>
        <div>
          <Button variant="ghost" onClick={() => edit({ ...policy })}>
            {t('Reset draft')}
          </Button>
        </div>
      </div>

      {!sim.ok ? (
        <ul role="alert" className="mt-3 list-disc rounded-lg border border-bad/50 bg-bad/10 p-3 ps-6 text-xs text-bad">
          {sim.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
          <li className="list-none text-muted">{t('Unsafe or inconsistent drafts are rejected and not simulated.')}</li>
        </ul>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-start text-xs">
              <caption className="sr-only">{t('Decisions before and after the draft')}</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1 text-start">
                    {t('Decision')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Current policy')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Draft')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {DECISIONS.map((d) => (
                  <tr key={d} className="border-t border-line">
                    <td className="py-1">
                      <DecisionBadge decision={d} />
                    </td>
                    <td>{count(sim.result.before, d)}</td>
                    <td className={count(sim.result.after, d) !== count(sim.result.before, d) ? 'font-semibold text-warn' : ''}>
                      {count(sim.result.after, d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p role="status" className="mt-2 text-sm">
            <b>{sim.result.changed}</b> {t('of')} {sim.result.rows.length} {t('scenarios would be decided differently')}.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> {t('Only show affected scenarios')}
          </label>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-start text-xs">
              <caption className="sr-only">{t('Affected scenarios')}</caption>
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="py-1 text-start">
                    {t('Scenario')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Action / role')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Current policy')}
                  </th>
                  <th scope="col" className="text-start">
                    {t('Draft')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sim.result.rows
                  .filter((r) => !onlyChanged || r.changed)
                  .map((r) => (
                    <tr key={r.id} className="border-t border-line align-top">
                      <td className="py-1">
                        <b>{r.id}</b> · {r.orderId}
                        <div className="line-clamp-1 max-w-64 text-muted">{r.message}</div>
                      </td>
                      <td>
                        {r.action.replaceAll('_', ' ')} · {r.role}
                      </td>
                      <td>
                        <DecisionBadge decision={r.before.decision} /> <span className="text-muted">{r.before.rule}</span>
                      </td>
                      <td>
                        <DecisionBadge decision={r.after.decision} /> <span className="text-muted">{r.after.rule}</span>
                      </td>
                    </tr>
                  ))}
                {onlyChanged && sim.result.changed === 0 && (
                  <tr>
                    <td colSpan={4} className="py-3 text-muted">
                      {t('No scenario is affected by this draft.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button onClick={apply} disabled={role !== 'admin' || (sim.result.changed === 0 && JSON.stringify(draft) === JSON.stringify(policy))}>
              {t('Apply draft as a new policy version')}
            </Button>
            {role !== 'admin' && <span className="text-xs text-warn">{t('Only admins can apply a policy.')}</span>}
            {applied && (
              <span role="status" className="text-xs text-ok">
                {t('Applied as a new version.')}
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
