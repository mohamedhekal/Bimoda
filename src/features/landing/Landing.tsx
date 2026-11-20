import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Cloud, Cpu, Lock, ShieldCheck, UserCheck } from 'lucide-react'
import { useEffect } from 'react'
import { useT } from '../../i18n'

const FLOW = ['Customer message', 'Privacy gate', 'Firebase AI Logic', 'On-device or cloud', 'Validated output', 'Policy engine', 'Human review']

export function Landing() {
  const t = useT()
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
  }, [])
  return (
    <div className="relative overflow-hidden">
      <div className="grid-bg absolute inset-x-0 top-0 h-[520px]" aria-hidden />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-cyan to-violet text-sm font-bold text-[#06101c]">B</span>Bimoda
        </span>
        <nav className="flex items-center gap-4 text-sm text-muted">
          <a href="#how" className="hover:text-ink">
            {t('How it works')}
          </a>
          <a href="#privacy" className="hover:text-ink">
            {t('Privacy')}
          </a>
          <Link to="/app" className="rounded-lg bg-cyan px-3 py-1.5 font-semibold text-[#06101c]">
            {t('Try Bimoda')}
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 md:pt-20">
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-medium text-cyan">
          {t('Commerce intelligence, on-device and in the cloud.')}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-6xl"
        >
          {t('Your commerce operations. Now intelligently everywhere.')}
        </motion.h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Meet the hybrid AI operations copilot that understands orders, detects risks, and assists your team — on-device when possible, in the cloud when
          needed.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/app" className="rounded-lg bg-cyan px-5 py-3 font-semibold text-[#06101c]">
            {t('Try Bimoda (demo, no sign-in)')}
          </Link>
          <Link to="/app/lab" className="rounded-lg border border-line px-5 py-3">
            {t('Open Hybrid AI Lab')}
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted">
          {t('Synthetic data only. Built on Firebase AI Logic hybrid inference. Built for the Google Firebase #BuildHybridAI 2026 hackathon.')}
        </p>
      </section>

      <section id="how" className="relative mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-2xl font-semibold">{t('One request, a transparent path')}</h2>
        <ol className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          {FLOW.map((s, i) => (
            <motion.li
              key={s}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="flex items-center gap-2"
            >
              <span className="rounded-lg border border-line bg-surface px-3 py-2">{t(s)}</span>
              {i < FLOW.length - 1 && (
                <span aria-hidden className="inline-block text-muted rtl:-scale-x-100">
                  →
                </span>
              )}
            </motion.li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted">{t('This is a static explanation. The Hybrid AI Lab shows the same path reflecting real runs.')}</p>
      </section>

      <section className="relative mx-auto grid max-w-6xl gap-4 px-4 pb-16 md:grid-cols-3">
        {[
          { icon: Cpu, t: 'Local when possible', d: 'Supported Chrome desktop runs Gemini Nano on the device. Nothing is claimed unless the SDK reports it.' },
          { icon: Cloud, t: 'Cloud when needed', d: 'Firebase AI Logic cloud fallback broadens device support, with redaction and consent.' },
          { icon: UserCheck, t: 'Humans stay in control', d: 'A deterministic policy engine decides what is allowed. AI only proposes; people approve.' },
        ].map((f) => (
          <div key={f.t} className="rounded-xl border border-line bg-surface p-5">
            <f.icon className="text-cyan" aria-hidden />
            <h3 className="mt-3 font-semibold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted">{f.d}</p>
          </div>
        ))}
      </section>

      <section id="privacy" className="relative mx-auto max-w-6xl px-4 pb-20">
        <div className="rounded-xl border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2 text-2xl font-semibold">
            <Lock size={20} /> {t('Privacy and security')}
          </h2>
          <ul className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 text-ok" /> {t('Local Only mode never sends a prompt to the cloud.')}
            </li>
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 text-ok" /> {t('Names, phones, emails and addresses are redacted before cloud-capable requests.')}
            </li>
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 text-ok" /> {t('Customer messages are treated as untrusted data, including prompt-injection attempts.')}
            </li>
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 text-ok" /> {t('Raw prompts are not stored; every run logs its actual inference source.')}
            </li>
          </ul>
          <p className="mt-4 text-xs text-muted">{t('Open source under Apache-2.0. Known limitations are documented in the repository.')}</p>
        </div>
      </section>
    </div>
  )
}
