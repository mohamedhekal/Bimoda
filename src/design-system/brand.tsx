import { cx } from './utils'

/** Bimoda mark: two modes in one square. The solid half is "on this device", the dashed half is "over the wire". */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" className={className} aria-hidden>
      <path d="M14 2H8a6 6 0 0 0-6 6v12a6 6 0 0 0 6 6h6z" fill="var(--accent)" />
      <path
        d="M17 2h3a6 6 0 0 1 6 6v12a6 6 0 0 1-6 6h-3"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="0.1 4.600"
      />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('flex items-center gap-2', className)}>
      <Mark />
      <span className="display text-[22px]">Bimoda</span>
    </span>
  )
}

/** Route glyph used wherever a privacy mode or inference source is named. */
export function RouteGlyph({ kind, className }: { kind: 'device' | 'cloud' | 'hybrid'; className?: string }) {
  return (
    <svg width="22" height="8" viewBox="0 0 22 8" className={className} aria-hidden>
      {kind !== 'cloud' && <line x1="1" y1="4" x2={kind === 'hybrid' ? 10 : 21} y2="4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
      {kind !== 'device' && (
        <line
          x1={kind === 'hybrid' ? 13 : 1}
          y1="4"
          x2="21"
          y2="4"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="2.500 3.200"
        />
      )}
    </svg>
  )
}
