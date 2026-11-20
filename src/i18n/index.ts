import { getState, useAppState } from '../stores/store'
import { ar } from './ar'

export type Lang = 'en' | 'ar'
export const isRtl = (lang: Lang) => lang === 'ar'
export const localeOf = (lang: Lang) => (lang === 'ar' ? 'ar-EG' : 'en-US')

/** English source strings are the keys; a missing translation falls back to English (a unit test keeps ar.ts complete). */
export function translate(text: string, lang: Lang = getState().settings.lang): string {
  return lang === 'ar' ? (ar[text] ?? text) : text
}

/** Hook: re-renders when the language changes and returns a bound translator. */
export function useT() {
  const lang = useAppState((s) => s.settings.lang)
  return (text: string) => translate(text, lang)
}

export const useLang = (): Lang => useAppState((s) => s.settings.lang)
