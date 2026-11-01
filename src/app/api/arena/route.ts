import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'
import {
  LIMITS, cleanAnswers, cleanBoard, cleanGroupNames, cleanInt, cleanMarkItems, cleanPhoto, cleanText, hashPin, isExpired,
  isMarkKey, isPhase, isPin, isTeamId, makeCode, makeTeamId, newSalt, newToken, normalizeCode, planSplit, safeEqual, sha256, verifyPin,
} from '@/lib/arena/protocol'

/**
 * StyleShift Arena live classroom API (public/arena.html).
 *
 * Participants join with a class code and have no Supabase session, so this
 * route is excluded from the auth proxy and does its own authentication:
 * the trainer sends the class's trainer key, a participant sends their id and
 * bearer token. The arena_* tables have RLS on with no policies; only this
 * route (service role) reads or writes them.
 */

type Body = Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
type ClassRow = {
  id: string; code: string; name: string; pin_salt: string; pin_hash: string; trainer_key: string
  phase: string; reveal: boolean; board: unknown; expires_at: string | null; teams_locked: boolean
}
type ParticipantRow = {
  id: string; name: string; team_id: string | null; token_hash: string
  pre_answers: unknown; pre_secs: number | null; pre_submitted_at: string | null
}
type Who = { cls: ClassRow; role: 'trainer' } | { cls: ClassRow; role: 'participant'; me: ParticipantRow }

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } })
const fail = (error: string, status: number) => json({ error }, status)
const ok = () => json({ ok: true })
const LOCKED = 'Your trainer has set the groups. Ask them if you need to move.'
const SESSION_ENDED = 'Your session for this class has ended. Join the class again.'
const CLASS_COLS = 'id, code, name, pin_salt, pin_hash, trainer_key, phase, reveal, board, expires_at, teams_locked'
const ME_COLS = 'id, name, team_id, token_hash, pre_answers, pre_secs, pre_submitted_at'

async function findClass(db: Db, code: string): Promise<ClassRow | null> {
  const { data } = await db.from('arena_classes').select(CLASS_COLS).eq('code', code).maybeSingle()
  return (data as ClassRow) ?? null
}

async function authenticate(db: Db, body: Body): Promise<Who | Response> {
  const code = normalizeCode(body.code)
  if (!code) return fail('Enter the 6-character class code.', 400)
  const cls = await findClass(db, code)
  if (!cls) return fail(SESSION_ENDED, 401)
  if (isExpired(cls.expires_at)) return fail('This class has expired.', 410)
  if (typeof body.trainerKey === 'string') {
    return safeEqual(body.trainerKey, cls.trainer_key) ? { cls, role: 'trainer' } : fail(SESSION_ENDED, 401)
  }
  if (typeof body.pid !== 'string' || typeof body.token !== 'string' || !/^[0-9a-f-]{36}$/.test(body.pid)) return fail(SESSION_ENDED, 401)
  const { data: me } = await db.from('arena_participants').select(ME_COLS).eq('class_id', cls.id).eq('id', body.pid).maybeSingle()
  if (!me || !safeEqual(sha256(body.token), (me as ParticipantRow).token_hash)) return fail(SESSION_ENDED, 401)
  return { cls, role: 'participant', me: me as ParticipantRow }
}

async function teamSubmitted(db: Db, classId: string, teamId: string | null): Promise<boolean> {
  if (!teamId) return false
  const { data } = await db.from('arena_teams').select('submitted_at').eq('class_id', classId).eq('id', teamId).maybeSingle()
  return !!data?.submitted_at
}

/* ---------------- unauthenticated actions ---------------- */

async function create(db: Db, body: Body, ip: string) {
  if (!(await checkRateLimit('arena-create', ip, 10, 3600))) return fail('Too many new classes. Try again later.', 429)
  const name = cleanText(body.name, 60)
  if (!name) return fail('Give the class a name (up to 60 characters).', 400)
  if (!isPin(body.pin)) return fail('Choose a PIN of 4 to 8 digits.', 400)
  const salt = newSalt()
  const trainerKey = newToken()
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode()
    const { error } = await db.from('arena_classes').insert({ code, name, pin_salt: salt, pin_hash: hashPin(body.pin, salt), trainer_key: trainerKey })
    if (!error) return json({ code, name, trainerKey })
    if (error.code !== '23505') throw new Error(error.message)
  }
  throw new Error('Could not allocate a class code')
}

async function trainerLogin(db: Db, body: Body, ip: string) {
  const code = normalizeCode(body.code)
  if (!code) return fail('Enter the 6-character class code.', 400)
  // Per-IP and per-class limits: a 4-digit PIN must not be guessable by script.
  if (!(await checkRateLimit('arena-trainer-ip', ip, 30, 600)) || !(await checkRateLimit('arena-trainer-class', code, 20, 3600)))
    return fail('Too many attempts. Try again later.', 429)
  const cls = await findClass(db, code)
  if (!cls || !verifyPin(body.pin, cls.pin_salt, cls.pin_hash)) return fail('Wrong class code or PIN.', 401)
  if (isExpired(cls.expires_at)) return fail('This class has expired.', 410)
  return json({ code: cls.code, name: cls.name, trainerKey: cls.trainer_key })
}

async function join(db: Db, body: Body, ip: string) {
  // A whole classroom often shares one public IP, so this limit is generous.
  if (!(await checkRateLimit('arena-join', ip, 150, 600))) return fail('Too many attempts. Try again in a few minutes.', 429)
  const code = normalizeCode(body.code)
  if (!code) return fail('Enter the 6-character class code.', 400)
  const name = cleanText(body.name, 40)
  if (!name) return fail('Enter your name (up to 40 characters).', 400)
  const cls = await findClass(db, code)
  if (!cls) return fail('No class has that code. Check it with your trainer.', 404)
  if (isExpired(cls.expires_at)) return fail('This class has expired.', 410)
  const { count } = await db.from('arena_participants').select('id', { count: 'exact', head: true }).eq('class_id', cls.id)
  if ((count ?? 0) >= LIMITS.participantsPerClass) return fail('This class is full.', 403)
  const token = newToken()
  const { data, error } = await db.from('arena_participants').insert({ class_id: cls.id, name, token_hash: sha256(token) }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'join insert failed')
  return json({ pid: data.id, token, name, code: cls.code, className: cls.name })
}

/* ---------------- state ---------------- */

async function state(db: Db, who: Who) {
  const { cls } = who
  const trainer = who.role === 'trainer'
  const [{ data: teams }, { data: people }] = await Promise.all([
    db.from('arena_teams')
      .select(trainer ? 'id, nickname, motto, photo_version, post_auto, post_answers, post_secs, submitted_by, submitted_at, created_at' : 'id, nickname, motto, photo_version, post_auto, submitted_by, submitted_at, created_at')
      .eq('class_id', cls.id).order('created_at'),
    db.from('arena_participants')
      .select(trainer ? 'id, name, team_id, pre_answers, pre_secs, pre_submitted_at' : 'id, name, team_id')
      .eq('class_id', cls.id).order('created_at'),
  ])
  const teamRows = (teams ?? []) as Record<string, unknown>[]
  const peopleRows = (people ?? []) as Record<string, unknown>[]
  const out: Record<string, unknown> = {
    class: {
      code: cls.code, name: cls.name, phase: cls.phase, reveal: cls.reveal, teamsLocked: !!cls.teams_locked,
      // Participants see the leaderboard only once the trainer opens Results.
      board: trainer || cls.phase === 'results' ? cls.board ?? null : null,
    },
    teams: teamRows.map(t => ({
      id: t.id, nickname: t.nickname, motto: t.motto, photoV: t.photo_version, auto: t.post_auto ?? null,
      submitted: !!t.submitted_at, submittedBy: t.submitted_by ?? '', createdAt: t.created_at,
    })),
    members: peopleRows.map(p => ({ id: p.id, name: p.name, teamId: p.team_id ?? null })),
    me: null,
  }
  if (who.role === 'participant') {
    const m = who.me
    out.me = {
      id: m.id, name: m.name, teamId: m.team_id,
      pre: m.pre_submitted_at ? { answers: m.pre_answers, secs: m.pre_secs, submittedAt: m.pre_submitted_at } : null,
    }
  } else {
    const { data: marks } = await db.from('arena_marks').select('key, items').eq('class_id', cls.id)
    out.trainer = {
      pre: peopleRows.filter(p => p.pre_submitted_at).map(p => ({ id: p.id, name: p.name, answers: p.pre_answers, secs: p.pre_secs, submittedAt: p.pre_submitted_at })),
      post: teamRows.filter(t => t.submitted_at).map(t => ({ teamId: t.id, answers: t.post_answers, secs: t.post_secs, submittedBy: t.submitted_by, submittedAt: t.submitted_at })),
      marks: ((marks ?? []) as { key: string; items: unknown }[]).map(m => ({ key: m.key, items: m.items })),
    }
  }
  return json(out)
}

/* ---------------- participant actions ---------------- */

async function rename(db: Db, cls: ClassRow, me: ParticipantRow, body: Body) {
  const name = cleanText(body.name, 40)
  if (!name) return fail('Enter your name (up to 40 characters).', 400)
  await db.from('arena_participants').update({ name }).eq('class_id', cls.id).eq('id', me.id)
  return ok()
}

async function submitPre(db: Db, cls: ClassRow, me: ParticipantRow, body: Body) {
  if (cls.phase !== 'pre') return fail('The pre-test is not open right now.', 409)
  const answers = cleanAnswers(body.answers)
  const secs = cleanInt(body.secs, LIMITS.maxSecs)
  if (!answers || secs === null) return fail('These answers could not be read. Refresh and try again.', 400)
  const { data } = await db.from('arena_participants')
    .update({ pre_answers: answers, pre_secs: secs, pre_submitted_at: new Date().toISOString() })
    .eq('class_id', cls.id).eq('id', me.id).is('pre_submitted_at', null).select('id')
  if (!data?.length) return fail('You already submitted the pre-test.', 409)
  return ok()
}

async function createTeam(db: Db, cls: ClassRow, me: ParticipantRow, body: Body) {
  if (cls.phase !== 'teams' && cls.phase !== 'post') return fail('Teams are not open right now.', 409)
  if (cls.teams_locked) return fail(LOCKED, 409)
  if (!isTeamId(body.teamId)) return fail('Invalid team.', 400)
  const nickname = cleanText(body.nickname, 32)
  const motto = cleanText(body.motto, 60, true)
  const photo = cleanPhoto(body.photo)
  if (!nickname) return fail('Give your team a nickname (up to 32 characters).', 400)
  if (motto === null) return fail('Keep the motto under 60 characters.', 400)
  if (photo === undefined) return fail('That photo could not be used. Try another one.', 400)
  if (await teamSubmitted(db, cls.id, me.team_id)) return fail('Your team has already submitted.', 409)
  const { count } = await db.from('arena_teams').select('id', { count: 'exact', head: true }).eq('class_id', cls.id)
  if ((count ?? 0) >= LIMITS.teamsPerClass) return fail('This class has the maximum number of teams.', 403)
  const { error } = await db.from('arena_teams').insert({ class_id: cls.id, id: body.teamId, nickname, motto, photo, photo_version: photo ? 1 : 0 })
  if (error) {
    if (error.code === '23505') return fail('Please try creating the team again.', 409)
    throw new Error(error.message)
  }
  await db.from('arena_participants').update({ team_id: body.teamId }).eq('class_id', cls.id).eq('id', me.id)
  return ok()
}

async function joinTeam(db: Db, cls: ClassRow, me: ParticipantRow, body: Body) {
  if (cls.phase !== 'teams' && cls.phase !== 'post') return fail('Teams are not open right now.', 409)
  const teamId = body.teamId === null ? null : isTeamId(body.teamId) ? body.teamId : undefined
  if (teamId === undefined) return fail('Invalid team.', 400)
  if (teamId === me.team_id) return ok()
  if (cls.teams_locked) return fail(LOCKED, 409)
  if (await teamSubmitted(db, cls.id, me.team_id)) return fail('Your team has already submitted.', 409)
  if (teamId) {
    const { data: team } = await db.from('arena_teams').select('id, submitted_at').eq('class_id', cls.id).eq('id', teamId).maybeSingle()
    if (!team) return fail('That team no longer exists.', 404)
    if (team.submitted_at) return fail('That team has already submitted.', 409)
  }
  await db.from('arena_participants').update({ team_id: teamId }).eq('class_id', cls.id).eq('id', me.id)
  return ok()
}

async function submitPost(db: Db, cls: ClassRow, me: ParticipantRow, body: Body) {
  if (cls.phase !== 'post') return fail('The post-test is not open right now.', 409)
  if (!me.team_id) return fail('Join a team first.', 409)
  const answers = cleanAnswers(body.answers)
  const secs = cleanInt(body.secs, LIMITS.maxSecs)
  const auto = cleanInt(body.auto, LIMITS.maxAuto)
  if (!answers || secs === null || auto === null) return fail('These answers could not be read. Refresh and try again.', 400)
  const { data } = await db.from('arena_teams')
    .update({ post_answers: answers, post_secs: secs, post_auto: auto, submitted_by: me.name, submitted_at: new Date().toISOString() })
    .eq('class_id', cls.id).eq('id', me.team_id).is('submitted_at', null).select('id')
  if (!data?.length) return fail('Your team has already submitted.', 409)
  return ok()
}

/** A team member sets their team's nickname, motto or photo (also for groups the trainer made). */
async function updateTeam(db: Db, cls: ClassRow, me: ParticipantRow, body: Body) {
  if (!me.team_id) return fail('Join a team first.', 409)
  const { data: team } = await db.from('arena_teams').select('id, photo_version, submitted_at').eq('class_id', cls.id).eq('id', me.team_id).maybeSingle()
  if (!team) return fail('That team no longer exists.', 404)
  if (team.submitted_at) return fail('Your team has already submitted.', 409)
  const patch: Record<string, unknown> = {}
  if (body.nickname !== undefined) {
    const nickname = cleanText(body.nickname, 32)
    if (!nickname) return fail('Give your team a nickname (up to 32 characters).', 400)
    patch.nickname = nickname
  }
  if (body.motto !== undefined) {
    const motto = cleanText(body.motto, 60, true)
    if (motto === null) return fail('Keep the motto under 60 characters.', 400)
    patch.motto = motto
  }
  if (body.photo !== undefined && body.photo !== '') {
    const photo = cleanPhoto(body.photo)
    if (!photo) return fail('That photo could not be used. Try another one.', 400)
    patch.photo = photo
    patch.photo_version = (team.photo_version ?? 0) + 1
  }
  if (Object.keys(patch).length) await db.from('arena_teams').update(patch).eq('class_id', cls.id).eq('id', me.team_id)
  return ok()
}

/* ---------------- trainer actions ---------------- */

async function createGroups(db: Db, cls: ClassRow, body: Body) {
  const names = cleanGroupNames(body.names)
  if (!names) return fail('Enter 1 to 40 group names of up to 32 characters.', 400)
  const { count } = await db.from('arena_teams').select('id', { count: 'exact', head: true }).eq('class_id', cls.id)
  if ((count ?? 0) + names.length > LIMITS.teamsPerClass) return fail(`A class can have at most ${LIMITS.teamsPerClass} teams.`, 403)
  const { error } = await db.from('arena_teams').insert(names.map(nickname => ({ class_id: cls.id, id: makeTeamId(), nickname })))
  if (error) {
    if (error.code === '23505') return fail('Please try again.', 409)
    throw new Error(error.message)
  }
  return ok()
}

async function assign(db: Db, cls: ClassRow, body: Body) {
  if (typeof body.pid !== 'string' || !/^[0-9a-f-]{36}$/.test(body.pid)) return fail('Invalid participant.', 400)
  const teamId = body.teamId === null ? null : isTeamId(body.teamId) ? body.teamId : undefined
  if (teamId === undefined) return fail('Invalid team.', 400)
  const { data: p } = await db.from('arena_participants').select('id, team_id').eq('class_id', cls.id).eq('id', body.pid).maybeSingle()
  if (!p) return fail('That participant has left the class.', 404)
  if (p.team_id === teamId) return ok()
  if (await teamSubmitted(db, cls.id, p.team_id)) return fail("This person's team has already submitted.", 409)
  if (teamId) {
    const { data: team } = await db.from('arena_teams').select('id, submitted_at').eq('class_id', cls.id).eq('id', teamId).maybeSingle()
    if (!team) return fail('That team no longer exists.', 404)
    if (team.submitted_at) return fail('That team has already submitted.', 409)
  }
  await db.from('arena_participants').update({ team_id: teamId }).eq('class_id', cls.id).eq('id', body.pid)
  return ok()
}

async function splitTeams(db: Db, cls: ClassRow, body: Body) {
  const [{ data: people }, { data: teams }] = await Promise.all([
    db.from('arena_participants').select('id, team_id').eq('class_id', cls.id),
    db.from('arena_teams').select('id, submitted_at').eq('class_id', cls.id),
  ])
  const plan = planSplit(
    ((people ?? []) as { id: string; team_id: string | null }[]).map(p => ({ id: p.id, teamId: p.team_id })),
    ((teams ?? []) as { id: string; submitted_at: string | null }[]).map(t => ({ id: t.id, submitted: !!t.submitted_at })),
    body.onlyUnassigned === true,
  )
  if (!plan) return fail('Create the groups first.', 409)
  const byTeam: Record<string, string[]> = {}
  for (const [pid, tid] of Object.entries(plan)) (byTeam[tid] ??= []).push(pid)
  for (const [tid, ids] of Object.entries(byTeam)) {
    await db.from('arena_participants').update({ team_id: tid }).eq('class_id', cls.id).in('id', ids)
  }
  return json({ ok: true, placed: Object.keys(plan).length })
}

async function setLock(db: Db, cls: ClassRow, body: Body) {
  if (typeof body.locked !== 'boolean') return fail('Invalid setting.', 400)
  await db.from('arena_classes').update({ teams_locked: body.locked }).eq('id', cls.id)
  return ok()
}


async function setStage(db: Db, cls: ClassRow, body: Body) {
  const patch: Record<string, unknown> = {}
  if (body.phase !== undefined) {
    if (!isPhase(body.phase)) return fail('Unknown stage.', 400)
    patch.phase = body.phase
  }
  if (body.reveal !== undefined) {
    if (typeof body.reveal !== 'boolean') return fail('Invalid setting.', 400)
    patch.reveal = body.reveal
  }
  if (Object.keys(patch).length) await db.from('arena_classes').update(patch).eq('id', cls.id)
  return ok()
}

async function mark(db: Db, cls: ClassRow, body: Body) {
  const items = cleanMarkItems(body.items)
  if (!isMarkKey(body.key) || !items) return fail('Invalid score.', 400)
  const { error } = await db.from('arena_marks').upsert({ class_id: cls.id, key: body.key, items, updated_at: new Date().toISOString() }, { onConflict: 'class_id,key' })
  if (error) throw new Error(error.message)
  return ok()
}

async function publish(db: Db, cls: ClassRow, body: Body) {
  const board = cleanBoard(body.board)
  if (!board) return fail('The leaderboard is too large to publish.', 400)
  await db.from('arena_classes').update({ board }).eq('id', cls.id)
  return ok()
}

async function deleteTeam(db: Db, cls: ClassRow, body: Body) {
  if (!isTeamId(body.teamId)) return fail('Invalid team.', 400)
  await db.from('arena_participants').update({ team_id: null }).eq('class_id', cls.id).eq('team_id', body.teamId)
  await db.from('arena_teams').delete().eq('class_id', cls.id).eq('id', body.teamId)
  await db.from('arena_marks').delete().eq('class_id', cls.id).eq('key', `post_${body.teamId}`)
  return ok()
}

async function reset(db: Db, cls: ClassRow) {
  await db.from('arena_marks').delete().eq('class_id', cls.id)
  await db.from('arena_participants').delete().eq('class_id', cls.id)
  await db.from('arena_teams').delete().eq('class_id', cls.id)
  await db.from('arena_classes').update({ phase: 'lobby', reveal: false, board: null, teams_locked: false }).eq('id', cls.id)
  return ok()
}

/* ---------------- dispatch ---------------- */

const PARTICIPANT_ACTIONS = ['rename', 'submitPre', 'createTeam', 'joinTeam', 'updateTeam', 'submitPost'] as const
const TRAINER_ACTIONS = ['setStage', 'mark', 'publish', 'deleteTeam', 'reset', 'createGroups', 'assign', 'splitTeams', 'setLock'] as const

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch { return fail('Invalid request.', 400) }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail('Invalid request.', 400)
  const b = body as Body
  const action = typeof b.action === 'string' ? b.action : ''
  const db = createAdminClient()
  try {
    if (action === 'create') return await create(db, b, clientIp(request))
    if (action === 'trainerLogin') return await trainerLogin(db, b, clientIp(request))
    if (action === 'join') return await join(db, b, clientIp(request))
    const isParticipantAction = (PARTICIPANT_ACTIONS as readonly string[]).includes(action)
    const isTrainerAction = (TRAINER_ACTIONS as readonly string[]).includes(action)
    if (action !== 'state' && !isParticipantAction && !isTrainerAction) return fail('Unknown action.', 400)

    const who = await authenticate(db, b)
    if (who instanceof Response) return who
    if (action === 'state') return await state(db, who)
    if (isTrainerAction && who.role !== 'trainer') return fail('Only the trainer can do that.', 403)
    if (isParticipantAction && who.role !== 'participant') return fail('Only participants can do that.', 403)

    if (who.role === 'participant') {
      const { cls, me } = who
      if (action === 'rename') return await rename(db, cls, me, b)
      if (action === 'submitPre') return await submitPre(db, cls, me, b)
      if (action === 'createTeam') return await createTeam(db, cls, me, b)
      if (action === 'joinTeam') return await joinTeam(db, cls, me, b)
      if (action === 'updateTeam') return await updateTeam(db, cls, me, b)
      return await submitPost(db, cls, me, b)
    }
    const { cls } = who
    if (action === 'setStage') return await setStage(db, cls, b)
    if (action === 'mark') return await mark(db, cls, b)
    if (action === 'publish') return await publish(db, cls, b)
    if (action === 'deleteTeam') return await deleteTeam(db, cls, b)
    if (action === 'createGroups') return await createGroups(db, cls, b)
    if (action === 'assign') return await assign(db, cls, b)
    if (action === 'splitTeams') return await splitTeams(db, cls, b)
    if (action === 'setLock') return await setLock(db, cls, b)
    return await reset(db, cls)
  } catch (e) {
    console.error('arena', action, e)
    return fail('Something went wrong. Try again.', 500)
  }
}
