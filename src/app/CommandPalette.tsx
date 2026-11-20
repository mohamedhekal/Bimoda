import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { cx } from '../design-system/utils'
import type { Command } from './commands'

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  // Mounted only while open so its state (query, selection) always starts fresh.
  return open ? <PaletteBody onClose={onClose} commands={commands} /> : null
}

function PaletteBody({ onClose, commands }: { onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return commands.filter((c) => terms.every((t) => c.label.toLowerCase().includes(t) || (c.hint ?? '').toLowerCase().includes(t)))
  }, [q, commands])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => previous?.focus?.()
  }, [])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      results[active]?.run()
    }
    if (e.key === 'Tab') e.preventDefault() // focus stays in the palette while it is open
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/60 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKey}
        className="mx-auto w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={16} className="text-muted" aria-hidden />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            aria-label="Type a command"
            placeholder="Type a command…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
            }}
            className="h-11 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <ul id="cmd-list" role="listbox" className="max-h-72 overflow-y-auto p-1">
          {results.length === 0 && <li className="p-3 text-sm text-muted">No matching commands.</li>}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`cmd-${c.id}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={c.run}
              className={cx('flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm', i === active && 'bg-surface2')}
            >
              <span>{c.label}</span>
              {c.hint && <span className="text-xs text-muted">{c.hint}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
