import { createClient } from '@/lib/supabase-server'
import { verifyBotToken, type BotTokenClaims } from '@/lib/voice-partner-bot-token'

export type VoicePartnerAuth =
  | { userId: string; viaToken: true; claims: BotTokenClaims }
  | { userId: string; viaToken: false }

/** The Pipecat bot has no Supabase session cookie, so it authenticates
 * with a bearer token instead (see `voice-partner-bot-token.ts`). A
 * present-but-invalid bearer token fails outright rather than falling
 * back to the cookie check — silently downgrading to a weaker check on
 * a bad token would defeat the point of requiring one. */
export async function authenticateVoicePartnerRequest(req: Request): Promise<VoicePartnerAuth | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const claims = verifyBotToken(authHeader.slice('Bearer '.length))
    if (!claims) return null
    return { userId: claims.userId, viaToken: true, claims }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, viaToken: false }
}
