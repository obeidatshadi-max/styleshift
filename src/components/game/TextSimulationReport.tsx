'use client'
import { useMemo } from 'react'
import { useT } from '@/lib/i18n'
import { summarizeReport, type ReportHighlight } from '@/lib/simulation-report'
import { SCORED_COMPETENCIES } from '@/schemas/scoring'
import { COMPETENCIES, type EvidenceRef, type Observation } from '@/schemas/observation'
import type { CoachingRecommendation } from '@/schemas/coaching'
import type { SessionReport } from '@/schemas/report'

export const fs = (px: number) => `max(${px}px, var(--voice-min-font, 0px))`
export const card: React.CSSProperties = { background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)', borderRadius: 16, padding: 16, boxShadow: '0 12px 40px rgba(0,0,0,.45)' }
export const primaryBtn: React.CSSProperties = { width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: fs(12), letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px', boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation' }
export const ghostBtn: React.CSSProperties = { cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: fs(12), letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent', borderRadius: 10, padding: '12px 18px', touchAction: 'manipulation' }
export const sectionLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: fs(11), letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }
export const smallLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: fs(10), letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 4 }
export const bodyText: React.CSSProperties = { fontSize: fs(13.5), lineHeight: 1.55, color: 'var(--ink)' }

// Score bars stay cyan; green/red are reserved for "helped"/"hurt" so one
// colour never means two things on this screen.
const DIR_COLOR = { positive: 'var(--green)', negative: 'var(--red)', neutral: 'var(--ink-dim)' } as const

type Translate = (key: string, params?: Record<string, string | number>) => string

function useLabels() {
  const t = useT()
  const label = (prefix: 'comp' | 'beh', key: string) => {
    const v = t(`sim.${prefix}.${key}`)
    return v === `sim.${prefix}.${key}` ? key.replace(/_/g, ' ') : v // unknown key: readable fallback
  }
  return { t, label }
}

function Evidence({ items, t }: { items: EvidenceRef[]; t: Translate }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {items.map((e, i) => (
        <blockquote key={i} dir="auto" style={{ margin: 0, padding: '7px 10px', borderInlineStart: '3px solid var(--cyan)', background: 'rgba(0,0,0,.25)', borderRadius: 6, fontSize: fs(13), lineHeight: 1.5 }}>
          “{e.quote}”
          <span style={{ display: 'block', marginTop: 2, fontFamily: 'var(--mono)', fontSize: fs(10), letterSpacing: '.08em', color: 'var(--ink-dim)' }}>
            {t('sim.report.turn', { n: e.turnIndex })} · {e.role === 'doctor' ? t('sim.doctor') : t('sim.you')}
          </span>
        </blockquote>
      ))}
    </div>
  )
}

function Highlight({ title, h, tone, t, label }: { title: string; h: ReportHighlight | null; tone: string; t: Translate; label: ReturnType<typeof useLabels>['label'] }) {
  return (
    <div style={{ border: `1px solid ${tone}`, borderRadius: 12, padding: 12, background: 'rgba(0,0,0,.2)' }}>
      <div style={{ ...smallLabel, color: tone }}>{title}</div>
      {h ? (
        <>
          <div style={{ fontSize: fs(15), fontWeight: 700 }}>{label('beh', h.behavior)}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: fs(10.5), letterSpacing: '.1em', color: 'var(--ink-dim)', marginBottom: 6 }}>{label('comp', h.competency)}</div>
          {h.observation && <div dir="auto" style={bodyText}>{h.observation.observation}</div>}
          {h.observation && <Evidence items={h.observation.evidence} t={t} />}
        </>
      ) : <div style={{ ...bodyText, color: 'var(--ink-dim)' }}>{t('sim.report.none')}</div>}
    </div>
  )
}

function CoachingBlock({ item, t, label }: { item: CoachingRecommendation; t: Translate; label: ReturnType<typeof useLabels>['label'] }) {
  const field = (title: string, text: string) => (
    <div style={{ marginTop: 10 }}>
      <div style={smallLabel}>{title}</div>
      <div dir="auto" style={bodyText}>{text}</div>
    </div>
  )
  return (
    <div>
      {item.kind === 'build_on' && <div style={{ ...smallLabel, color: 'var(--green)' }}>{t('sim.report.buildOn')}</div>}
      <div style={{ fontSize: fs(15), fontWeight: 700 }}>{label('beh', item.behavior)}</div>
      {field(t('sim.report.whatHappened'), item.whatHappened)}
      <div style={{ marginTop: 10 }}>
        <div style={smallLabel}>{t('sim.report.evidence')}</div>
        <Evidence items={item.evidence} t={t} />
      </div>
      {field(t('sim.report.whyItMattered'), item.whyItMattered)}
      {field(t('sim.report.doDifferently'), item.whatToDoDifferently)}
      <div style={{ marginTop: 10, border: '1px solid var(--green)', borderRadius: 10, padding: 10, background: 'rgba(62,224,143,.08)' }}>
        <div style={{ ...smallLabel, color: 'var(--green)' }}>{t('sim.report.betterExample')}</div>
        <div dir="auto" style={bodyText}>“{item.betterResponseExample}”</div>
      </div>
      {field(t('sim.report.practice'), item.practiceAction)}
    </div>
  )
}

interface Props {
  report: SessionReport
  onTryAgain: () => void
  onBack: () => void
  /** Re-runs the pipeline; the server resumes at coaching. */
  onRetryCoaching: () => void
  /** Shown when a coaching retry failed, so the failure is never silent. */
  error?: string | null
}

/** The post-simulation report. Every number and quote shown was computed or
 * copied server-side; this component only lays it out. */
export default function TextSimulationReport({ report: r, onTryAgain, onBack, onRetryCoaching, error }: Props) {
  const { t, label } = useLabels()
  const summary = useMemo(() => summarizeReport(r), [r])
  const primary = summary.primaryCoaching
  const others = r.coaching.filter(x => x.id !== primary?.id)
  const grouped = COMPETENCIES.filter(k => (r.observationsByCompetency[k]?.length ?? 0) > 0)

  return (
    <div className="voice-practice" style={{ position: 'relative', zIndex: 1, maxWidth: 560, margin: '0 auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}>
        <div style={sectionLabel}>{t('sim.report.title')}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 44, fontWeight: 700, color: 'var(--cyan)', lineHeight: 1 }}>{r.scores.overall ?? '—'}</span>
          <span style={{ ...smallLabel, marginBottom: 0 }}>{t('sim.report.overall')}</span>
        </div>

        <div style={smallLabel}>{t('sim.report.competencies')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {SCORED_COMPETENCIES.map(k => {
            const score = r.scores.competencies[k].score
            return (
              <div key={k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: fs(12.5), marginBottom: 3 }}>
                  <span>{label('comp', k)}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: score === null ? 'var(--ink-dim)' : 'var(--cyan)' }}>{score === null ? t('sim.report.noEvidence') : score}</span>
                </div>
                <div role="img" aria-label={`${label('comp', k)}: ${score ?? t('sim.report.noEvidence')}`} style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,.07)' }}>
                  <div style={{ height: '100%', width: `${score ?? 0}%`, borderRadius: 4, background: 'var(--cyan)' }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Highlight title={t('sim.report.strongest')} h={summary.strongest} tone="var(--green)" t={t} label={label} />
        <Highlight title={t('sim.report.opportunity')} h={summary.biggestOpportunity} tone="var(--red)" t={t} label={label} />
      </div>

      <div style={card}>
        <div style={sectionLabel}>{t('sim.report.coaching')}</div>
        {primary ? <CoachingBlock item={primary} t={t} label={label} /> : (
          <div style={{ ...bodyText, color: 'var(--ink-dim)' }}>
            {r.coachingStatus === 'unavailable' ? t('sim.report.coachingUnavailable') : t('sim.report.nothingToCoach')}
          </div>
        )}
        {error && <div role="alert" style={{ ...bodyText, color: 'var(--red)', marginTop: 12 }}>{error}</div>}
        {r.coachingStatus === 'unavailable' && (
          <button onClick={onRetryCoaching} style={{ ...ghostBtn, width: '100%', marginTop: 12 }}>{t('sim.report.retryCoaching')}</button>
        )}
        {others.map(item => (
          <details key={item.id} style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: fs(13.5), fontWeight: 600 }}>{label('beh', item.behavior)}</summary>
            <div style={{ marginTop: 6 }}><CoachingBlock item={item} t={t} label={label} /></div>
          </details>
        ))}
      </div>

      {grouped.length > 0 && (
        <div style={card}>
          <div style={sectionLabel}>{t('sim.report.observations')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {grouped.map(k => (
              <div key={k}>
                <div style={smallLabel}>{label('comp', k)}</div>
                {(r.observationsByCompetency[k] as Observation[]).map((o, i) => (
                  <div key={i} style={{ padding: '8px 0', borderTop: i ? '1px solid var(--line)' : undefined }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: fs(13.5), fontWeight: 600 }}>{label('beh', o.behavior)}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: fs(10), letterSpacing: '.1em', textTransform: 'uppercase', color: DIR_COLOR[o.direction], border: `1px solid ${DIR_COLOR[o.direction]}`, borderRadius: 999, padding: '1px 8px' }}>
                        {t(`sim.report.dir.${o.direction}`)}
                      </span>
                    </div>
                    <div dir="auto" style={{ ...bodyText, marginTop: 4 }}>{o.observation}</div>
                    <Evidence items={o.evidence} t={t} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <details style={card}>
        <summary style={{ cursor: 'pointer', ...sectionLabel, marginBottom: 0 }}>{t('sim.report.transcript')}</summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {r.transcript.map(turn => (
            <div key={turn.turnIndex} dir="auto" style={bodyText}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: fs(10), letterSpacing: '.08em', textTransform: 'uppercase', color: turn.role === 'doctor' ? 'var(--ink-dim)' : 'var(--cyan)' }}>
                {turn.role === 'doctor' ? t('sim.doctor') : t('sim.you')} · {t('sim.report.turn', { n: turn.turnIndex })}
              </span>
              <div>{turn.text}</div>
            </div>
          ))}
        </div>
      </details>

      <button onClick={onTryAgain} style={primaryBtn}>{t('sim.report.tryAgain')}</button>
      <button onClick={onBack} style={{ ...ghostBtn, width: '100%' }}>{t('sim.back')}</button>
    </div>
  )
}
