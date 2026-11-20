import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { AiRunRecord } from '../ai/hybrid-engine/types'
import type { Decision } from '../domain/policy'
import { cx, type Tone } from './utils'

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-xl border border-line bg-surface p-4', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

const tones: Record<Tone, string> = {
  neutral: 'border-line text-muted',
  cyan: 'border-cyan/50 text-cyan bg-cyan/10',
  violet: 'border-violet/50 text-violet bg-violet/10',
  ok: 'border-ok/50 text-ok bg-ok/10',
  warn: 'border-warn/50 text-warn bg-warn/10',
  bad: 'border-bad/50 text-bad bg-bad/10',
}
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>
}

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const v = {
    primary: 'bg-cyan text-[#06101c] hover:brightness-110 font-semibold',
    ghost: 'border border-line text-ink hover:bg-surface2',
    danger: 'border border-bad/60 text-bad hover:bg-bad/10',
  }[variant]
  return (
    <button
      {...p}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
        v,
        className,
      )}
    />
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular-nums', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn', tone === 'ok' && 'text-ok')}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}

/** Shows where inference happened, based only on the recorded SDK/mode data. */
export function SourceBadge({ record }: { record: Pick<AiRunRecord, 'source' | 'sourceBasis' | 'status'> }) {
  if (record.status !== 'success' || !record.source) return <Badge tone="neutral">No model output</Badge>
  const on = record.source === 'ON_DEVICE'
  return (
    <Badge tone={on ? 'ok' : 'violet'}>
      <span aria-hidden>{on ? '●' : '☁'}</span>
      {on ? 'Processed on this device' : 'Processed in cloud'}
      {record.sourceBasis === 'mode' && <span className="opacity-70">(per mode)</span>}
    </Badge>
  )
}

const decisionTone: Record<Decision, Tone> = { ALLOW: 'ok', DENY: 'bad', REQUIRE_APPROVAL: 'warn', NEED_MORE_INFORMATION: 'cyan' }
export const DecisionBadge = ({ decision }: { decision: Decision }) => <Badge tone={decisionTone[decision]}>{decision.replaceAll('_', ' ')}</Badge>

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  )
}
