// netlify/functions/assemblyai-proxy.js
// ═══════════════════════════════════════════════════════════
//  Sits between the app and the AssemblyAI speaker-diarization API.
//  Your ASSEMBLYAI_API_KEY never reaches the browser.
//
//  Set in Netlify → Site settings → Environment variables:
//    ASSEMBLYAI_API_KEY = <your key from assemblyai.com/app/account>
//
//  Browser sends JSON with an `action`:
//    { action: 'upload', audio: '<base64>' }
//      -> { upload_url: string }
//    { action: 'submit', audio_url: string }
//      -> { id: string, status: 'queued' }   id is a signed handle "<transcript id>~<sig>";
//         poll and delete accept only a handle signed for the same user.
//    { action: 'poll', transcript_id: string }
//      -> { status: 'queued'|'processing'|'completed'|'error',
//           utterances?: [{ speaker, text, start, end, words }], error?: string }
//    { action: 'delete', transcript_id: string, storage_path?: string }
//      -> { deleted: boolean }   (also removes the uploaded audio)
//    { action: 'submit_storage', storage_path: string }
//      -> { id: string, status: 'queued' }
//         For files over the 4 MB body limit: the browser has put the file in the
//         private 'roleplay-audio' bucket under its own uid folder; this signs a
//         short-lived URL for AssemblyAI to fetch. 'poll' and 'delete' remove the
//         file again when given the same storage_path.
// ═══════════════════════════════════════════════════════════

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

// Transcript ownership (architecture review 2026-11-27, F4). AssemblyAI does not know our users,
// so 'poll' and 'delete' used to accept any transcript id: anyone signed in who learned another
// rep's id could read that conversation's transcript or delete it. Submit now returns a handle
// "<id>~<signature>" where the signature binds the id to the submitting user. Poll and delete
// accept only a handle signed for the caller. Stateless: nothing is stored.
function ownerSignature(secret, userId, transcriptId) {
  return crypto.createHmac('sha256', secret).update(`transcript-owner:v1:${userId}:${transcriptId}`).digest('base64url')
}
function signHandle(secret, userId, transcriptId) {
  return `${transcriptId}~${ownerSignature(secret, userId, transcriptId)}`
}
/** The transcript id inside a handle signed for this user, or null. */
function ownedTranscriptId(secret, userId, handle) {
  if (typeof handle !== 'string') return null
  const [id, sig, extra] = handle.split('~')
  if (extra !== undefined || !id || !sig || !SAFE_ID.test(id)) return null
  const expected = Buffer.from(ownerSignature(secret, userId, id))
  const given = Buffer.from(sig)
  return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? id : null
}

// AssemblyAI transcript/upload IDs are opaque alphanumeric tokens (uuid-shaped
// for transcript ids). Reject anything else before it reaches the URL path —
// blocks path-injection into our own outbound request.
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/
// Upload URLs we forward to AssemblyAI must be ones AssemblyAI itself issued
// (from our own 'upload' call) — never an arbitrary attacker-supplied URL,
// which would make AssemblyAI's servers fetch it on our behalf (SSRF).
const ASSEMBLYAI_UPLOAD_HOST = /^https:\/\/cdn\.assemblyai\.com\//
const AUDIO_BUCKET = 'roleplay-audio'
// "<uid>/<random>.<ext>" inside the private bucket: the uid folder must be the caller's own.
const STORAGE_FILE = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.[a-z0-9]{2,5}$/
const SIGNED_URL_SECONDS = 60 * 60

function ownStoragePath(path, userId) {
  return typeof path === 'string' && STORAGE_FILE.test(path) && path.startsWith(`${userId}/`)
}

function transcriptRequest(audioUrl) {
  // speakers_expected hints AssemblyAI's diarization clustering — this
  // recording is always exactly one rep + one practice partner, and
  // without the hint short/close-together same-mic recordings were
  // consistently clustering both voices into a single speaker.
  return JSON.stringify({
    audio_url: audioUrl,
    speech_models: ['universal-3-pro', 'universal-2'],
    language_detection: true,
    speaker_labels: true,
    speakers_expected: 2,
  })
}

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' }
  }

  const apiKey = process.env.ASSEMBLYAI_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'ASSEMBLYAI_API_KEY not set in Netlify environment variables.' }),
    }
  }

  // Require a logged-in StyleShift user — otherwise anyone with this URL can
  // spend our AssemblyAI credits with no rate limit.
  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Supabase server config missing.' }) }
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user }, error: authError } = await admin.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  try {
    const body = JSON.parse(event.body || '{}')

    if (body.action === 'upload') {
      if (!body.audio) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No audio provided.' }) }
      const buffer = Buffer.from(body.audio, 'base64')
      console.log(`assemblyai upload: ${buffer.length} bytes`)
      const response = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { authorization: apiKey },
        body: buffer,
      })
      const data = await response.json()
      if (!response.ok) console.error('assemblyai upload failed:', response.status, JSON.stringify(data))
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    if (body.action === 'submit') {
      if (!body.audio_url || !ASSEMBLYAI_UPLOAD_HOST.test(body.audio_url)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid audio_url.' }) }
      }
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: apiKey, 'Content-Type': 'application/json' },
        body: transcriptRequest(body.audio_url),
      })
      const data = await response.json()
      if (!response.ok) console.error('assemblyai submit failed:', response.status, JSON.stringify(data))
      else console.log('assemblyai submit ok, transcript id:', data.id)
      if (response.ok && data.id) data.id = signHandle(apiKey, user.id, data.id)
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    if (body.action === 'submit_storage') {
      if (!ownStoragePath(body.storage_path, user.id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid storage_path.' }) }
      }
      const { data: signed, error: signError } = await admin.storage.from(AUDIO_BUCKET).createSignedUrl(body.storage_path, SIGNED_URL_SECONDS)
      if (signError || !signed?.signedUrl) {
        console.error('roleplay-audio sign failed:', signError?.message)
        return { statusCode: 502, headers, body: JSON.stringify({ error: 'Could not prepare the recording for analysis.' }) }
      }
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: apiKey, 'Content-Type': 'application/json' },
        body: transcriptRequest(signed.signedUrl),
      })
      const data = await response.json()
      if (!response.ok) console.error('assemblyai submit (storage) failed:', response.status, JSON.stringify(data))
      else console.log('assemblyai submit (storage) ok, transcript id:', data.id)
      if (response.ok && data.id) data.id = signHandle(apiKey, user.id, data.id)
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    // Removes a large-file upload from the private bucket. Never blocks the answer on failure.
    const removeStoredAudio = async () => {
      if (!ownStoragePath(body.storage_path, user.id)) return
      const { error } = await admin.storage.from(AUDIO_BUCKET).remove([body.storage_path])
      if (error) console.error('roleplay-audio remove failed:', error.message)
    }

    if (body.action === 'poll') {
      const transcriptId = ownedTranscriptId(apiKey, user.id, body.transcript_id)
      if (!transcriptId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid transcript_id.' }) }
      }
      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(transcriptId)}`, {
        headers: { authorization: apiKey },
      })
      const data = await response.json()
      // Once AssemblyAI has finished (or failed) it no longer needs the file, so the stored copy goes now.
      if (response.ok && (data.status === 'completed' || data.status === 'error')) await removeStoredAudio()
      if (!response.ok) {
        console.error('assemblyai poll failed:', response.status, JSON.stringify(data))
      } else if (data.status === 'completed') {
        const speakerCount = new Set((data.utterances || []).map(u => u.speaker)).size
        const wordSpeakers = new Set((data.words || []).map(w => w.speaker)).size
        console.log(`assemblyai poll completed: ${speakerCount} distinct speakers (utterances), ${wordSpeakers} distinct speakers (words), ${(data.utterances || []).length} utterances, ${(data.words || []).length} words, audio_duration=${data.audio_duration}, text_length=${(data.text || '').length}`)
        console.log('assemblyai speaker_labels config used:', data.speaker_labels, 'speakers_expected:', data.speakers_expected)
      } else if (data.status === 'error') {
        console.error('assemblyai transcription error:', data.error)
      } else {
        console.log('assemblyai poll status:', data.status)
      }
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    // Removes the transcript and the audio uploaded for it from AssemblyAI once
    // the app holds the result. AssemblyAI would otherwise keep the audio for
    // 24-48 hours and the transcript for 30 days.
    if (body.action === 'delete') {
      const transcriptId = ownedTranscriptId(apiKey, user.id, body.transcript_id)
      if (!transcriptId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid transcript_id.' }) }
      }
      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(transcriptId)}`, {
        method: 'DELETE',
        headers: { authorization: apiKey },
      })
      await removeStoredAudio()
      if (!response.ok) console.error('assemblyai delete failed:', response.status)
      else console.log('assemblyai delete ok, transcript id:', transcriptId)
      return { statusCode: response.ok ? 200 : response.status, headers, body: JSON.stringify({ deleted: response.ok }) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${body.action}` }) }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
