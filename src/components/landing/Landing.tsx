'use client'
import Link from 'next/link'
import { useT, useGameData } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import ThemeToggle from '@/components/ThemeToggle'

const STYLE_COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

/** Signed-out front door: say what the product is, what happens inside, then hand off to /login. */
export default function Landing() {
  const t = useT()
  const { STYLES, STYLE_ORDER } = useGameData()

  const steps = [
    { n: 1, label: t('landing.step1'), body: t('login.hookTrain') },
    { n: 2, label: t('landing.step2'), body: t('login.hookRehearse') },
    { n: 3, label: t('landing.step3'), body: t('login.hookPerform') },
  ]
  const expectations = [t('landing.expect1'), t('landing.expect2'), t('landing.expect3')]

  return (
    <main className="field-ui landing">
      <header className="home-appbar">
        <div className="wordmark"><span aria-hidden="true">◆</span>StyleShift</div>
        <div className="appearance-tools"><ThemeToggle /><LangToggle /></div>
      </header>

      <section className="home-intro landing-hero">
        <p className="visual-eyebrow">{t('landing.eyebrow')}</p>
        <h1>{t('landing.title')}</h1>
        <p>{t('landing.sub')}</p>
        <div className="landing-cta-row">
          <Link href="/login" className="landing-cta">{t('landing.cta')}</Link>
        </div>
        <p className="landing-note">{t('landing.invite')}</p>
      </section>

      <section className="landing-section" aria-labelledby="landing-steps">
        <h2 id="landing-steps">{t('landing.stepsTitle')}</h2>
        <ol className="landing-steps">
          {steps.map(s => (
            <li key={s.n} className="landing-card">
              <span className="landing-step-n" aria-hidden="true">{s.n}</span>
              <div>
                <h3>{s.label}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section" aria-labelledby="landing-styles">
        <h2 id="landing-styles">{t('landing.stylesTitle')}</h2>
        <p className="landing-sub">{t('landing.stylesSub')}</p>
        <ul className="landing-styles">
          {STYLE_ORDER.map(k => {
            const s = STYLES[k]
            return (
              <li key={k} className="landing-card" style={{ ['--style-color' as string]: STYLE_COLOR[k] }}>
                <h3><span aria-hidden="true">{s.icon}</span> {s.name}</h3>
                <p>{s.blurb}</p>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="landing-section" aria-labelledby="landing-expect">
        <h2 id="landing-expect">{t('landing.expectTitle')}</h2>
        <ul className="landing-expect">
          {expectations.map(e => <li key={e}>{e}</li>)}
        </ul>
        <div className="landing-cta-row">
          <Link href="/login" className="landing-cta">{t('landing.cta')}</Link>
        </div>
        <p className="landing-note">{t('landing.manager')}</p>
      </section>
    </main>
  )
}
