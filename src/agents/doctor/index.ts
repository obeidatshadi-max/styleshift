import type { Agent } from '@/agents/types'
import { createAnthropicComplete, type CompleteFn } from '@/agents/llm'
import type { SessionPatch, StyleShiftSession, TranscriptTurn } from '@/schemas/session'
import type { PhysicianState } from '@/lib/voice-partner-core'
import { analyzeRepTurn, nextPhysicianState } from './behavior'
import { buildDoctorOpeningPrompt, buildDoctorReplyPrompt, DOCTOR_SYSTEM } from './prompt'

/** `repText: null` means the rep has not spoken yet -> the doctor opens. */
export interface DoctorInput { repText: string | null }

// Neutral fallback when a session carries no state yet.
const DEFAULT_STATE: PhysicianState = { trust: 50, skepticism: 50, engagement: 50, timePressure: 30 }

export const MAX_REP_CHARS = 2000

/** Keeps only the doctor's spoken words: strips a leading "Doctor:" label,
 * code fences and wrapping quotes the model sometimes adds despite the prompt. */
export function cleanDoctorReply(raw: string): string {
  let t = raw.trim().replace(/^```[a-z]*\n?|```$/gi, '').trim()
  t = t.replace(/^(doctor|dr\.?|الدكتور|دكتور)\s*[:：]\s*/i, '')
  t = t.replace(/^["“”«]+|["“”»]+$/g, '').trim()
  return t
}

function currentState(session: StyleShiftSession): PhysicianState {
  for (let i = session.transcript.length - 1; i >= 0; i--) {
    const s = session.transcript[i].state
    if (s) return s
  }
  return session.physician.initialState ?? DEFAULT_STATE
}

export interface DoctorReply { reply: string; state: PhysicianState; patch: SessionPatch }

export function createDoctorAgent(complete: CompleteFn) {
  /** Returns null when the model call fails or yields nothing usable. */
  async function respond(session: Readonly<StyleShiftSession>, input: DoctorInput): Promise<DoctorReply | null> {
    const base = currentState(session as StyleShiftSession)
    const now = new Date().toISOString()
    const nextIndex = session.transcript.length
    const repText = input.repText?.trim() ?? ''
    if (repText.length > MAX_REP_CHARS) return null

    let state = base
    let prompt: string
    const newTurns: TranscriptTurn[] = []

    if (input.repText === null) {
      prompt = buildDoctorOpeningPrompt(session as StyleShiftSession, base)
    } else {
      if (!repText) return null
      const shape = analyzeRepTurn(repText)
      state = nextPhysicianState(base, shape)
      prompt = buildDoctorReplyPrompt(session as StyleShiftSession, repText, shape, state)
      newTurns.push({
        turnIndex: nextIndex, role: 'rep', text: repText, objectionType: session.objections.activeType,
        clearStepsHit: [], state, vocalFeedback: null, createdAt: now,
      })
    }

    const raw = await complete({ system: DOCTOR_SYSTEM, prompt, maxTokens: 300 })
    const reply = raw ? cleanDoctorReply(raw) : ''
    if (!reply) return null

    newTurns.push({
      turnIndex: nextIndex + newTurns.length, role: 'doctor', text: reply, objectionType: session.objections.activeType,
      clearStepsHit: [], state, vocalFeedback: null, createdAt: now,
    })
    return { reply, state, patch: { transcript: [...session.transcript, ...newTurns] } }
  }

  const agent: Agent<DoctorInput> = {
    name: 'doctor',
    async run(session, input) {
      const out = await respond(session, input)
      if (!out) throw new Error('doctor_unavailable')
      return out.patch
    },
  }
  return { agent, respond }
}

/** Default instance backed by the Anthropic key; null when it is not configured. */
export function createDefaultDoctorAgent() {
  const key = process.env.ANTHROPIC_API_KEY
  return key ? createDoctorAgent(createAnthropicComplete(key)) : null
}
