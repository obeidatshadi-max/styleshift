export type InviteEventStage = 'link_opened' | 'signup_completed' | 'first_drill_completed'

export const INVITE_EVENT_STAGES: InviteEventStage[] = ['link_opened', 'signup_completed', 'first_drill_completed']

/**
 * Fire-and-forget funnel event for the invite→signup→first-drill path.
 * Never awaited by callers and never throws — a dropped event must not
 * block or visibly affect the rep's join flow or practice session.
 * 'signup_completed' isn't logged from here — it's logged inline in
 * /api/rep-join, which already has both the rep id and company id on hand.
 */
export function logInviteEvent(stage: 'link_opened', inviteCode: string): void
export function logInviteEvent(stage: 'first_drill_completed'): void
export function logInviteEvent(stage: 'link_opened' | 'first_drill_completed', inviteCode?: string): void {
  fetch('/api/invite-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stage, inviteCode }),
  }).catch(() => { /* best-effort */ })
}
