'use client'
import Link from 'next/link'
import { useT, useGameData } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import ThemeToggle from '@/components/ThemeToggle'

const STYLE_COLOR: Record<string, string> = { driver: 'var(--purple)', expressive: 'var(--green)', amiable: 'var(--pink)', analytical: 'var(--cyan)' }

// Where each button lands on the sign-in screen: reps can sign up with an email (the mobile + PIN
// route is for people a manager invited), managers on their own tab.
export const CREATE_ACCOUNT = '/login?tab=rep&rep=individual&mode=signup'
export const CREATE_MANAGER = '/login?tab=manager&mode=signup'

function Cta({ t }: { t: (k: string) => string }) {
  return (
    <div className="landing-cta-row">
      <Link href={CREATE_ACCOUNT} className="landing-cta">{t('login.createAccount')}</Link>
      <Link href="/login" className="landing-cta landing-cta-secondary">{t('login.signIn')}</Link>
    </div>
  )
}

/** Front door: the promise, the visit loop, who it is for, then hand off to /login. */
export default function Landing() {
  const t = useT()
  const { STYLES, STYLE_ORDER } = useGameData()

  const loop = [1, 2, 3, 4].map(n => ({ n, label: t(`landing.loop${n}`), body: t(`landing.loop${n}Body`) }))
  const repPoints = [t('landing.rep1'), t('landing.rep2'), t('landing.rep3')]
  const managerPoints = [t('landing.mgr1'), t('landing.mgr2'), t('landing.mgr3')]
  const fieldPoints = [t('landing.field1'), t('landing.field2'), t('landing.field3')]

  return (
    <main className="field-ui landing">
      <header className="home-appbar">
        <div className="wordmark"><span aria-hidden="true">◆</span>StyleShift</div>
        <div className="appearance-tools"><ThemeToggle /><LangToggle /></div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-text">
          <p className="visual-eyebrow">{t('landing.eyebrow')}</p>
          <h1>{t('landing.title')}</h1>
          <p className="landing-lead">{t('landing.sub')}</p>
          <Cta t={t} />
          <p className="landing-note"><Link href="/login" className="landing-link">{t('landing.invite')}</Link></p>
        </div>

        {/* An illustration of the visit brief, not live data. Labelled as a sample so it is never read as a real doctor. */}
        <figure className="landing-phone" aria-label={t('landing.sample')}>
          <div className="landing-phone-screen">
            <div className="landing-phone-head">
              <strong>{t('landing.mockTitle')}</strong>
              <span className="landing-sample-tag">{t('landing.sample')}</span>
            </div>
            <p className="landing-phone-doctor">{t('landing.mockDoctor')}</p>
            <dl className="landing-phone-rows">
              <div><dt>{t('landing.mockStyleLabel')}</dt><dd style={{ color: STYLE_COLOR.analytical }}>{STYLES.analytical.icon} {STYLES.analytical.name}</dd></div>
              <div><dt>{t('landing.mockGoalLabel')}</dt><dd>{t('landing.mockGoal')}</dd></div>
              <div><dt>{t('landing.mockPromiseLabel')}</dt><dd>{t('landing.mockPromise')}</dd></div>
            </dl>
            <p className="landing-phone-tip"><strong>{t('landing.mockTipLabel')}</strong> {t('landing.mockTip')}</p>
          </div>
        </figure>
      </section>

      <section className="landing-section" aria-labelledby="landing-loop">
        <h2 id="landing-loop">{t('landing.loopTitle')}</h2>
        <p className="landing-sub">{t('landing.loopSub')}</p>
        <ol className="landing-loop">
          {loop.map(s => (
            <li key={s.n} className="landing-card">
              <span className="landing-step-n" aria-hidden="true">{s.n}</span>
              <h3>{s.label}</h3>
              <p>{s.body}</p>
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

      <section className="landing-section" aria-labelledby="landing-doors">
        <h2 id="landing-doors">{t('landing.doorsTitle')}</h2>
        <div className="landing-doors">
          <div className="landing-card">
            <h3>{t('landing.repTitle')}</h3>
            <ul className="landing-expect">{repPoints.map(p => <li key={p}>{p}</li>)}</ul>
            <Link href={CREATE_ACCOUNT} className="landing-link">{t('login.createAccount')}</Link>
          </div>
          <div className="landing-card">
            <h3>{t('landing.mgrTitle')}</h3>
            <ul className="landing-expect">{managerPoints.map(p => <li key={p}>{p}</li>)}</ul>
            <Link href={CREATE_MANAGER} className="landing-link">{t('login.createAccount')}</Link>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-field">
        <h2 id="landing-field">{t('landing.fieldTitle')}</h2>
        <ul className="landing-expect landing-field">
          {fieldPoints.map(p => <li key={p}>{p}</li>)}
        </ul>
      </section>

      <section className="landing-section landing-close" aria-labelledby="landing-close">
        <h2 id="landing-close">{t('landing.closeTitle')}</h2>
        <p className="landing-sub">{t('landing.closeSub')}</p>
        <Cta t={t} />
        <p className="landing-note"><Link href={CREATE_MANAGER} className="landing-link">{t('landing.manager')}</Link></p>
      </section>
    </main>
  )
}
