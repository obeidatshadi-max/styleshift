'use client'
import { useT } from '@/lib/i18n'
import type { ConversationReport as ReportType, EvidenceRef } from '@/schemas/conversationReport'

function Evidence({ evidence, audioAvailable }: { evidence: EvidenceRef; audioAvailable: boolean }) {
  return (
    <blockquote dir="auto" style={{ margin: '4px 0', paddingInlineStart: 12, borderInlineStart: '2px solid #ccc' }}>
      "{evidence.quote}" <span style={{ opacity: 0.6 }}>({evidence.speakerRole})</span>
      {audioAvailable && <button type="button" aria-label="play">▶</button>}
    </blockquote>
  )
}

export function ConversationReport({ report, outdated, audioAvailable = false }: {
  report: ReportType; outdated: boolean; audioAvailable?: boolean
}) {
  const t = useT()
  return (
    <div dir="auto" style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      {outdated && (
        <div data-testid="report-outdated-banner" role="status" style={{ background: '#fff3cd', padding: 8, marginBottom: 12 }}>
          {t('report.outdated')}
        </div>
      )}

      <section>
        <h2>{t('report.visitSummary.title')}</h2>
        <p>{report.visitSummary.summary}</p>
        <p>
          {t('report.visitSummary.objective')}: {report.visitSummary.objective ?? t('report.visitSummary.noObjective')}
        </p>
        <p>{t(`report.objectiveStatus.${report.visitSummary.objectiveStatus}`)} — {report.visitSummary.objectiveStatusReason}</p>
      </section>

      <details>
        <summary>{t('report.customerUnderstanding.title')}</summary>
        {(['needs', 'concerns', 'decisionCriteria', 'openQuestions'] as const).map(key => (
          <div key={key}>
            <h4>{t(`report.customerUnderstanding.${key}`)}</h4>
            {report.customerUnderstanding[key].length === 0
              ? <p>{t('report.noEvidence')}</p>
              : report.customerUnderstanding[key].map((item, i) => (
                <div key={i}>
                  <p>{item.text} <em>({t(`report.certainty.${item.certainty}`)})</em></p>
                  {item.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
                </div>
              ))}
          </div>
        ))}
      </details>

      <details>
        <summary>{t('report.performance.title')}</summary>
        {report.performance.map((p, i) => (
          <div key={i}>
            <h4>{t(`report.performance.dimension.${p.dimension}`)}</h4>
            <p>{p.whatHappened}</p>
            {p.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
            <p><strong>{t('report.performance.whyItMattered')}:</strong> {p.whyItMattered}</p>
            {p.improvement && <p><strong>{t('report.performance.improvement')}:</strong> {p.improvement}</p>}
          </div>
        ))}
      </details>

      <details>
        <summary>{t('report.criticalMoments.title')}</summary>
        {report.criticalMoments.map((m, i) => (
          <div key={i}>
            <Evidence evidence={m.evidence} audioAvailable={audioAvailable} />
            <p>{m.observedBehavior}</p>
            <p><em>{t(`report.certainty.${m.interpretationCertainty}`)}:</em> {m.interpretation}</p>
            {m.betterResponseExample && <p><strong>{t('report.criticalMoments.better')}:</strong> {m.betterResponseExample}</p>}
          </div>
        ))}
      </details>

      <details>
        <summary>{t('report.commitments.title')}</summary>
        {(['agreed', 'proposed', 'ai_recommended'] as const).map(status => (
          <div key={status}>
            <h4>{t(`report.commitments.status.${status}`)}</h4>
            {report.commitments.filter(c => c.status === status).map((c, i) => (
              <div key={i}>
                <p>{c.action} {c.owner && `— ${c.owner}`} {c.date && `(${c.date})`}</p>
                {c.evidence.map((e, j) => <Evidence key={j} evidence={e} audioAvailable={audioAvailable} />)}
              </div>
            ))}
          </div>
        ))}
      </details>

      <section>
        <h2>{t('report.coachingPriority.title')}</h2>
        <p>{report.coachingPriority.behavior}</p>
        {report.coachingPriority.evidence.map((e, i) => <Evidence key={i} evidence={e} audioAvailable={audioAvailable} />)}
        <p><strong>{t('report.coachingPriority.betterPhrase')}:</strong> {report.coachingPriority.betterPhrase}</p>
        <p><strong>{t('report.coachingPriority.practice')}:</strong> {report.coachingPriority.practiceExercise}</p>
        <p><strong>{t('report.coachingPriority.success')}:</strong> {report.coachingPriority.successLooksLike}</p>
        <p><strong>{t('report.strength.title')}:</strong> {report.strength.behavior}</p>
      </section>

      <details>
        <summary>{t('report.socialStyle.title')}</summary>
        {report.socialStyle.coachingCard ? (
          <div>
            <p><strong>{t('report.socialStyle.observedSignals')}:</strong> {report.socialStyle.coachingCard.observedSignals}</p>
            <p><strong>{t('report.socialStyle.possiblePreference')}:</strong> {report.socialStyle.coachingCard.possiblePreference}</p>
            <p><strong>{t('report.socialStyle.evidenceAndAlternative')}:</strong> {report.socialStyle.coachingCard.evidenceAndAlternative}</p>
            <p><strong>{t('report.socialStyle.repResponse')}:</strong> {report.socialStyle.coachingCard.repResponse}</p>
            <p><strong>{t('report.socialStyle.adjustment')}:</strong> {report.socialStyle.coachingCard.mostUsefulAdjustment}</p>
            <p><strong>{t('report.socialStyle.wording')}:</strong> {report.socialStyle.coachingCard.suggestedWordingNextVisit}</p>
          </div>
        ) : <p>{t('report.socialStyle.insufficientEvidence')}</p>}
        {report.socialStyle.customer.isSimulationSetting && <p style={{ opacity: 0.7 }}>{t('report.socialStyle.simulationNote')}</p>}
        {report.socialStyle.customer.profileDrift && <p style={{ color: '#b45309' }}>{t('report.socialStyle.profileDrift')}</p>}
      </details>
    </div>
  )
}
