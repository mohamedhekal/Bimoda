/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ar } from '../i18n/ar'
import { translate, isRtl, localeOf } from '../i18n'

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : f.endsWith('.tsx') ? [join(dir, f)] : []))

describe('Arabic (beta) translations', () => {
  it('has a translation for every literal passed to t(...) in the source', () => {
    const missing = new Set<string>()
    for (const file of walk('src')) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'\s*,?\s*\)/g)) {
        const key = m[1]!.replace(/\\'/g, "'")
        if (!(key in ar)) missing.add(`${file}: ${key}`)
      }
    }
    expect([...missing]).toEqual([])
  })
  it('has no empty translations and keeps technical product names intact', () => {
    for (const [k, v] of Object.entries(ar)) expect(v.trim(), k).not.toBe('')
    expect(ar['Firebase AI Logic']).toContain('Firebase AI Logic')
  })
  it('falls back to English for unknown strings and switches direction/locale', () => {
    expect(translate('Never translated', 'ar')).toBe('Never translated')
    expect(translate('Policy Studio', 'ar')).not.toBe('Policy Studio')
    expect(translate('Policy Studio', 'en')).toBe('Policy Studio')
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('en')).toBe(false)
    expect(localeOf('ar')).toBe('ar-EG')
  })
})
