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

const DISCARD_WAIT_MS = 5_000
const DELETE_ATTEMPTS_NOW = 2
const PENDING_KEY = 'styleshift.pendingRemoteDeletes'
const MAX_PENDING = 50
/** After this many unconfirmed tries in total, stop and leave it to the provider's own retention limits. */
const MAX_TOTAL_TRIES = 4

/**
 * Deletion at the provider has three different states, and only the second is ever claimed:
 *  - attempted: we sent the request (says nothing about the outcome);
 *  - acknowledged: the provider answered { deleted: true } (a 2xx from its delete call);
 *  - verified: we confirmed the transcript is gone afterwards. This is NOT done: there is no check call.
 */
export type DiscardOutcome = 'acknowledged' | 'not_acknowledged'

interface PendingDelete { id: string; tries: number }

function readPending(): PendingDelete[] {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PENDING_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((p): p is PendingDelete => typeof p?.id === 'string' && typeof p?.tries === 'number') : []
  } catch { return [] }
}
function writePending(list: PendingDelete[]): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-MAX_PENDING))) } catch { /* storage unavailable: nothing more to do */ }
}
/** Ids of remote copies whose deletion was not acknowledged and will be retried. Ids only, never content. */
export function pendingRemoteDeleteIds(): string[] { return readPending().map(p => p.id) }

async function deleteAcknowledged(transcriptId: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const data = await request<{ deleted?: boolean }>({ action: 'delete', transcript_id: transcriptId }, signal)
    return data?.deleted === true
  } catch { return false }
}

function forget(transcriptId: string): void {
  const list = readPending()
  if (list.some(p => p.id === transcriptId)) writePending(list.filter(p => p.id !== transcriptId))
}
function remember(transcriptId: string): void {
  const list = readPending()
  const have = list.find(p => p.id === transcriptId)
  if (have) have.tries += 1; else list.push({ id: transcriptId, tries: 1 })
  writePending(list.filter(p => p.tries < MAX_TOTAL_TRIES))
}

/** Retry earlier deletions that were never acknowledged. Never blocks and never throws. */
async function retryPendingDeletes(signal?: AbortSignal): Promise<void> {
  for (const p of readPending()) {
    if (await deleteAcknowledged(p.id, signal)) forget(p.id); else remember(p.id)
  }
}

/**
 * Once the app holds the transcript, ask AssemblyAI to delete it and the uploaded audio, and report whether the
 * provider acknowledged. Bounded: a failure or slow answer must never block the rep's report. A deletion that is
 * not acknowledged is remembered (the id only) and retried the next time analysis runs, a few times at most;
 * after that AssemblyAI's own limits apply (audio 24-48 hours, transcript 30 days, per their documentation).
 */
async function discardRemoteCopy(transcriptId: string, signal?: AbortSignal): Promise<DiscardOutcome> {
  try {
    const attempts = (async () => {
      for (let i = 0; i < DELETE_ATTEMPTS_NOW; i++) if (await deleteAcknowledged(transcriptId, signal)) return true
      return false
    })()
    const ok = await Promise.race([attempts, new Promise<boolean>(resolve => setTimeout(() => resolve(false), DISCARD_WAIT_MS))])
    if (ok) { forget(transcriptId); return 'acknowledged' }
    remember(transcriptId)
    return 'not_acknowledged'
  } catch { return 'not_acknowledged' }
}

/** Retain job between retries so slow polling resumes without another paid upload/job. */
export async function diarizeAudio(blob: Blob, job: DiarizationJob = {}, signal?: AbortSignal): Promise<DiarizedUtterance[]> {
  if (!blob.size) throw new DiarizationError('diarize', 'The recording is empty.')
  if (blob.size > MAX_ROLEPLAY_AUDIO_BYTES) throw new DiarizationError('too_large', 'Recording is too large to upload.')
  void retryPendingDeletes(signal)
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
      await discardRemoteCopy(job.transcriptId, signal)
      delete job.transcriptId
      delete job.uploadUrl
      return result.utterances
    }
    if (result.status === 'error') {
      // A failed job still holds the uploaded audio at the provider, so ask for it to be removed too.
      await discardRemoteCopy(job.transcriptId, signal)
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
