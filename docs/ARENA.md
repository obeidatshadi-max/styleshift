# StyleShift Arena

A classroom pre/post-training assessment competition at `/arena.html`
(`public/arena.html`): an individual pre-test, team nicknames and photos,
a team post-test (rapid fire, scenarios, business cases, local-dialect lab),
trainer scoring and a leaderboard.

## Live class mode (default on the website)

1. The trainer opens `/arena.html`, chooses **I'm the trainer → Create a class**,
   and sets a class name and a 4–8 digit PIN. The page shows a 6-character class code.
2. Participants open `/arena.html` (or `/arena.html?code=XXXXXX`) on their phones,
   enter the code and their name. No StyleShift account is needed.
3. The trainer moves everyone through the stages from the Control room and
   projects the Big screen tab, which shows the join address and code.
4. The trainer can reopen the console on any device with the code and PIN.

Screens poll `/api/arena` every few seconds. Classes expire 60 days after creation.

## Groups

Teams can come from participants, from the trainer, or both. In the Control room's
**Groups** section the trainer can:

- create groups by name (one per line) or as numbered groups ("Group 1", "Group 2", ...);
- **Split everyone randomly** into the open groups (evenly), or **Place people without a group**
  into the smallest groups;
- move any participant with the drop-down next to their name;
- **Lock groups**: participants can no longer create, join or leave a team, but anyone in a
  team can still set its nickname, motto and photo.

Members of a team that has submitted its post-test are never moved.

## Offline mode

**Run offline on this device** on the start screen keeps everything in that
browser's `localStorage`, for rooms without internet. One shared device; the
trainer console is locked behind a device PIN.

## Data and security

- Tables: `arena_classes`, `arena_teams`, `arena_participants`, `arena_marks`
  (migrations `20261101111021_arena_classes.sql`, `20261101114432_arena_teams_locked.sql`). RLS is on with no policies and
  `anon`/`authenticated` have no privileges: only `/api/arena` (service role) reads or
  writes them.
- `/api/arena` and `/api/arena/photo` are excluded from the auth proxy and
  authenticate each request themselves: the trainer sends the class's trainer key;
  a participant sends their id and a bearer token stored only as a SHA-256 hash.
  The trainer PIN is stored as a salted scrypt hash.
- Class creation, joining and trainer PIN attempts are rate limited.
- The quiz answer key ships in the page, so the arena suits classroom practice,
  not formal certification.
