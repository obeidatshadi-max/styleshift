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
//      -> { id: string, status: 'queued' }
//    { action: 'poll', transcript_id: string }
//      -> { status: 'queued'|'processing'|'completed'|'error',
//           utterances?: [{ speaker, text, start, end, words }], error?: string }
// ═══════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js')

// AssemblyAI transcript/upload IDs are opaque alphanumeric tokens (uuid-shaped
// for transcript ids). Reject anything else before it reaches the URL path —
// blocks path-injection into our own outbound request.
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/
// Upload URLs we forward to AssemblyAI must be ones AssemblyAI itself issued
// (from our own 'upload' call) — never an arbitrary attacker-supplied URL,
// which would make AssemblyAI's servers fetch it on our behalf (SSRF).
const ASSEMBLYAI_UPLOAD_HOST = /^https:\/\/cdn\.assemblyai\.com\//

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
      const response = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { authorization: apiKey },
        body: buffer,
      })
      const data = await response.json()
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    if (body.action === 'submit') {
      if (!body.audio_url || !ASSEMBLYAI_UPLOAD_HOST.test(body.audio_url)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid audio_url.' }) }
      }
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: body.audio_url, speaker_labels: true }),
      })
      const data = await response.json()
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    if (body.action === 'poll') {
      if (!body.transcript_id || !SAFE_ID.test(body.transcript_id)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid transcript_id.' }) }
      }
      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${encodeURIComponent(body.transcript_id)}`, {
        headers: { authorization: apiKey },
      })
      const data = await response.json()
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${body.action}` }) }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) }
  }
}
