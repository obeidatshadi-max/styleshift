import { createClient } from '@/lib/supabase-browser'

const PROXY_URL = '/.netlify/functions/assemblyai-proxy'
// Base64 expands bytes by 4/3; keep JSON below Netlify's request limit.
export const MAX_ROLEPLAY_AUDIO_BYTES = 4 * 1024 * 1024
export type DiarizationErrorCode = 'session' | 'timeout' | 'too_large' | 'diarize'
export class DiarizationError extends Error {
  constructor(public code: DiarizationErrorCode, message: string) { super(message) }
}
export interface DiarizedWord { text: string; speaker: string; start: number; end: number }
export interface DiarizedUtterance { speaker: string; text: string; start: number; end: number; words: DiarizedWord[] }
export interface DiarizationJob { uploadUrl?: string; transcriptId?: string }
interface TranscriptStatus {
  status: 'queued' | 'processing' | 'completed' | 'error'
  utterances?: DiarizedUtterance[]
  error?: string
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new DiarizationError('diarize', 'Could not read the recording.'))
    reader.readAsDataURL(blob)
  })
}

async function request<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const { data: { session } } = await createClient().auth.getSession()
  if (!session) throw new DiarizationError('session', 'Not signed in.')
  signal?.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 60_000)
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
    if (res.redirected || res.status === 401 || res.status === 403) {
      throw new DiarizationError('session', 'Not signed in.')
    }
    if (res.status === 413) throw new DiarizationError('too_large', 'Recording is too large to upload.')
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) throw new DiarizationError('diarize', data?.error || 'Analysis request failed.')
    return data as T
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new DiarizationError('timeout', 'Analysis request timed out.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

/** Retain job between retries so slow polling resumes without another paid upload/job. */
export async function diarizeAudio(blob: Blob, job: DiarizationJob = {}, signal?: AbortSignal): Promise<DiarizedUtterance[]> {
  if (!blob.size) throw new DiarizationError('diarize', 'The recording is empty.')
  if (blob.size > MAX_ROLEPLAY_AUDIO_BYTES) throw new DiarizationError('too_large', 'Recording is too large to upload.')
  if (!job.transcriptId && !job.uploadUrl) {
    const data = await request<{ upload_url?: string }>({ action: 'upload', audio: await blobToBase64(blob) }, signal)
    if (!data.upload_url) throw new DiarizationError('diarize', 'Upload returned no audio URL.')
    job.uploadUrl = data.upload_url
  }
  if (!job.transcriptId) {
    const data = await request<{ id?: string }>({ action: 'submit', audio_url: job.uploadUrl }, signal)
    if (!data.id) throw new DiarizationError('diarize', 'Analysis returned no job ID.')
    job.transcriptId = data.id
  }
  const deadline = Date.now() + 5 * 60_000
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    const result = await request<TranscriptStatus>({ action: 'poll', transcript_id: job.transcriptId }, signal)
    if (result.status === 'completed') {
      if (!Array.isArray(result.utterances)) throw new DiarizationError('diarize', 'Analysis returned no speaker data.')
      return result.utterances
    }
    if (result.status === 'error') {
      delete job.transcriptId
      throw new DiarizationError('diarize', result.error || 'Diarization failed')
    }
    if (result.status !== 'queued' && result.status !== 'processing') {
      throw new DiarizationError('diarize', 'Unexpected analysis response.')
    }
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw new DiarizationError('timeout', 'Analysis is still processing. Retry to resume.')
}
