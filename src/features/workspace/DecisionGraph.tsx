import { useState } from 'react'
import { Badge, Card } from '../../design-system/ui'
import { cx } from '../../design-system/utils'
import type { TraceNode, TraceOrigin, TraceStatus } from '../../domain/trace'
import { useT } from '../../i18n'

const ORIGIN: Record<TraceOrigin, { label: string; tone: 'neutral' | 'violet' | 'cyan' | 'warn'; border: string }> = {
  customer: { label: 'Customer text (untrusted)', tone: 'neutral', border: 'border-s-muted' },
  model: { label: 'Model-generated', tone: 'violet', border: 'border-s-violet' },
  deterministic: { label: 'Deterministic rule', tone: 'cyan', border: 'border-s-cyan' },
  human: { label: 'Human decision', tone: 'warn', border: 'border-s-warn' },
}
const STATUS: Record<TraceStatus, { glyph: string; cls: string; label: string }> = {
  done: { glyph: '✓', cls: 'text-ok', label: 'done' },
  pending: { glyph: '…', cls: 'text-muted', label: 'pending' },
  blocked: { glyph: '✗', cls: 'text-bad', label: 'blocked' },
  warn: { glyph: '!', cls: 'text-warn', label: 'needs attention' },
}

/** Vertical decision trace. Color and label show who produced each step so model text is never confused with enforcement. */
export function DecisionGraph({ nodes }: { nodes: TraceNode[] }) {
  const t = useT()
  const [open, setOpen] = useState<Record<string, boolean>>({ policy: true })
  return (
    <Card title={t('Decision trace')} action={<Badge>{t('why this outcome')}</Badge>}>
      <ul className="mb-3 flex flex-wrap gap-1" aria-label={t('Legend')}>
        {(Object.keys(ORIGIN) as TraceOrigin[]).map((k) => (
          <li key={k}>
            <Badge tone={ORIGIN[k].tone}>{t(ORIGIN[k].label)}</Badge>
          </li>
        ))}
      </ul>
      <ol className="space-y-2">
        {nodes.map((n, idx) => {
          const o = ORIGIN[n.origin]
          const s = STATUS[n.status]
          const expanded = !!open[n.id]
          return (
            <li key={n.id}>
              <div className={cx('rounded-lg border border-line border-s-4 bg-surface2/40', o.border)}>
                <button
                  className="flex w-full items-start gap-2 p-2 text-start"
                  aria-expanded={expanded}
                  aria-controls={`trace-${n.id}`}
                  onClick={() => setOpen((p) => ({ ...p, [n.id]: !p[n.id] }))}
                >
                  <span aria-hidden className={cx('mt-0.5 w-4 text-center font-bold', s.cls)}>
                    {s.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {idx + 1}. {t(n.title)}
                      <Badge tone={o.tone}>{t(o.label)}</Badge>
                      <span className="sr-only">{t(s.label)}</span>
                    </span>
                    <span className="mt-0.5 block break-words text-xs text-muted">{n.summary}</span>
                  </span>
                </button>
                {expanded && n.evidence.length > 0 && (
                  <dl id={`trace-${n.id}`} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-t border-line p-2 text-xs">
                    {n.evidence.map((e, i) => (
                      <div key={i} className="contents">
                        <dt className="text-muted">{e.label}</dt>
                        <dd className="break-words">{e.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-[11px] text-muted">
        {t('Model-generated text explains and proposes. Only the deterministic policy decision and a human approval can allow an action.')}
      </p>
    </Card>
  )
}
