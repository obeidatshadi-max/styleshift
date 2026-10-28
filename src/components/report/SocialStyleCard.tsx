'use client'
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { SOCIAL_STYLES, type SocialStyle, type SocialStyleSection, type SocialStyleRead, type AdaptationFinding } from '@/schemas/conversationReport'
import { compareSelfToObserved } from '@/lib/self-vs-observed'

const fieldLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 'max(10.5px, var(--voice-min-font, 0px))', letterSpacing: 'normal', textTransform: 'none', color: 'var(--ink-dim)' }
const bodyText: React.CSSProperties = { fontSize: 'max(13px, var(--voice-min-font, 0px))', lineHeight: 1.55, color: 'var(--ink)', margin: 0 }
const note: React.CSSProperties = { fontSize: 'max(12px, var(--voice-min-font, 0px))', lineHeight: 1.5, color: 'var(--ink-dim)', margin: '4px 0 0' }

const ASSESSMENT_COLOR: Record<AdaptationFinding['assessment'], string> = {
  well_adapted: 'var(--green)', mismatched: 'var(--red)', insufficient_evidence: 'var(--ink-dim)',
}

function StyleRead({ read }: { read: SocialStyleRead }) {
  const t = useT()
  return (
    <div>
      <div style={fieldLabel}>{t(`report.socialStyle.subject.${read.subject}`)}</div>
      <p style={{ ...bodyText, marginTop: 4 }}>
        {read.possibleStyle ? t(`report.socialStyle.style.${read.possibleStyle}`) : t('report.socialStyle.insufficientEvidence')}
        {read.isSimulationSetting && <span style={{ color: 'var(--ink-dim)' }}> ({t('report.socialStyle.configuredNotDiscovered')})</span>}
      </p>
      {read.mixedEvidenceNote && <p style={note}>{read.mixedEvidenceNote}</p>}
      {read.alternativeExplanation && <p style={note}>{t('report.socialStyle.alternative')}: {read.alternativeExplanation}</p>}
      {read.profileDrift && (
        <p data-testid="social-style-drift" style={{ ...note, color: 'var(--amber)' }}>
          {t('report.socialStyle.driftFrom')} {read.savedProfile ? t(`report.socialStyle.style.${read.savedProfile}`) : ''}
        </p>
      )}
    </div>
  )
}

/** Commit-before-reveal: the rep picks the style they think they used, then sees the transcript-based read. */
function RepStyleRead({ read }: { read: SocialStyleRead }) {
  const t = useT()
  const [choice, setChoice] = useState<SocialStyle | 'skipped' | null>(null)
  // Nothing observed means nothing to compare, so show the read as before.
  if (read.possibleStyle === null) return <StyleRead read={read} />
  if (choice === null) {
    return (
      <div data-testid="self-check-prompt">
        <div style={fieldLabel}>{t('report.socialStyle.subject.rep')}</div>
        <p style={{ ...bodyText, marginTop: 4 }}>{t('report.selfCheck.prompt')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {SOCIAL_STYLES.map(s => (
            <button key={s} type="button" onClick={() => setChoice(s)}
              style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 12px', background: 'var(--panel)', color: 'var(--ink)', cursor: 'pointer', fontSize: 'max(13px, var(--voice-min-font, 0px))' }}>
              {t(`report.socialStyle.style.${s}`)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setChoice('skipped')}
          style={{ ...note, marginTop: 8, background: 'none', border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer' }}>
          {t('report.selfCheck.skip')}
        </button>
      </div>
    )
  }
  const outcome = choice === 'skipped' ? null : compareSelfToObserved(choice, read.possibleStyle)
  return (
    <div>
      <StyleRead read={read} />
      {choice !== 'skipped' && outcome !== null && outcome !== 'no_observation' && (
        <div data-testid="self-check-result" style={{ marginTop: 8 }}>
          <p style={bodyText}>
            {outcome === 'match'
              ? t('report.selfCheck.match')
              : t('report.selfCheck.differs', { self: t(`report.socialStyle.style.${choice}`), observed: t(`report.socialStyle.style.${read.possibleStyle}`) })}
          </p>
          <p style={note}>{t('report.selfCheck.note')}</p>
        </div>
      )}
    </div>
  )
}

export function SocialStyleCard({ section }: { section: SocialStyleSection }) {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <StyleRead read={section.customer} />
      <RepStyleRead read={section.rep} />

      {section.adaptation.length > 0 && (
        <div>
          <div style={{ ...fieldLabel, marginBottom: 6 }}>{t('report.socialStyle.adaptation')}</div>
          {section.adaptation.map((a, i) => (
            <p key={i} style={{ ...bodyText, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 'max(10.5px, var(--voice-min-font, 0px))', letterSpacing: 'normal', border: `1px solid ${ASSESSMENT_COLOR[a.assessment]}`, color: ASSESSMENT_COLOR[a.assessment], borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                {t(`report.socialStyle.assessment.${a.assessment}`)}
              </span>
              {a.suggestedAdjustment}
            </p>
          ))}
        </div>
      )}

      {section.coachingCard && (
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div><span style={fieldLabel}>{t('report.socialStyle.observedSignals')}: </span><span style={bodyText}>{section.coachingCard.observedSignals}</span></div>
          <div><span style={fieldLabel}>{t('report.socialStyle.possiblePreference')}: </span><span style={bodyText}>{section.coachingCard.possiblePreference}</span></div>
          <div><span style={fieldLabel}>{t('report.socialStyle.evidenceAndAlternative')}: </span><span style={bodyText}>{section.coachingCard.evidenceAndAlternative}</span></div>
          <div><span style={fieldLabel}>{t('report.socialStyle.repResponse')}: </span><span style={bodyText}>{section.coachingCard.repResponse}</span></div>
          <div><span style={fieldLabel}>{t('report.socialStyle.adjustment')}: </span><span style={bodyText}>{section.coachingCard.mostUsefulAdjustment}</span></div>
          <div><span style={fieldLabel}>{t('report.socialStyle.wording')}: </span><span style={bodyText}>{section.coachingCard.suggestedWordingNextVisit}</span></div>
        </div>
      )}
    </div>
  )
}
