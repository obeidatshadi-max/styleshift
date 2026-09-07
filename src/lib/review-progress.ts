export type ProgressStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete'

export type ProgressItem = {
  id: string
  priority: 'P0' | 'P1' | 'P2'
  area: string
  action: string
  status: ProgressStatus
  progress: number
  note: string
}

export const REVIEW_SLUG = 'styleshift-product-review-2026'

export const DEFAULT_PROGRESS_ITEMS: ProgressItem[] = [
  { id:'voice-analytics', priority:'P0', area:'AI Partner', action:'Add manager voice analytics to Team Pulse, reports, and rep detail.', status:'not_started', progress:0, note:'' },
  { id:'voice-instrumentation', priority:'P0', area:'Measurement', action:'Track the voice funnel, errors, and STT/LLM/TTS latency.', status:'not_started', progress:0, note:'' },
  { id:'voice-errors', priority:'P0', area:'Voice UX', action:'Create specific mic, network, STT, model, TTS, rate-limit, and playback recovery states.', status:'not_started', progress:0, note:'' },
  { id:'design-system', priority:'P1', area:'UI system', action:'Extract reusable shell, card, field, button, tab, feedback, and focus primitives.', status:'not_started', progress:0, note:'' },
  { id:'responsive-dashboard', priority:'P1', area:'Responsive', action:'Fix KPI reflow, table overflow, and compact navigation.', status:'not_started', progress:0, note:'' },
  { id:'recording-confidence', priority:'P1', area:'Voice UX', action:'Add a timer, audio level, playback, rerecord, and transcript correction.', status:'not_started', progress:0, note:'' },
  { id:'opening-duration', priority:'P1', area:'Measurement', action:'Measure opening-statement duration directly.', status:'not_started', progress:0, note:'' },
  { id:'arabic-qa', priority:'P1', area:'Arabic QA', action:'Test Iraqi accents, noise, short/long speech, and medical terminology.', status:'not_started', progress:0, note:'' },
  { id:'question-drill', priority:'P2', area:'AI Partner', action:'Implement the documented Forbidden/Effective Questions drill.', status:'not_started', progress:0, note:'' },
  { id:'accessibility', priority:'P2', area:'Accessibility', action:'Verify keyboard, screen reader, 200% zoom, reduced motion, and real devices.', status:'not_started', progress:0, note:'' },
]

export const STATUS_LABEL: Record<ProgressStatus,string> = {
  not_started:'Not started', in_progress:'In progress', blocked:'Blocked', complete:'Complete'
}
