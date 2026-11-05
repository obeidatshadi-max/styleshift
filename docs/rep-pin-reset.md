# Rep PIN reset

Reps who sign in with a **mobile number + 6-digit PIN** have no email, so "Forgot password" cannot help them. Their manager resets the PIN instead.

**Manager:** Dashboard, panel "Rep Sign-in (PIN reset)". Click Reset PIN next to the rep, confirm, and a new random 6-digit PIN is shown once with a Copy button. Give it to the rep privately. The old PIN stops working straight away. Reps who sign in with an email are listed too and use "Forgot password?" instead.

**Rep:** the mobile sign-in screen says to ask the manager.

**Rules:** only a manager can reset, only for reps in their own team, at most 20 resets an hour. The PIN is random (no 000000, 123456 and similar), is never stored or logged, and is returned in a response that is not cached. Every reset is recorded in the audit trail first (rep, manager, time, never the PIN); if the record cannot be written the PIN is not changed.

## Closed at the same time: account takeover through the invite link

Until now, opening a company invite link and entering **any rep's mobile number with a new PIN** silently reset that rep's PIN and moved them into the company. Invite links are shared in group chats, so anyone with the link and a colleague's number could take over their account. `/api/rep-join` now refuses a number that already has an account ("sign in, or ask your manager to reset your PIN"). A leftover login that never got a profile (a join that failed half way) can still be finished, because nobody is locked out.

**Side effect to know about:** a rep who forgot their PIN can no longer fix it by re-opening the invite link. That is exactly what the manager reset is for.

**Not covered:** the rep's existing signed-in sessions are not ended by a reset, so a rep who was already signed in on a lost phone stays signed in there until the session expires.

## Hardening after a security review of the invite-link join

- A mobile number must be digits only (8 to 15), because it becomes part of the hidden login address.
- Joins are limited per number (5 per 10 minutes) as well as per IP (10 per 10 minutes).
- The profile is claimed with an insert that cannot overwrite or move an existing profile, and **before** the PIN is set, so two joins racing for the same leftover login cannot both win. If the profile lookup fails, nothing is changed.
- Nobody can register an address on the hidden `@s.styleshift.rep` domain through rep or manager sign-up, which would have claimed a colleague's number in advance.
- The refusal message no longer says outright that an account exists.

**Still true, and not fixable without an SMS provider:**
- The first person to open an invite link with a number sets that number's PIN. A stranger holding the link could claim a colleague's number before the colleague joins and lock them out. If it happens through your own company's link, use Reset PIN on that profile and give the new PIN to the real person; through another company's link, this manager cannot recover it. The real fix is to verify the number with a one-time SMS code.
- The refusal still tells someone probing numbers that the number is already registered. Rate limits slow this down; they do not remove it.
