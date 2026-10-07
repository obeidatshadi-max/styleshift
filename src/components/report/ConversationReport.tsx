'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import type { ConversationReport as ReportType, EvidenceRef, Certainty, ObjectiveStatus, CommitmentStatus } from '@/schemas/conversationReport'
import { SocialStyleCard } from './SocialStyleCard'

const card: React.CSSProperties = {
  background: 'linear-gradient(180deg,var(--panel),#0a1430)', border: '1px solid var(--line)',
  borderRadius: 18, padding: '18px 20px 20px', boxShadow: '0 16px 50px rgba(0,0,0,.55)',
}
const eyebrow = (text: string) => (
  <div style={{ fontFamily: 'var(--mono)', fontSize: 'max(11px, var(--voice-min-font, 0px))', letterSpacing: '.3em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{text}</div>
)
const bodyText: React.CSSProperties = { fontSize: 'max(13.5px, var(--voice-min-font, 0px))', lineHeight: 1.6, color: 'var(--ink)', margin: 0 }
const fieldLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 'max(10.5px, var(--voice-min-font, 0px))', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)' }

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ display: 'inline-block', fontFamily: 'var(--mono)', fontSize: 'max(10.5px, var(--voice-min-font, 0px))', letterSpacing: '.03em', border: `1px solid ${color}`, color, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

const CERTAINTY_COLOR: Record<Certainty, string> = { stated: 'var(--green)', inferred: 'var(--cyan)', not_established: 'var(--ink-dim)' }
const OBJECTIVE_STATUS_COLOR: Record<ObjectiveStatus, string> = {
  achieved: 'var(--green)', partial: 'var(--amber)', not_achieved: 'var(--red)', insufficient_evidence: 'var(--ink-dim)',
}
const COMMITMENT_COLOR: Record<CommitmentStatus, string> = { agreed: 'var(--green)', proposed: 'var(--cyan)', ai_recommended: 'var(--purple)' }

/** Same button+state disclosure MyCoachingInsights.tsx already uses on the
 * home screen — kept local rather than shared since neither file has a
 * components-lib layer yet and this is the only other place it's needed. */
function Accordion({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
      <button aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', background: 'transparent', border: 'none', padding: '13px 14px', textAlign: 'start', color: 'var(--cyan)', fontFamily: 'var(--mono)', fontSize: 'max(11px, var(--voice-min-font, 0px))', letterSpacing: '.15em', textTransform: 'uppercase' }}>
        <span>{title}</span>
        <span style={{ flex: '0 0 auto' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>}
    </div>
  )
}

function Evidence({ evidence, audioAvailable }: { evidence: EvidenceRef; audioAvailable: boolean }) {
  const t = useT()
  return (
    <div dir="auto" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, margin: '6px 0', paddingInlineStart: 12, borderInlineStart: '2px solid var(--line)' }}>
      <p style={{ flex: 1, fontSize: 'max(12.5px, var(--voice-min-font, 0px))', lineHeight: 1.55, color: 'var(--ink-dim)', fontStyle: 'italic', margin: 0 }}>
        &ldquo;{evidence.quote}&rdquo;{' '}
        <span style={{ fontFamily: 'var(--mono)', fontSize: 'max(10px, var(--voice-min-font, 0px))', textTransform: 'uppercase', letterSpacing: '.05em', fontStyle: 'normal', opacity: .75 }}>
          &mdash; {evidence.speakerRole}
        </span>
      </p>
      {audioAvailable && (
        <button type="button" aria-label={t('report.evidence.play')}
          style={{ flexShrink: 0, cursor: 'pointer', width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--cyan)', background: 'transparent', color: 'var(--cyan)', fontSize: 'max(11px, var(--voice-min-font, 0px))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          &#9654;
        </button>
      )}
    </div>
  )
}

export function ConversationReport({ report, outdated, audioAvailable = false }: {
  report: ReportType; outdated: boolean; audioAvailable?: boolean
}) {
  const t = useT()
  return (
    <div dir="auto" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {outdated && (
        <div data-testid="report-outdated-banner" role="status"
          style={{ border: '1px solid var(--amber)', borderRadius: 12, padding: '11px 14px', background: 'rgba(255,206,77,.08)', color: 'var(--amber)', fontSize: 'max(12.5px, var(--voice-min-font, 0px))', lineHeight: 1.5 }}>
          {t('report.outdated')}
        </div>
      )}

      <div style={card}>
        {eyebrow(t('report.visitSummary.title'))}
        <p style={{ ...bodyText, marginBottom: 10 }}>{report.visitSummary.summary}</p>
        <div style={{ fontSize: 'max(12.5px, var(--voice-min-font, 0px))', color: 'var(--ink-dim)', marginBottom: 8 }}>
          <span style={fieldLabel}>{t('report.visitSummary.objective')}: </span>
          {report.visitSummary.objective ?? t('report.visitSummary.noObjective')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge text={t(`report.objectiveStatus.${report.visitSummary.objectiveStatus}`)} color={OBJECTIVE_STATUS_COLOR[report.visitSummary.objectiveStatus]} />
          <span style={{ fontSize: 'max(12px, var(--voice-min-font, 0px))', color: 'var(--ink-dim)' }}>{report.visitSummary.objectiveStatusReason}</span>
        </div>
      </div>

      {/* The one thing worth acting on, surfaced right after the brief
          context above — not buried below several collapsed accordions like
          before. Mirrors RoleplayRecorder's single-insight callout. */}
      <div style={{ ...card, border: '1px solid var(--amber)', background: 'rgba(255,206,77,.05)' }}>
        {eyebrow(t('report.coachingPriority.title'))}
        <p style={{ ...bodyText, marginBottom: 10 }}>{report.coachingPriority.behavior}</p>
        {report.coachingPriority.evidence.map((e, i) => <Evidence key={i} evidence={e} audioAvailable={audioAvailable} />)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <div><span style={fieldLabel}>{t('report.coachingPriority.betterPhrase')}: </span><span style={bodyText}>{report.coachingPriority.betterPhrase}</span></div>
          <div><span style={fieldLabel}>{t('report.coachingPriority.practice')}: </span><span style={bodyText}>{report.coachingPriority.practiceExercise}</span></div>
          <div><span style={fieldLabel}>{t('report.coachingPriority.success')}: </span><span style={bodyText}>{report.coachingPriority.successLooksLike}</span></div>
        </div>
      </div>

      <div style={{ ...card, border: '1px solid var(--green)', background: 'rgba(62,224,143,.05)' }}>
        {eyebrow(t('report.strength.title'))}
        <p style={bodyText}>{report.strength.behavior}</p>
        {report.strength.evidence.map((e, i) => <Evidence key={i} evidence={e} audioAvailable={audioAvailable} />)}
      </div>

      {report.momentUnderstanding && <section style={card} aria-label={t('report.moment.title')}>
        {eyebrow(t('report.moment.title'))}
        <div style={fieldLabel}>{t('report.moment.words')}</div>
        <Evidence evidence={report.momentUnderstanding.evidence} audioAvailable={audioAvailable} />
        <div style={{ ...fieldLabel, marginTop: 12 }}>{t('report.moment.possibilities')}</div>
        <ul style={{ ...bodyText, paddingInlineStart: 20, marginTop: 6 }}>
          {report.momentUnderstanding.possibleMeanings.map((meaning, i) => <li key={i}>{meaning}</li>)}
        </ul>
        <div style={{ marginTop: 12 }}><span style={fieldLabel}>{t('report.moment.unknown')}: </span><span style={bodyText}>{report.momentUnderstanding.missingContext}</span></div>
        <div style={{ marginTop: 12 }}><span style={fieldLabel}>{t('report.moment.question')}: </span><span style={bodyText}>{report.momentUnderstanding.clarifyingQuestion}</span></div>
        <div style={{ ...fieldLabel, marginTop: 12 }}>{t('report.moment.response')}</div>
        {report.momentUnderstanding.subsequentResponse
          ? <Evidence evidence={report.momentUnderstanding.subsequentResponse} audioAvailable={audioAvailable} />
          : <p style={bodyText}>{t('report.moment.noResponse')}</p>}
        <p style={{ ...bodyText, color: 'var(--ink-dim)', marginTop: 8 }}>{t('report.moment.note')}</p>
      </section>}

      {report.vagueStatements && report.vagueStatements.length > 0 && <section style={card} aria-label={t('report.vague.title')}>
        {eyebrow(t('report.vague.title'))}
        <p style={{ ...bodyText, color: 'var(--ink-dim)', marginBottom: 6 }}>{t('report.vague.intro')}</p>
        {report.vagueStatements.map((v, i) => (
          <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none', paddingTop: i > 0 ? 12 : 0, marginTop: i > 0 ? 12 : 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={fieldLabel}>{t('report.vague.doctor')}</span>
              <Badge text={t(`precision.pattern.${v.pattern}`)} color="var(--amber)" />
            </div>
            <Evidence evidence={v.evidence} audioAvailable={audioAvailable} />
            <div style={{ ...fieldLabel, marginTop: 8 }}>{t('report.vague.reply')}</div>
            {v.repReply
              ? <Evidence evidence={v.repReply} audioAvailable={audioAvailable} />
              : <p style={bodyText}>{t('report.vague.noReply')}</p>}
            <div style={{ marginTop: 8 }}><span style={fieldLabel}>{t('report.vague.question')}: </span><span style={bodyText}>{v.precisionQuestion}</span></div>
          </div>
        ))}
        <p style={{ ...bodyText, color: 'var(--ink-dim)', marginTop: 12 }}>{t('report.vague.note')}</p>
      </section>}

      <Accordion title={t('report.customerUnderstanding.title')}>
        {(['needs', 'concerns', 'decisionCriteria', 'openQuestions'] as const).map(key => (
          <div key={key}>
            <div style={{ ...fieldLabel, marginBottom: 6 }}>{t(`report.customerUnderstanding.${key}`)}</div>
            {report.customerUnderstanding[key].length === 0
              ? <p style={{ fontSize: 'max(12.5px, var(--voice-min-font, 0px))', color: 'var(--ink-dim)' }}>{t('report.noEvidence')}</p>
              : report.customerUnderstanding[key].map((item, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                    <p style={{ ...bodyText, fontSize: 'max(13px, var(--voice-min-font, 0px))' }}>{item.text}</p>
                    <Badge text={t(`report.certainty.${item.certainty}`)} color={CERTAINTY_COLOR[item.certainty]} />
                  </div>
                  {item.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
                </div>
              ))}
          </div>
        ))}
      </Accordion>

      <Accordion title={t('report.performance.title')}>
        {report.performance.map((p, i) => (
          <div key={i} style={{ borderBottom: i < report.performance.length - 1 ? '1px solid var(--line)' : 'none', paddingBottom: i < report.performance.length - 1 ? 12 : 0 }}>
            <div style={{ ...fieldLabel, color: 'var(--ink)', fontSize: 'max(12.5px, var(--voice-min-font, 0px))', marginBottom: 6 }}>{t(`report.performance.dimension.${p.dimension}`)}</div>
            <p style={{ ...bodyText, fontSize: 'max(13px, var(--voice-min-font, 0px))' }}>{p.whatHappened}</p>
            {p.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
            <p style={{ fontSize: 'max(12.5px, var(--voice-min-font, 0px))', color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 6 }}>
              <span style={fieldLabel}>{t('report.performance.whyItMattered')}: </span>{p.whyItMattered}
            </p>
            {p.improvement && (
              <p style={{ fontSize: 'max(12.5px, var(--voice-min-font, 0px))', color: 'var(--amber)', lineHeight: 1.5, marginTop: 4 }}>
                <span style={fieldLabel}>{t('report.performance.improvement')}: </span>{p.improvement}
              </p>
            )}
          </div>
        ))}
      </Accordion>

      <Accordion title={t('report.criticalMoments.title')}>
        {report.criticalMoments.map((m, i) => (
          <div key={i} style={{ borderBottom: i < report.criticalMoments.length - 1 ? '1px solid var(--line)' : 'none', paddingBottom: i < report.criticalMoments.length - 1 ? 12 : 0 }}>
            <Evidence evidence={m.evidence} audioAvailable={audioAvailable} />
            <p style={{ ...bodyText, fontSize: 'max(13px, var(--voice-min-font, 0px))' }}>{m.observedBehavior}</p>
            <p style={{ fontSize: 'max(12.5px, var(--voice-min-font, 0px))', color: 'var(--ink-dim)', lineHeight: 1.5, marginTop: 4, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Badge text={t(`report.certainty.${m.interpretationCertainty}`)} color={CERTAINTY_COLOR[m.interpretationCertainty]} />
              <span>{m.interpretation}</span>
            </p>
            {m.betterResponseExample && (
              <p style={{ fontSize: 'max(12.5px, var(--voice-min-font, 0px))', color: 'var(--amber)', lineHeight: 1.5, marginTop: 4 }}>
                <span style={fieldLabel}>{t('report.criticalMoments.better')}: </span>{m.betterResponseExample}
              </p>
            )}
          </div>
        ))}
      </Accordion>

      <Accordion title={t('report.voiceMeasurements.title')}>
        {report.voiceMeasurements.filter(m => m.available).map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <div>
              <div style={{ fontSize: 'max(13px, var(--voice-min-font, 0px))', color: 'var(--ink)' }}>{t(`report.voiceMeasurements.metric.${m.metric}`)}</div>
              <div style={{ fontSize: 'max(11.5px, var(--voice-min-font, 0px))', color: 'var(--ink-dim)', lineHeight: 1.4 }}>{m.explanation}</div>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 'max(14px, var(--voice-min-font, 0px))', color: 'var(--cyan)', whiteSpace: 'nowrap' }}>{m.value} {m.unit}</div>
          </div>
        ))}
      </Accordion>

      <Accordion title={t('report.commitments.title')}>
        {(['agreed', 'proposed', 'ai_recommended'] as const).map(status => {
          const items = report.commitments.filter(c => c.status === status)
          if (items.length === 0) return null
          return (
            <div key={status}>
              <div style={{ marginBottom: 6 }}><Badge text={t(`report.commitments.status.${status}`)} color={COMMITMENT_COLOR[status]} /></div>
              {items.map((c, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <p style={{ ...bodyText, fontSize: 'max(13px, var(--voice-min-font, 0px))' }}>
                    {c.action}{c.owner && ` — ${c.owner}`}{c.date && ` (${c.date})`}
                  </p>
                  {c.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
                </div>
              ))}
            </div>
          )
        })}
      </Accordion>

      <Accordion title={t('report.socialStyle.title')}>
        <SocialStyleCard section={report.socialStyle} />
      </Accordion>
    </div>
  )
}
