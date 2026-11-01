import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), clientIp: () => '203.0.113.7' }))
import { createAdminClient } from '@/lib/supabase-admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { createFakeDb } from '@/lib/arena/fake-db'
import { POST } from './route'
import { GET as photo } from './photo/route'

let db: ReturnType<typeof createFakeDb>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = async (body: Record<string, unknown>): Promise<{ status: number; json: any }> => {
  const res = await POST(new Request('http://x/api/arena', { method: 'POST', body: JSON.stringify(body) }))
  return { status: res.status, json: await res.json() }
}

async function newClass() {
  const { json } = await call({ action: 'create', name: 'Baghdad cohort', pin: '4321' })
  return { code: json.code as string, trainerKey: json.trainerKey as string }
}
async function joinAs(code: string, name: string) {
  const { json } = await call({ action: 'join', code, name })
  return { code, pid: json.pid as string, token: json.token as string }
}

beforeEach(() => {
  vi.clearAllMocks()
  db = createFakeDb()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(createAdminClient).mockReturnValue(db as any)
  vi.mocked(checkRateLimit).mockResolvedValue(true)
})

describe('arena classes', () => {
  it('creates a class with a code, and only the right PIN reopens it', async () => {
    const { code, trainerKey } = await newClass()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(db.tables.arena_classes[0].pin_hash).not.toContain('4321')
    expect((await call({ action: 'trainerLogin', code, pin: '9999' })).status).toBe(401)
    const login = await call({ action: 'trainerLogin', code: code.toLowerCase(), pin: '4321' })
    expect(login.status).toBe(200)
    expect(login.json.trainerKey).toBe(trainerKey)
  })
  it('rejects a bad PIN or name and rate limits creation', async () => {
    expect((await call({ action: 'create', name: 'X', pin: '12' })).status).toBe(400)
    expect((await call({ action: 'create', name: ' ', pin: '1234' })).status).toBe(400)
    vi.mocked(checkRateLimit).mockResolvedValue(false)
    expect((await call({ action: 'create', name: 'X', pin: '1234' })).status).toBe(429)
  })
  it('rejects unknown actions and malformed bodies', async () => {
    expect((await call({ action: 'dropTables' })).status).toBe(400)
    const res = await POST(new Request('http://x/api/arena', { method: 'POST', body: 'not json' }))
    expect(res.status).toBe(400)
  })
})

describe('arena participants', () => {
  it('joins by code and stores only a hash of the token', async () => {
    const { code } = await newClass()
    expect((await call({ action: 'join', code: 'ZZZZZZ', name: 'Rana' })).status).toBe(404)
    const me = await joinAs(code, 'Rana')
    expect(me.token.length).toBeGreaterThan(20)
    expect(JSON.stringify(db.tables.arena_participants)).not.toContain(me.token)
    const s = await call({ action: 'state', ...me })
    expect(s.status).toBe(200)
    expect(s.json.me).toMatchObject({ name: 'Rana', teamId: null, pre: null })
    expect(s.json.trainer).toBeUndefined()
  })
  it('refuses a wrong token and trainer-only actions', async () => {
    const { code } = await newClass()
    const me = await joinAs(code, 'Rana')
    expect((await call({ action: 'state', ...me, token: 'wrong' })).status).toBe(401)
    expect((await call({ action: 'setStage', ...me, phase: 'results' })).status).toBe(403)
    expect((await call({ action: 'reset', ...me })).status).toBe(403)
  })
  it('accepts the pre-test only while it is open, and only once', async () => {
    const { code, trainerKey } = await newClass()
    const me = await joinAs(code, 'Rana')
    const answers = { p1: 1, pd1: 'phrase' }
    expect((await call({ action: 'submitPre', ...me, answers, secs: 60 })).status).toBe(409)
    await call({ action: 'setStage', code, trainerKey, phase: 'pre' })
    expect((await call({ action: 'submitPre', ...me, answers, secs: 60 })).status).toBe(200)
    expect((await call({ action: 'submitPre', ...me, answers, secs: 61 })).status).toBe(409)
    const s = await call({ action: 'state', ...me })
    expect(s.json.me.pre).toMatchObject({ answers, secs: 60 })
  })
})

describe('arena teams and post-test', () => {
  it('runs a class from teams to the published leaderboard', async () => {
    const { code, trainerKey } = await newClass()
    const t = { code, trainerKey }
    const rana = await joinAs(code, 'Rana')
    const omar = await joinAs(code, 'Omar')
    expect((await call({ action: 'createTeam', ...rana, teamId: 'tabc12345', nickname: 'Liners' })).status).toBe(409)
    await call({ action: 'setStage', ...t, phase: 'teams' })
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQ'
    expect((await call({ action: 'createTeam', ...rana, teamId: 'tabc12345', nickname: 'Liners', photo: 'data:text/html;base64,PGI+' })).status).toBe(400)
    expect((await call({ action: 'createTeam', ...rana, teamId: 'tabc12345', nickname: 'Liners', motto: 'Short', photo: jpeg })).status).toBe(200)
    expect((await call({ action: 'joinTeam', ...omar, teamId: 'tabc12345' })).status).toBe(200)

    const pic = await photo(new Request(`http://x/api/arena/photo?code=${code}&team=tabc12345`))
    expect(pic.status).toBe(200)
    expect(pic.headers.get('content-type')).toBe('image/jpeg')
    expect((await photo(new Request(`http://x/api/arena/photo?code=${code}&team=tzzzzzzzz`))).status).toBe(404)

    let s = await call({ action: 'state', ...omar })
    expect(s.json.teams).toEqual([expect.objectContaining({ id: 'tabc12345', nickname: 'Liners', photoV: 1, submitted: false })])
    expect(s.json.members.map((m: { teamId: string }) => m.teamId)).toEqual(['tabc12345', 'tabc12345'])
    expect(JSON.stringify(s.json)).not.toContain('token_hash')
    expect(JSON.stringify(s.json)).not.toContain(jpeg)

    await call({ action: 'setStage', ...t, phase: 'post' })
    expect((await call({ action: 'submitPost', ...omar, answers: { r1: 2 }, secs: 300, auto: 3 })).status).toBe(200)
    expect((await call({ action: 'submitPost', ...rana, answers: { r1: 0 }, secs: 310, auto: 0 })).status).toBe(409)
    expect((await call({ action: 'joinTeam', ...rana, teamId: null })).status).toBe(409)

    expect((await call({ action: 'mark', ...t, key: 'post_tabc12345', items: { ca4: 4 } })).status).toBe(200)
    expect((await call({ action: 'mark', ...t, key: 'post_tabc12345', items: { ca4: 5 } })).status).toBe(200)
    const ts = await call({ action: 'state', ...t })
    expect(ts.json.trainer.post).toEqual([expect.objectContaining({ teamId: 'tabc12345', answers: { r1: 2 }, submittedBy: 'Omar', secs: 300 })])
    expect(ts.json.trainer.marks).toEqual([{ key: 'post_tabc12345', items: { ca4: 5 } }])

    const board = { teams: [{ id: 'tabc12345', rank: 1 }] }
    await call({ action: 'publish', ...t, board })
    s = await call({ action: 'state', ...rana })
    expect(s.json.class.board).toBeNull()
    await call({ action: 'setStage', ...t, phase: 'results' })
    s = await call({ action: 'state', ...rana })
    expect(s.json.class.board).toEqual(board)
  })
  it('reset removes participants and teams, which ends their sessions', async () => {
    const { code, trainerKey } = await newClass()
    const rana = await joinAs(code, 'Rana')
    await call({ action: 'setStage', code, trainerKey, phase: 'teams' })
    await call({ action: 'createTeam', ...rana, teamId: 'tabc12345', nickname: 'Liners' })
    expect((await call({ action: 'reset', code, trainerKey })).status).toBe(200)
    expect(db.tables.arena_teams).toHaveLength(0)
    expect((await call({ action: 'state', ...rana })).status).toBe(401)
    const s = await call({ action: 'state', code, trainerKey })
    expect(s.json.class).toMatchObject({ phase: 'lobby', reveal: false, board: null })
  })
})

describe('arena groups set by the trainer', () => {
  it('creates groups, splits the class, moves people and locks teams', async () => {
    const { code, trainerKey } = await newClass()
    const t = { code, trainerKey }
    const people = await Promise.all(['Rana', 'Omar', 'Lina', 'Sami', 'Dana'].map(n => joinAs(code, n)))
    expect((await call({ action: 'createGroups', ...people[0], names: ['X'] })).status).toBe(403)
    expect((await call({ action: 'splitTeams', ...t })).status).toBe(409)
    expect((await call({ action: 'createGroups', ...t, names: ['Group 1', 'Group 2'] })).status).toBe(200)
    expect(db.tables.arena_teams.map(r => r.nickname)).toEqual(['Group 1', 'Group 2'])
    const split = await call({ action: 'splitTeams', ...t })
    expect(split.json.placed).toBe(5)
    const sizes = db.tables.arena_teams.map(tm => db.tables.arena_participants.filter(p => p.team_id === tm.id).length).sort()
    expect(sizes).toEqual([2, 3])

    const [g1, g2] = db.tables.arena_teams.map(r => r.id as string)
    expect((await call({ action: 'assign', ...t, pid: people[0].pid, teamId: g2 })).status).toBe(200)
    expect(db.tables.arena_participants.find(p => p.id === people[0].pid)!.team_id).toBe(g2)

    await call({ action: 'setStage', ...t, phase: 'teams' })
    expect((await call({ action: 'setLock', ...t, locked: true })).status).toBe(200)
    expect((await call({ action: 'state', ...people[1] })).json.class.teamsLocked).toBe(true)
    expect((await call({ action: 'joinTeam', ...people[0], teamId: g1 })).status).toBe(409)
    expect((await call({ action: 'createTeam', ...people[0], teamId: 'tnewteam1', nickname: 'Solo' })).status).toBe(409)
    // members can still name their group and add a photo while locked
    expect((await call({ action: 'updateTeam', ...people[0], nickname: 'Hawks', photo: 'data:image/jpeg;base64,/9j/4AAQ' })).status).toBe(200)
    const s = await call({ action: 'state', ...people[0] })
    expect(s.json.teams.find((x: { id: string }) => x.id === g2)).toMatchObject({ nickname: 'Hawks', photoV: 1 })

    await call({ action: 'setLock', ...t, locked: false })
    expect((await call({ action: 'joinTeam', ...people[0], teamId: g1 })).status).toBe(200)
  })
  it('refuses to move members of a team that has submitted', async () => {
    const { code, trainerKey } = await newClass()
    const t = { code, trainerKey }
    const rana = await joinAs(code, 'Rana')
    await call({ action: 'createGroups', ...t, names: ['Group 1', 'Group 2'] })
    const [g1, g2] = db.tables.arena_teams.map(r => r.id as string)
    await call({ action: 'assign', ...t, pid: rana.pid, teamId: g1 })
    await call({ action: 'setStage', ...t, phase: 'post' })
    await call({ action: 'submitPost', ...rana, answers: { r1: 2 }, secs: 10, auto: 1 })
    expect((await call({ action: 'assign', ...t, pid: rana.pid, teamId: g2 })).status).toBe(409)
    expect((await call({ action: 'updateTeam', ...rana, nickname: 'Late' })).status).toBe(409)
  })
})
