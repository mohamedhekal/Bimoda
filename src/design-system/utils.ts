export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export type Tone = 'neutral' | 'cyan' | 'violet' | 'ok' | 'warn' | 'bad'

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
