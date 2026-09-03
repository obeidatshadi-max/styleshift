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

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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
      if (!body.audio_url) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No audio_url provided.' }) }
      const response = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: body.audio_url, speaker_labels: true }),
      })
      const data = await response.json()
      return { statusCode: response.status, headers, body: JSON.stringify(data) }
    }

    if (body.action === 'poll') {
      if (!body.transcript_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'No transcript_id provided.' }) }
      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${body.transcript_id}`, {
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
