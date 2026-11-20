export interface KnownEntities {
  names?: string[]
  phones?: string[]
  emails?: string[]
  addresses?: string[]
}

export interface RedactionResult {
  text: string
  /** how many substitutions were made */
  count: number
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Deterministic redaction applied before any request that could reach the cloud.
 * Known entities are replaced first (exact, case-insensitive), then generic patterns.
 */
export function redact(input: string, known: KnownEntities = {}): RedactionResult {
  let text = input
  let count = 0
  const sub = (re: RegExp, token: string) => {
    text = text.replace(re, () => {
      count++
      return token
    })
  }
  const list = (items: string[] | undefined, token: string) => {
    for (const item of [...(items ?? [])].filter(Boolean).sort((a, b) => b.length - a.length)) {
      sub(new RegExp(escapeRe(item), 'gi'), token)
      // also match individual name parts (first/last) of 3+ chars
      if (token === '[CUSTOMER_NAME]')
        for (const part of item.split(/\s+/).filter((p) => p.length >= 3)) sub(new RegExp(`\\b${escapeRe(part)}\\b`, 'gi'), token)
    }
  }
  list(known.addresses, '[ADDRESS]')
  list(known.emails, '[EMAIL]')
  list(known.phones, '[PHONE]')
  list(known.names, '[CUSTOMER_NAME]')
  sub(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]')
  text = text.replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => {
    if (m.replace(/\D/g, '').length < 7 || /^\d{4}-\d{2}-\d{2}$/.test(m)) return m // dates and short ids are not phone numbers
    count++
    return '[PHONE]'
  })
  return { text, count }
}

export const containsIdentifiable = (input: string, known: KnownEntities = {}): boolean => redact(input, known).count > 0
