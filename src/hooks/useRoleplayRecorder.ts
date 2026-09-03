'use client'
import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { diarizeAudio, type DiarizedUtterance } from '@/lib/assemblyai-client'
import {
  buildRoleplayResult, type PitchSample, type SilencePeriod, type Utterance, type RoleplayResult,
} from '@/lib/roleplay-core'
import { XP_VALUES } from '@/lib/game-data'

export type RecorderPhase = 'idle' | 'recording' | 'processing' | 'pick-speaker' | 'done' | 'error'

export interface RawSpeakerPreview { speaker: string; sample: string }

// ── Pitch/silence capture, ported from Verbal Mirror (ssm-app's
// dev/voice-logic.js live-capture section, already shipped in
// ssm-app-v4.html) — same autocorrelation pitch detector, unchanged. ──
function autoCorrelate(bufIn: Float32Array, sampleRate: number): number {
  let buf = bufIn, SIZE = buf.length, rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return -1
  let r1 = 0, r2 = SIZE - 1
  const thres = 0.2
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < thres) { r1 = i; break } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break } }
  buf = buf.slice(r1, r2); SIZE = buf.length
  const c = new Array(SIZE).fill(0)
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i]
  let d = 0
  while (d < SIZE && c[d] > c[d + 1]) d++
  let maxval = -1, maxpos = -1
  for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i }
  let T0 = maxpos
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1]
  const a = (x1 + x3 - 2 * x2) / 2, b = (x3 - x1) / 2
  if (a) T0 = T0 - b / (2 * a)
  return sampleRate / T0
}

export function useRoleplayRecorder(doctorId: string | null, colleagueId: string | null) {
  const supabase = createClient()
  const [phase, setPhase] = useState<RecorderPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [speakerPreviews, setSpeakerPreviews] = useState<RawSpeakerPreview[]>([])
  const [result, setResult] = useState<RoleplayResult | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const pitchSamplesRef = useRef<PitchSample[]>([])
  const silencePeriodsRef = useRef<SilencePeriod[]>([])
  const startTimeRef = useRef<number>(0)
  const lastSpeechTimeRef = useRef<number | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const pitchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const utterancesRef = useRef<DiarizedUtterance[]>([])

  const start = useCallback(async () => {
    setError(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('mic')
      setPhase('error')
      return
    }
    streamRef.current = stream

    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)
    audioCtxRef.current = audioCtx
    analyserRef.current = analyser

    pitchSamplesRef.current = []
    silencePeriodsRef.current = []
    lastSpeechTimeRef.current = null
    silenceStartRef.current = null
    startTimeRef.current = Date.now()

    pitchIntervalRef.current = setInterval(() => {
      const buf = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buf)
      const f0 = autoCorrelate(buf, audioCtx.sampleRate)
      const volBuf = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(volBuf)
      const vol = volBuf.reduce((a, b) => a + b, 0) / volBuf.length
      const now = Date.now() - startTimeRef.current
      if (f0 > 60 && f0 < 600 && vol > 20) {
        pitchSamplesRef.current.push({ f0, vol, t: now })
        if (silenceStartRef.current !== null) {
          silencePeriodsRef.current.push({ start: silenceStartRef.current, end: now })
          silenceStartRef.current = null
        }
        lastSpeechTimeRef.current = now
      } else if (vol < 15 && lastSpeechTimeRef.current !== null && silenceStartRef.current === null) {
        silenceStartRef.current = now
      }
    }, 100)

    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startTimeRef.current) / 1000))
    }, 500)

    chunksRef.current = []
    const mediaRec = new MediaRecorder(stream)
    mediaRec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mediaRec.start()
    mediaRecRef.current = mediaRec

    setPhase('recording')
  }, [])

  const cleanupCapture = useCallback(() => {
    if (pitchIntervalRef.current) { clearInterval(pitchIntervalRef.current); pitchIntervalRef.current = null }
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    analyserRef.current = null
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  const stop = useCallback(async () => {
    const mediaRec = mediaRecRef.current
    if (!mediaRec) return
    if (silenceStartRef.current !== null && lastSpeechTimeRef.current !== null) {
      silencePeriodsRef.current.push({ start: silenceStartRef.current, end: Date.now() - startTimeRef.current })
    }
    cleanupCapture()
    setPhase('processing')

    const blob: Blob = await new Promise(resolve => {
      mediaRec.onstop = () => resolve(new Blob(chunksRef.current, { type: mediaRec.mimeType || 'audio/webm' }))
      mediaRec.stop()
    })

    try {
      const utterances = await diarizeAudio(blob)
      utterancesRef.current = utterances
      const speakers = Array.from(new Set(utterances.map(u => u.speaker)))
      if (speakers.length < 2) {
        setError('diarize')
        setPhase('error')
        return
      }
      setSpeakerPreviews(speakers.map(speaker => ({
        speaker,
        sample: utterances.find(u => u.speaker === speaker)?.text ?? '',
      })))
      setPhase('pick-speaker')
    } catch {
      setError('diarize')
      setPhase('error')
    }
  }, [cleanupCapture])

  const pickSpeaker = useCallback(async (repSpeaker: string) => {
    const utterances: Utterance[] = utterancesRef.current.map(u => ({
      speaker: u.speaker, text: u.text, start: u.start, end: u.end,
    }))
    const built = buildRoleplayResult(utterances, repSpeaker, pitchSamplesRef.current, silencePeriodsRef.current)
    setResult(built)

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error: insertError } = await supabase.from('roleplay_sessions').insert({
        rep_id: user.id,
        doctor_id: doctorId,
        colleague_id: colleagueId,
        duration_sec: Math.round(built.durationSec),
        talk_ratio: built.talkRatio.repRatio,
        rapid_turn_switches: built.rapidTurnSwitches,
        question_ratio: built.questionRatio,
        open_question_ratio: built.openQuestionRatio,
        paraphrase_score: built.paraphraseScore,
        active_listening_score: built.activeListening.score,
        rep_style: built.repRead?.style ?? null,
        rep_confidence: built.repRead?.confidence ?? null,
        rep_metrics: built.repRead ?? null,
      })
      if (insertError) {
        console.error('roleplay_sessions insert failed:', insertError.message)
      } else {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('xp').eq('id', user.id).single()
        if (profileError) {
          console.error('profile xp read failed:', profileError.message)
        } else if (profile) {
          const { error: xpError } = await supabase.from('profiles').update({ xp: profile.xp + XP_VALUES.roleplayComplete }).eq('id', user.id)
          if (xpError) console.error('profile xp update failed:', xpError.message)
        }
      }
    }

    setPhase('done')
  }, [doctorId, colleagueId, supabase])

  const reset = useCallback(() => {
    cleanupCapture()
    utterancesRef.current = []
    setSpeakerPreviews([])
    setResult(null)
    setError(null)
    setElapsedSec(0)
    setPhase('idle')
  }, [cleanupCapture])

  return { phase, error, elapsedSec, speakerPreviews, result, start, stop, pickSpeaker, reset }
}
