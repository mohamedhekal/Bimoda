import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Cloud, Cpu } from 'lucide-react'
import type { AiRunRecord } from '../ai/hybrid-engine/types'
import type { Decision } from '../domain/policy'
import { cx, type Tone } from './utils'

/** A quiet panel on the desk. Hierarchy comes from type and space, not from boxes inside boxes. */
export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('rounded-2xl border border-line/50 bg-surface p-5', className)}>
      {(title || action) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

const tones: Record<Tone, string> = {
  neutral: 'border-line text-muted',
  accent: 'border-accent/50 text-accentink bg-accent/10',
  violet: 'border-violet/50 text-violet bg-violet/10',
  ok: 'border-ok/50 text-ok bg-ok/10',
  warn: 'border-accent/50 text-accentink bg-accent/10',
  bad: 'border-bad/50 text-bad bg-bad/10',
  info: 'border-info/50 text-info bg-info/10',
}
export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>
}

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const v = {
    primary: 'bg-accent text-onaccent font-semibold hover:brightness-105 active:translate-y-px',
    ghost: 'border border-line text-ink hover:bg-surface2',
    danger: 'border border-bad/60 text-bad hover:bg-bad/10',
  }[variant]
  return (
    <button
      {...p}
      className={cx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] px-4 text-sm transition disabled:cursor-not-allowed disabled:opacity-45',
        v,
        className,
      )}
    />
  )
}

/** One column of a manifest: a ruled figure, not a card. Put several in a grid. */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: Tone }) {
  return (
    <div className="border-s-2 border-line ps-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={cx('figure mt-0.5 text-[28px] leading-tight', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-accentink', tone === 'ok' && 'text-ok')}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  )
}

/**
 * Where inference happened, based only on the recorded SDK/mode data.
 * Shape carries the meaning: SOLID = on this device, DASHED = over the wire to the cloud.
 */
export function SourceBadge({ record }: { record: Pick<AiRunRecord, 'source' | 'sourceBasis' | 'status'> }) {
  if (record.status !== 'success' || !record.source)
    return <span className="inline-flex items-center rounded-md border border-dotted border-line px-2 py-0.5 text-xs text-muted">No model output</span>
  const on = record.source === 'ON_DEVICE'
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold',
        on ? 'bg-ink text-bg' : 'border-2 border-dashed border-ink/70 text-ink',
      )}
    >
      {on ? <Cpu size={12} aria-hidden /> : <Cloud size={12} aria-hidden />}
      {on ? 'Processed on this device' : 'Processed in cloud'}
      {record.sourceBasis === 'mode' && <span className="font-normal opacity-70">(per mode)</span>}
    </span>
  )
}

const stampTone: Record<Decision, string> = { ALLOW: 'text-ok', DENY: 'text-bad', REQUIRE_APPROVAL: 'text-violet', NEED_MORE_INFORMATION: 'text-info' }
/** Policy decisions are rubber stamps: only the deterministic policy engine can press one. */
export const DecisionBadge = ({ decision, large, animate }: { decision: Decision; large?: boolean; animate?: boolean }) => (
  <span className={cx('stamp', stampTone[decision], large && 'stamp-lg', animate && 'stamp-in')}>{decision.replaceAll('_', ' ')}</span>
)

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  )
}
