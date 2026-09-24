'use client'
import { useT } from '@/lib/i18n'
import type { SocialStyleSection, SocialStyleRead } from '@/schemas/conversationReport'

function StyleRead({ read }: { read: SocialStyleRead }) {
  const t = useT()
  return (
    <div>
      <p>
        <strong>{t(`report.socialStyle.subject.${read.subject}`)}:</strong>{' '}
        {read.possibleStyle ? t(`report.socialStyle.style.${read.possibleStyle}`) : t('report.socialStyle.insufficientEvidence')}
        {read.isSimulationSetting && <span style={{ opacity: 0.6 }}> ({t('report.socialStyle.configuredNotDiscovered')})</span>}
      </p>
      {read.mixedEvidenceNote && <p style={{ opacity: 0.8 }}>{read.mixedEvidenceNote}</p>}
      {read.alternativeExplanation && <p style={{ opacity: 0.8 }}>{t('report.socialStyle.alternative')}: {read.alternativeExplanation}</p>}
      {read.profileDrift && (
        <p data-testid="social-style-drift" style={{ color: '#b45309' }}>
          {t('report.socialStyle.driftFrom')} {read.savedProfile ? t(`report.socialStyle.style.${read.savedProfile}`) : ''}
        </p>
      )}
    </div>
  )
}

export function SocialStyleCard({ section }: { section: SocialStyleSection }) {
  const t = useT()
  return (
    <div>
      <StyleRead read={section.customer} />
      <StyleRead read={section.rep} />
      {section.adaptation.length > 0 && (
        <div>
          <h4>{t('report.socialStyle.adaptation')}</h4>
          {section.adaptation.map((a, i) => (
            <p key={i}>{t(`report.socialStyle.assessment.${a.assessment}`)} — {a.suggestedAdjustment}</p>
          ))}
        </div>
      )}
      {section.coachingCard && (
        <div>
          <p><strong>{t('report.socialStyle.observedSignals')}:</strong> {section.coachingCard.observedSignals}</p>
          <p><strong>{t('report.socialStyle.possiblePreference')}:</strong> {section.coachingCard.possiblePreference}</p>
          <p><strong>{t('report.socialStyle.evidenceAndAlternative')}:</strong> {section.coachingCard.evidenceAndAlternative}</p>
          <p><strong>{t('report.socialStyle.repResponse')}:</strong> {section.coachingCard.repResponse}</p>
          <p><strong>{t('report.socialStyle.adjustment')}:</strong> {section.coachingCard.mostUsefulAdjustment}</p>
          <p><strong>{t('report.socialStyle.wording')}:</strong> {section.coachingCard.suggestedWordingNextVisit}</p>
        </div>
      )}
    </div>
  )
}
