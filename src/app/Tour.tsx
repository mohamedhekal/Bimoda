import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../design-system/ui'
import { setState, useAppState } from '../stores/store'
import { useTourStep } from './tourState'

const STEPS = [
  {
    to: '/app',
    title: 'Mission Control',
    body: 'Order and case counts come from synthetic data. The AI and policy counters come from real run records, never invented numbers.',
  },
  {
    to: '/app/workspace',
    title: 'Operations workspace',
    body: 'Open case ORD-1002 (a shipped order) and press Propose with "Change variant". The deterministic policy engine blocks it (rule R-001) and offers manual review.',
  },
  {
    to: '/app/workspace',
    title: 'Real hybrid AI',
    body: 'Press "Analyze conversation". This is a real Firebase AI Logic request. The badge shows where inference happened, read from the SDK response.',
  },
  {
    to: '/app/policies',
    title: 'Policy Studio',
    body: 'Admins edit the rules. Unsafe configurations (e.g. disabling warehouse-receipt checks) are rejected. Cloud privacy consent lives here too.',
  },
  {
    to: '/app/lab',
    title: 'Hybrid AI Lab',
    body: 'Enable Local AI (Chrome desktop), then run the same case as local-only, cloud-only and hybrid. Unavailable paths say so; nothing is faked.',
  },
  {
    to: '/app/audit',
    title: 'Audit & runs',
    body: 'Every run records its source, duration and privacy handling. Approvals and actions are logged. Raw prompts are never stored.',
  },
]

export function Tour() {
  const { step, setStep } = useTourStep()
  const toured = useAppState((s) => s.settings.toured)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const ref = useRef<HTMLDivElement>(null)

  // Offer the tour once, on the first visit to the app.
  useEffect(() => {
    if (!toured && step === null && pathname === '/app') {
      const t = setTimeout(() => setStep(0), 600)
      return () => clearTimeout(t)
    }
  }, [toured, step, pathname, setStep])

  useEffect(() => {
    if (step !== null) ref.current?.focus()
  }, [step])

  if (step === null) return null
  const s = STEPS[step]!
  const done = () => {
    setStep(null)
    setState((st) => ({ ...st, settings: { ...st.settings, toured: true } }))
  }
  const go = (n: number) => {
    setStep(n)
    navigate(STEPS[n]!.to)
  }
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Demo tour"
      onKeyDown={(e) => e.key === 'Escape' && done()}
      className="fixed bottom-20 end-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-cyan/60 bg-surface p-4 shadow-2xl md:bottom-6"
    >
      <p className="text-[11px] uppercase tracking-wider text-cyan">
        Demo tour · {step + 1} of {STEPS.length}
      </p>
      <h2 className="mt-1 font-semibold">{s.title}</h2>
      <p className="mt-1 text-sm text-muted">{s.body}</p>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" className="min-h-9 px-3" onClick={done}>
          Skip
        </Button>
        <span className="flex-1" />
        {step > 0 && (
          <Button variant="ghost" className="min-h-9 px-3" onClick={() => go(step - 1)}>
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button className="min-h-9 px-3" onClick={() => go(step + 1)}>
            Next
          </Button>
        ) : (
          <Button className="min-h-9 px-3" onClick={done}>
            Finish
          </Button>
        )}
      </div>
    </div>
  )
}
