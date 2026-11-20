export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export type Tone = 'neutral' | 'accent' | 'violet' | 'ok' | 'warn' | 'bad' | 'info'

export const statusTone: Record<string, Tone> = {
  success: 'ok',
  unavailable: 'warn',
  blocked_privacy: 'bad',
  consent_required: 'warn',
  offline: 'warn',
  config_missing: 'warn',
  cancelled: 'neutral',
  error: 'bad',
}
