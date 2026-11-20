import { useState } from 'react'
import { DEFAULT_POLICY, validatePolicyConfig, type PolicyConfig } from '../../domain/policy'
import { Badge, Button, Card } from '../../design-system/ui'
import { logAudit, savePolicy, setState, useAppState } from '../../stores/store'
import { useT } from '../../i18n'

export function Policies() {
  const t = useT()
  const policy = useAppState((s) => s.policy)
  const settings = useAppState((s) => s.settings)
  const [draft, setDraft] = useState<PolicyConfig>(policy)
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const canEdit = settings.role === 'admin'

  const save = () => {
    const v = validatePolicyConfig({ ...draft, version: policy.version + 1 })
    if (!v.ok) return (setErrors(v.errors), setSaved(false))
    setErrors([])
    savePolicy(v.config) // local state, or Firestore (admin-only + schema checked by the security rules) when signed in
    logAudit('admin (demo)', `policy_updated:v${v.config.version}`, 'policy')
    setSaved(true)
  }
  const num = (k: 'maxEditValueCents' | 'refundApprovalThresholdCents', label: string) => (
    <label className="block text-sm">
      {label} (USD)
      <input
        type="number"
        min={0}
        disabled={!canEdit}
        className="mt-1 w-full rounded-lg border border-line bg-bg p-2"
        value={draft[k] / 100}
        onChange={(e) => setDraft({ ...draft, [k]: Math.round(Number(e.target.value) * 100) })}
      />
    </label>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('Policy Studio')}</h1>
        <p className="text-sm text-muted">
          Deterministic rules the AI cannot override. Current version <b>v{policy.version}</b>. Only admins can edit; switch role in the top bar.
        </p>
      </div>
      <Card title={t('Order and refund rules')} action={<Badge tone={canEdit ? 'ok' : 'warn'}>{canEdit ? 'editable' : 'read-only'}</Badge>}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            Order edits lock from
            <select
              disabled={!canEdit}
              className="mt-1 w-full rounded-lg border border-line bg-bg p-2"
              value={draft.editLockFrom}
              onChange={(e) => setDraft({ ...draft, editLockFrom: e.target.value as PolicyConfig['editLockFrom'] })}
            >
              <option value="processing">Processing</option>
              <option value="packed">Packed</option>
              <option value="shipped">Shipped</option>
            </select>
          </label>
          {num('maxEditValueCents', 'Agent edit limit')}
          {num('refundApprovalThresholdCents', 'Refund approval threshold')}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={draft.requireWarehouseReceipt}
              onChange={(e) => setDraft({ ...draft, requireWarehouseReceipt: e.target.checked })}
            />{' '}
            Require confirmed warehouse receipt
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={draft.messagesRequireApproval}
              onChange={(e) => setDraft({ ...draft, messagesRequireApproval: e.target.checked })}
            />{' '}
            Outbound messages need approval
          </label>
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="mt-3 list-disc rounded-lg border border-bad/50 bg-bad/10 p-3 ps-6 text-xs text-bad">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {saved && (
          <p role="status" className="mt-3 text-xs text-ok">
            Saved as v{policy.version}.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <Button onClick={save} disabled={!canEdit}>
            {t('Validate and save')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(DEFAULT_POLICY)
              setErrors([])
            }}
          >
            {t('Load defaults')}
          </Button>
        </div>
      </Card>

      <Card title={t('Cloud privacy consent')}>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.allowIdentifiableCloud}
            onChange={(e) => setState((s) => ({ ...s, settings: { ...s.settings, allowIdentifiableCloud: e.target.checked } }))}
          />
          <span>
            I consent to sending <b>identifiable</b> customer text (names, phones, addresses) to Firebase AI Logic cloud models when a request is cloud-capable.
            By default these fields are redacted before any cloud-capable request. Local Only mode never sends anything to the cloud.
          </span>
        </label>
      </Card>
    </div>
  )
}
