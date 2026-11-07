/* Benchmark CLI. Run with:
 *   npx vite-node --config vitest.config.ts tools/benchmark/run.ts -- <command> [flags]
 * Commands: run | review | report. See tools/benchmark/README.md. */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createAnthropicComplete, DEFAULT_AGENT_MODEL } from '@/agents/llm'
import { FIXTURES, type BenchFixture } from './fixtures'
import { parseVariant, type BenchRecord, type PricingFile } from './metrics'
import { fakeBackend, liveBackend, runAnalystJob, runCoachJob } from './runner'
import { buildReviewItems, leaksModelName, renderFixtureReviewHtml, renderReviewHtml } from './review'
import { buildReport, summarizeReview, type ReviewKey } from './report'

const CANDIDATE = 'claude-haiku-5-5'
const OUT_ROOT = join('tools', 'benchmark', 'out')

function args() {
  const raw = process.argv.slice(2).filter(a => a !== '--')
  const flags: Record<string, string | true> = {}
  const pos: string[] = []
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith('--')) {
      const k = raw[i].slice(2), next = raw[i + 1]
      if (next !== undefined && !next.startsWith('--')) { flags[k] = next; i++ } else flags[k] = true
    } else pos.push(raw[i])
  }
  return { cmd: pos[0], flags }
}

function select(only: string | true | undefined, limit: number | null): BenchFixture[] {
  let f = FIXTURES
  if (typeof only === 'string') {
    const [k, v] = only.includes('=') ? only.split('=') : ['id', only]
    const vals = v.split('|')
    f = f.filter(x => (k === 'id' ? vals.includes(x.id) : String((x as unknown as Record<string, unknown>)[k]) && vals.includes(String((x as unknown as Record<string, unknown>)[k]))))
  }
  return limit ? f.slice(0, limit) : f
}

function loadRecords(dir: string): BenchRecord[] {
  const out: BenchRecord[] = []
  for (const name of ['analyst.jsonl', 'coach.jsonl']) {
    const p = join(dir, name)
    if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split('\n')) if (line.trim()) out.push(JSON.parse(line))
  }
  return out
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) await fn(items[i++]) }))
}

async function run(flags: Record<string, string | true>) {
  const models = (typeof flags.models === 'string' ? flags.models : `${DEFAULT_AGENT_MODEL},${CANDIDATE}`).split(',')
  if (models.length < 2) throw new Error('--models needs at least two comma-separated entries: the baseline first, then one or more candidates')
  const dry = flags['dry-run'] === true
  const arms = (typeof flags.arm === 'string' ? flags.arm : 'analyst,coach').split(',')
  const fixtures = select(flags.only, typeof flags.limit === 'string' ? Number(flags.limit) : null)
  const runId = typeof flags['run-id'] === 'string' ? flags['run-id'] : `${dry ? 'dry-' : ''}${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  const dir = join(OUT_ROOT, runId)
  mkdirSync(dir, { recursive: true })

  if (!dry && !process.env.ANTHROPIC_API_KEY) { try { process.loadEnvFile(typeof flags['env-file'] === 'string' ? flags['env-file'] : '.env.local') } catch { /* no file */ } }
  const key = process.env.ANTHROPIC_API_KEY
  if (!dry && !key) throw new Error('ANTHROPIC_API_KEY is not set (checked the environment and .env.local). Use --dry-run to test without a key.')
  const backend = dry ? fakeBackend() : liveBackend(key!)

  const requestsPlanned = fixtures.length * models.length * arms.length
  console.log(`Run ${runId}: ${fixtures.length} fixtures x ${models.length} models x [${arms.join(', ')}] = ${requestsPlanned} sessions (each may use one retry).${dry ? ' DRY RUN: no API calls.' : ''}`)

  if (!dry) {
    // Fail before spending anything if a model id is rejected.
    for (const m of models) {
      let status: number | null = null
      const v = parseVariant(m)
      await createAnthropicComplete(key!, {
        model: v.model, onUsage: u => { status = u.status },
        extraBody: v.effort ? { output_config: { effort: v.effort } } : undefined,
      })({ system: 'Reply with the single word ok.', prompt: 'ok', maxTokens: 300 })
      if (status !== 200) throw new Error(`Preflight failed for "${m}" (HTTP ${status ?? 'no response'}). Nothing was spent beyond this one tiny request. Check the model id, the setting and your access.`)
      console.log(`  preflight ok: ${m}`)
    }
  }

  const done = new Set(loadRecords(dir).map(r => `${r.arm}|${r.model}|${r.fixtureId}`))
  const jobs: { arm: 'analyst' | 'coach'; model: string; f: BenchFixture }[] = []
  for (const f of fixtures) for (const arm of arms as ('analyst' | 'coach')[]) for (const model of models)
    if (!done.has(`${arm}|${model}|${f.id}`)) jobs.push({ arm, model, f })
  console.log(`  ${jobs.length} jobs to run (${requestsPlanned - jobs.length} already done).`)

  let n = 0
  await pool(jobs, dry ? 8 : Math.max(1, Number(flags.concurrency ?? 2)), async j => {
    const rec = j.arm === 'analyst' ? await runAnalystJob(backend, j.model, j.f) : await runCoachJob(backend, j.model, j.f)
    if (rec) appendFileSync(join(dir, `${j.arm}.jsonl`), JSON.stringify(rec) + '\n')
    if (++n % 20 === 0) console.log(`  ${n}/${jobs.length}`)
  })

  let sha = 'unknown'
  try { sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() } catch { /* not fatal */ }
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ runId, models, arms, fixtures: fixtures.length, dry, gitSha: sha, finishedAt: new Date().toISOString() }, null, 2))
  console.log(`Done. Results in ${dir}`)
}

function review(flags: Record<string, string | true>) {
  const dir = join(OUT_ROOT, String(flags.run))
  const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')) as { models: string[] }
  const pair = pickPair(meta.models, flags.candidate)
  const items = buildReviewItems(loadRecords(dir), FIXTURES, pair, Number(flags['per-arm'] ?? 30))
  const html = renderReviewHtml(items, FIXTURES)
  if (leaksModelName(html, meta.models)) throw new Error('Refusing to write: the review form contains a model name.')
  writeFileSync(join(dir, 'review.html'), html, 'utf8')
  writeFileSync(join(dir, 'review-pair.json'), JSON.stringify(pair))
  const key: ReviewKey[] = items.map(({ itemId, arm, fixtureId, isArabic, aModel, bModel }) => ({ itemId, arm, fixtureId, isArabic, aModel, bModel }))
  writeFileSync(join(dir, 'review-key.json'), JSON.stringify(key, null, 2))
  console.log(`Review form: ${join(dir, 'review.html')} (${items.length} items). Send ONLY that file to the reviewer. Keep review-key.json to yourself until scoring is complete.`)
}

function pickPair(models: string[], candidate: string | true | undefined): [string, string] {
  const cands = models.slice(1)
  if (typeof candidate === 'string') {
    if (!cands.includes(candidate)) throw new Error(`--candidate must be one of: ${cands.join(', ')}`)
    return [models[0], candidate]
  }
  if (cands.length > 1) throw new Error(`This run has several candidates. Pass --candidate with one of: ${cands.join(', ')}`)
  return [models[0], cands[0]]
}

function report(flags: Record<string, string | true>) {
  const dir = join(OUT_ROOT, String(flags.run))
  const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')) as { models: string[]; runId: string }
  const pricing = JSON.parse(readFileSync(join('tools', 'benchmark', 'pricing.json'), 'utf8')) as PricingFile
  const records = loadRecords(dir)
  const candidates = typeof flags.candidate === 'string' ? [flags.candidate] : meta.models.slice(1)
  for (const cand of candidates) {
    const pair = pickPair(meta.models, cand)
    let rev = null
    if (typeof flags.review === 'string' && existsSync(join(dir, 'review-pair.json')) && JSON.parse(readFileSync(join(dir, 'review-pair.json'), 'utf8'))[1] === cand) {
      const key = JSON.parse(readFileSync(join(dir, 'review-key.json'), 'utf8')) as ReviewKey[]
      rev = summarizeReview(readFileSync(flags.review, 'utf8'), key, pair)
    }
    const out = buildReport({ records, fixtures: FIXTURES, models: pair, pricing, review: rev, runId: meta.runId })
    const name = `REPORT-${cand.replace(/[^a-z0-9.=-]+/gi, '_')}.md`
    writeFileSync(join(dir, name), out.markdown, 'utf8')
    writeFileSync(join(dir, name.replace('.md', '.json').replace('REPORT', 'summary')), JSON.stringify(out.stats, null, 2))
    console.log(`${cand}: ${out.decision.recommendation}  (${join(dir, name)})`)
  }
}

function fixtures() {
  mkdirSync(OUT_ROOT, { recursive: true })
  const p = join(OUT_ROOT, 'fixture-check.html')
  writeFileSync(p, renderFixtureReviewHtml(FIXTURES.filter(f => f.mix !== 'en')), 'utf8')
  console.log(`Fixture check sheet (40 Arabic fixtures): ${p}`)
}

const { cmd, flags } = args()
const go = cmd === 'run' ? run(flags) : cmd === 'review' ? Promise.resolve(review(flags)) : cmd === 'report' ? Promise.resolve(report(flags)) : cmd === 'fixtures' ? Promise.resolve(fixtures()) : Promise.reject(new Error('Usage: run | review | report | fixtures'))
go.catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
