'use client'
import { useT } from '@/lib/i18n'
import type { SocialStyleSection, SocialStyleRead, AdaptationFinding } from '@/schemas/conversationReport'

const fieldLabel: React.CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)' }
const bodyText: React.CSSProperties = { fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', margin: 0 }
const note: React.CSSProperties = { fontSize: 12, lineHeight: 1.5, color: 'var(--ink-dim)', margin: '4px 0 0' }

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

export function SocialStyleCard({ section }: { section: SocialStyleSection }) {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <StyleRead read={section.customer} />
      <StyleRead read={section.rep} />

      {section.adaptation.length > 0 && (
        <div>
          <div style={{ ...fieldLabel, marginBottom: 6 }}>{t('report.socialStyle.adaptation')}</div>
          {section.adaptation.map((a, i) => (
            <p key={i} style={{ ...bodyText, display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.03em', border: `1px solid ${ASSESSMENT_COLOR[a.assessment]}`, color: ASSESSMENT_COLOR[a.assessment], borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
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
