import { createEmptySession } from '@/schemas/session/factory'
import type { LearningObjective, SessionStatus, StyleShiftSession } from '@/schemas/session'
import type { SessionReport } from '@/schemas/report'
import { scoreSession } from '@/scoring/engine'
import { DEFAULT_DIFFICULTY, pickObjectionType, type Difficulty, type ObjectionType } from '@/lib/voice-partner-core'
import { applyAgentPatch } from './patch'
import { assembleReport } from './report'
import type {
  AnalystPort, CoachPort, DoctorPort, OrchestratorError, PersonaLoader, Phase, Result,
  Scorer, SessionRecord, SessionStore, Step,
} from './types'

export interface OrchestratorDeps {
  store: SessionStore
  personas: PersonaLoader
  doctor: DoctorPort
  analyst: AnalystPort
  coach: CoachPort
  /** Deterministic scoring; defaults to the configurable rules engine. */
  scorer?: Scorer
  now?: () => Date
  newId?: () => string
  pickObjection?: () => ObjectionType
}

export interface OrchestratorOptions {
  /** Hard cap on rep messages per simulation, to bound model cost. */
  maxRepTurns?: number
}

export interface StartInput {
  repId: string
  doctorId: string
  lang?: 'en' | 'ar'
  difficulty?: Difficulty
  objectionType?: ObjectionType
  learningObjectives?: LearningObjective[]
}

export type EndOutcome = Extract<SessionStatus, 'won' | 'escalated' | 'abandoned'>

const fail = (error: OrchestratorError, detail?: string): { ok: false; error: OrchestratorError; detail?: string } =>
  ({ ok: false, error, ...(detail ? { detail } : {}) })

/**
 * Runs the StyleShift workflow and nothing else:
 *   start -> (sendMessage)* -> endSimulation -> analyze -> score -> coach -> report
 *
 * It owns sequencing, ownership checks, persistence, and merging results. It
 * does NOT role-play, observe behavior, calculate scores, or write coaching —
 * each of those is done by the injected agent/scorer, and every result is
 * merged only into the section that specialist owns (see patch.ts).
 *
 * A failed step leaves the phase unchanged, so calling the same method again
 * resumes from where it stopped.
 */
export function createOrchestrator(deps: OrchestratorDeps, options: OrchestratorOptions = {}) {
  const maxRepTurns = options.maxRepTurns ?? 20
  const now = deps.now ?? (() => new Date())
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const scorer: Scorer = deps.scorer ?? ((obs, difficulty) => scoreSession(obs, difficulty))
  const pickObjection = deps.pickObjection ?? (() => pickObjectionType())

  const log = (r: SessionRecord, step: Step, ok: boolean, detail?: string) => {
    r.trace.push({ step, at: now().toISOString(), ok, ...(detail ? { detail } : {}) })
  }

  async function persist(record: SessionRecord): Promise<boolean> {
    try { await deps.store.save(record); return true } catch { return false }
  }

  /** Loads a record and checks it belongs to the caller. */
  async function open(sessionId: string, repId: string): Promise<Result<{ record: SessionRecord }>> {
    let record: SessionRecord | null
    try { record = await deps.store.get(sessionId) } catch { return fail('store_failed') }
    if (!record) return fail('not_found')
    if (record.session.rep.repId !== repId) return fail('forbidden')
    return { ok: true, record }
  }

  const repTurnCount = (s: StyleShiftSession) => s.transcript.filter(t => t.role === 'rep').length
  const lastDoctorLine = (s: StyleShiftSession) => [...s.transcript].reverse().find(t => t.role === 'doctor')?.text ?? ''

  // ── START: create session -> load persona -> doctor opens -> store ──
  async function start(input: StartInput): Promise<Result<{ sessionId: string; doctorText: string }>> {
    const difficulty = input.difficulty ?? DEFAULT_DIFFICULTY
    const sessionId = newId()
    const trace: SessionRecord['trace'] = []
    const record: SessionRecord = { session: createEmptySession(sessionId, input.repId), phase: 'in_roleplay', trace, report: null }
    log(record, 'create_session', true)

    const persona = await deps.personas.load(input.repId, input.doctorId, { difficulty })
    if (!persona) return fail('persona_not_found')
    log(record, 'load_persona', true)

    let session: StyleShiftSession = {
      ...record.session, ...persona,
      lang: input.lang ?? 'en', difficulty, startedAt: now().toISOString(),
      objections: { ...persona.objections, activeType: input.objectionType ?? persona.objections.activeType ?? pickObjection() },
      learningObjectives: input.learningObjectives ?? [],
    }

    const opening = await deps.doctor.respond(session, { repText: null })
    if (!opening) return fail('doctor_unavailable')
    session = applyAgentPatch('doctor', session, opening.patch)
    log(record, 'doctor_open', true)

    record.session = session
    // Nothing is stored until the doctor has actually opened, so a failed start
    // leaves no half-created session behind.
    if (!(await persist(record))) return fail('store_failed')
    return { ok: true, sessionId, doctorText: opening.reply }
  }

  // ── ROLE-PLAY: rep speaks -> doctor replies -> store transcript ──
  async function sendMessage(sessionId: string, repId: string, repText: string): Promise<Result<{ doctorText: string; repTurns: number }>> {
    const opened = await open(sessionId, repId)
    if (!opened.ok) return opened
    const { record } = opened
    if (record.phase !== 'in_roleplay') return fail('wrong_phase', record.phase)

    const text = repText.trim()
    if (!text) return fail('empty_message')
    if (repTurnCount(record.session) >= maxRepTurns) return fail('turn_limit')

    const reply = await deps.doctor.respond(record.session, { repText: text })
    if (!reply) return fail('doctor_unavailable')

    record.session = applyAgentPatch('doctor', record.session, reply.patch)
    log(record, 'doctor_reply', true)
    if (!(await persist(record))) return fail('store_failed')
    return { ok: true, doctorText: lastDoctorLine(record.session), repTurns: repTurnCount(record.session) }
  }

  // ── END SIMULATION -> analyze -> score -> coach -> report ──
  async function endSimulation(
    sessionId: string, repId: string, opts: { outcome?: EndOutcome } = {},
  ): Promise<Result<{ report: SessionReport; phase: Phase }>> {
    const opened = await open(sessionId, repId)
    if (!opened.ok) return opened
    const { record } = opened

    // Already finished: return the stored report without re-running anything.
    if (record.phase === 'reported' && record.report) return { ok: true, report: record.report, phase: record.phase }

    if (record.phase === 'in_roleplay') {
      record.session = { ...record.session, status: opts.outcome ?? 'abandoned', endedAt: now().toISOString() }
      record.phase = 'ended'
      log(record, 'end_simulation', true)
      if (!(await persist(record))) return fail('store_failed')
    }

    // Behavior Analyst: transcript -> observations.
    if (record.phase === 'ended') {
      const analysis = await deps.analyst.analyze(record.session)
      if ('error' in analysis) {
        log(record, 'analyze', false, analysis.error)
        await persist(record)
        return analysis.error === 'no_rep_turns' ? fail('no_rep_turns') : fail('analysis_failed', analysis.error)
      }
      record.session = applyAgentPatch('behaviorAnalyst', record.session, { observations: analysis.observations })
      record.phase = 'analyzed'
      log(record, 'analyze', true)
      if (!(await persist(record))) return fail('store_failed')
    }

    // Deterministic scoring: observations -> scores. No model involved.
    if (record.phase === 'analyzed') {
      const scores = scorer(record.session.observations, record.session.difficulty)
      record.session = applyAgentPatch('scoring', record.session, { scores })
      record.phase = 'scored'
      log(record, 'score', true, `config ${scores.configVersion}`)
      if (!(await persist(record))) return fail('store_failed')
    }

    // Coach: observations + scores + persona + objectives -> coaching.
    // Coaching is the only step allowed to degrade: the rep still gets the
    // report (transcript, observations, scores); calling endSimulation again
    // retries coaching because the phase stays 'scored'.
    const warnings: string[] = []
    let coachingStatus: SessionReport['coachingStatus'] = 'ready'
    const coaching = await deps.coach.coach(record.session)
    if ('error' in coaching) {
      if (coaching.error === 'nothing_to_coach') {
        coachingStatus = 'nothing_to_coach'
        log(record, 'coach', true, 'nothing_to_coach')
      } else {
        coachingStatus = 'unavailable'
        warnings.push(`coaching_unavailable:${coaching.error}`)
        log(record, 'coach', false, coaching.error)
      }
    } else {
      record.session = applyAgentPatch('coach', record.session, { coaching: coaching.coaching })
      log(record, 'coach', true)
    }

    const report = assembleReport(record.session, coachingStatus, warnings, now())
    record.report = report
    if (coachingStatus !== 'unavailable') record.phase = 'reported'
    log(record, 'report', true)
    if (!(await persist(record))) return fail('store_failed')
    return { ok: true, report, phase: record.phase }
  }

  async function getReport(sessionId: string, repId: string): Promise<Result<{ report: SessionReport }>> {
    const opened = await open(sessionId, repId)
    if (!opened.ok) return opened
    return opened.record.report ? { ok: true, report: opened.record.report } : fail('wrong_phase', opened.record.phase)
  }

  return { start, sendMessage, endSimulation, getReport }
}

export type StyleShiftOrchestrator = ReturnType<typeof createOrchestrator>
