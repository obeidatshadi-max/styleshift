// Validates the Iraq scenario pack invariants. Run: npx -y tsx scripts/validate-iraq-pack.ts
// game-data.ts / game-data-ar.ts only have type-only imports, so importing them
// here pulls no path-alias runtime dependency.
import { L1, L2, L3, L4 } from '../src/lib/game-data'
import { L1_AR, L2_AR, L3_AR, L4_AR } from '../src/lib/game-data-ar'

const BLOCKS = { L1: [1101, 1108], L2: [1201, 1208], L3: [1301, 1308], L4: [1401, 1408] }
const errors: string[] = []
const ok: string[] = []

function idsInBlock<T extends { id: number }>(arr: readonly T[], lo: number, hi: number) {
  return arr.filter(x => x.id >= lo && x.id <= hi)
}
function styleCounts(arr: readonly { style?: string }[]) {
  const c: Record<string, number> = { driver: 0, expressive: 0, amiable: 0, analytical: 0 }
  for (const x of arr) if (x.style && x.style in c) c[x.style]++
  return c
}

// L1 / L2 / L3: 8 items, style-balanced 2/2/2/2
for (const [lvl, arr] of [['L1', L1], ['L2', L2], ['L3', L3]] as const) {
  const [lo, hi] = BLOCKS[lvl]
  const pack = idsInBlock(arr as readonly { id: number; style?: string }[], lo, hi)
  if (pack.length !== 8) { errors.push(`${lvl}: expected 8 Iraq items, found ${pack.length}`); continue }
  const counts = styleCounts(pack)
  const balanced = ['driver', 'expressive', 'amiable', 'analytical'].every(k => counts[k] === 2)
  if (!balanced) errors.push(`${lvl}: not 2/2/2/2 balanced -> ${JSON.stringify(counts)}`)
  else ok.push(`${lvl}: 8 items, balanced 2/2/2/2`)
}

// L2: exactly one 'win' per item
for (const it of idsInBlock(L2, ...BLOCKS.L2 as [number, number])) {
  const wins = it.opts.filter(o => o.r === 'win').length
  if (wins !== 1) errors.push(`L2 ${it.id}: expected exactly one 'win', found ${wins}`)
}
// L3: exactly one correct per item
for (const it of idsInBlock(L3, ...BLOCKS.L3 as [number, number])) {
  const cor = it.opts.filter(o => o.correct).length
  if (cor !== 1) errors.push(`L3 ${it.id}: expected exactly one correct, found ${cor}`)
}
// L4: 8 items, each 3 opts, unique single best by quota+morale-risk
{
  const pack = idsInBlock(L4, ...BLOCKS.L4 as [number, number])
  if (pack.length !== 8) errors.push(`L4: expected 8 Iraq items, found ${pack.length}`)
  else ok.push('L4: 8 items')
  for (const it of pack) {
    if (it.opts.length !== 3) errors.push(`L4 ${it.id}: expected 3 opts, found ${it.opts.length}`)
    const scores = it.opts.map(o => o.quota + o.morale - o.risk)
    const max = Math.max(...scores)
    if (scores.filter(s => s === max).length !== 1) errors.push(`L4 ${it.id}: best option is not unique`)
  }
}

// AR parity: every Iraq id in EN exists in AR
const pairs = [['L1', L1, L1_AR], ['L2', L2, L2_AR], ['L3', L3, L3_AR], ['L4', L4, L4_AR]] as const
for (const [lvl, en, ar] of pairs) {
  const [lo, hi] = BLOCKS[lvl as keyof typeof BLOCKS]
  const arIds = new Set(idsInBlock(ar as readonly { id: number }[], lo, hi).map(x => x.id))
  for (const it of idsInBlock(en as readonly { id: number }[], lo, hi)) {
    if (!arIds.has(it.id)) errors.push(`${lvl} ${it.id}: missing Arabic mirror`)
  }
}

for (const o of ok) console.log('OK  ', o)
if (errors.length) { console.error('\nFAILURES:'); for (const e of errors) console.error('  X', e); process.exit(1) }
console.log('\nAll Iraq pack invariants pass.')
