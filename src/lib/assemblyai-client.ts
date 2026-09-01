// src/lib/assemblyai-client.ts
const PROXY_URL = '/.netlify/functions/assemblyai-proxy'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export interface DiarizedWord { text: string; speaker: string; start: number; end: number }
export interface DiarizedUtterance { speaker: string; text: string; start: number; end: number; words: DiarizedWord[] }

interface TranscriptStatus {
  status: 'queued' | 'processing' | 'completed' | 'error'
  utterances?: DiarizedUtterance[]
  error?: string
}

async function uploadAudio(blob: Blob): Promise<string> {
  const audio = await blobToBase64(blob)
  const res = await fetch(PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'upload', audio }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Upload failed')
  return data.upload_url as string
}

async function submitDiarization(audioUrl: string): Promise<string> {
  const res = await fetch(PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'submit', audio_url: audioUrl }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Submit failed')
  return data.id as string
}

async function pollTranscript(transcriptId: string): Promise<TranscriptStatus> {
  const res = await fetch(PROXY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'poll', transcript_id: transcriptId }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Poll failed')
  return data as TranscriptStatus
}

/** Uploads, submits, and polls until diarization completes. Throws on error or a 90s timeout. */
export async function diarizeAudio(blob: Blob): Promise<DiarizedUtterance[]> {
  const uploadUrl = await uploadAudio(blob)
  const transcriptId = await submitDiarization(uploadUrl)
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    const result = await pollTranscript(transcriptId)
    if (result.status === 'completed') return result.utterances ?? []
    if (result.status === 'error') throw new Error(result.error || 'Diarization failed')
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  throw new Error('Diarization timed out — try a shorter recording.')
}
