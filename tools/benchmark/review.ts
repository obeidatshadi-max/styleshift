import type { BenchFixture } from './fixtures'
import { toSession } from './fixtures'
import { rng, type AnalystRecord, type BenchRecord, type CoachRecord } from './metrics'

/** Criteria the reviewer scores 1-5 for each output (N/A allowed). */
export const CRITERIA = [
  ['accuracy', 'Accuracy: does it describe what really happened?'],
  ['grounding', 'Evidence grounding: do the quotes really support each point?'],
  ['insight', 'Behavioral insight: does it notice what matters about the rep\'s behavior?'],
  ['usefulness', 'Coaching usefulness: could the rep act on it? (coach items)'],
  ['specificity', 'Specificity: concrete to this conversation, not generic?'],
  ['iraqi', 'Iraqi Arabic understanding: are colloquial and mixed Arabic/English phrases read correctly? (Arabic items)'],
] as const

export interface ReviewItem {
  itemId: string
  arm: 'analyst' | 'coach'
  fixtureId: string
  isArabic: boolean
  /** Hidden in the form, written only to the key file. */
  aModel: string
  bModel: string
  a: string
  b: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function renderAnalyst(r: AnalystRecord): string {
  if (r.observations.length === 0) return '(no observations produced)'
  return r.observations.map((o, i) =>
    `${i + 1}. [${o.competency}] ${o.behavior} (${o.direction})\n   ${o.observation}\n   ` +
    o.evidence.map(e => `turn ${e.turnIndex} ${e.role}: «${e.quote}»`).join('\n   '),
  ).join('\n')
}

function renderCoach(r: CoachRecord): string {
  if (r.coaching.length === 0) return '(no coaching produced)'
  return r.coaching.map(c =>
    `${c.priority}. ${c.kind === 'improve' ? 'IMPROVE' : 'BUILD ON'}: ${c.behavior}\n` +
    `   What happened: ${c.whatHappened}\n   Why it matters: ${c.whyItMattered}\n   Do differently: ${c.whatToDoDifferently}\n` +
    `   Better response: ${c.betterResponseExample}\n   Practice: ${c.practiceAction}`,
  ).join('\n\n')
}

/** Pairs the two models' outputs for the same fixture, in a seeded random A/B
 * order, and picks a stratified sample so the reviewer's time goes to a spread
 * of styles and languages. Items where either model failed are skipped: a
 * failure is a reliability result, not something to rate. */
export function buildReviewItems(
  records: BenchRecord[], fixtures: BenchFixture[], models: [string, string], perArm: number, seed = 20261107,
): ReviewItem[] {
  const rand = rng(seed)
  const items: ReviewItem[] = []
  for (const arm of ['analyst', 'coach'] as const) {
    const usable: { f: BenchFixture; x: BenchRecord; y: BenchRecord }[] = []
    for (const f of fixtures) {
      const x = records.find(r => r.arm === arm && r.fixtureId === f.id && r.model === models[0] && r.finalStatus === 'ok')
      const y = records.find(r => r.arm === arm && r.fixtureId === f.id && r.model === models[1] && r.finalStatus === 'ok')
      if (x && y) usable.push({ f, x, y })
    }
    // Arabic-heavy sample: two thirds Arabic, one third English, shuffled with the seed.
    const shuffle = <T,>(a: T[]) => a.map(v => [rand(), v] as const).sort((p, q) => p[0] - q[0]).map(p => p[1])
    const ar = shuffle(usable.filter(u => u.f.mix !== 'en')), en = shuffle(usable.filter(u => u.f.mix === 'en'))
    const nAr = Math.min(ar.length, Math.round(perArm * 2 / 3))
    const picked = shuffle([...ar.slice(0, nAr), ...en.slice(0, perArm - nAr)])
    picked.forEach((u, i) => {
      const swap = rand() < 0.5
      const [a, b] = swap ? [u.y, u.x] : [u.x, u.y]
      const render = (r: BenchRecord) => r.arm === 'analyst' ? renderAnalyst(r) : renderCoach(r)
      items.push({
        itemId: `${arm === 'analyst' ? 'AN' : 'CO'}-${String(i + 1).padStart(2, '0')}`, arm, fixtureId: u.f.id,
        isArabic: u.f.mix !== 'en', aModel: a.model, bModel: b.model, a: render(a), b: render(b),
      })
    })
  }
  return items
}

/** A self-contained form. It never contains a model name. Scores are kept in
 * the browser and exported to CSV with one button. */
export function renderReviewHtml(items: ReviewItem[], fixtures: BenchFixture[]): string {
  const byId = new Map(fixtures.map(f => [f.id, f]))
  const sel = (name: string) =>
    `<select name="${name}" aria-label="${name}"><option value="">–</option>${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}<option value="NA">N/A</option></select>`
  const side = (label: 'A' | 'B', text: string, id: string) => `
    <div class="out"><h4>Output ${label}</h4><pre dir="auto">${esc(text)}</pre>
    <table>${CRITERIA.map(([k, q]) => `<tr><td>${esc(q)}</td><td>${sel(`${id}|${label}|${k}`)}</td></tr>`).join('')}</table></div>`
  const blocks = items.map(it => {
    const f = byId.get(it.fixtureId)!
    const t = toSession(f).transcript.map(x => `[${x.turnIndex} ${x.role}] ${x.text}`).join('\n')
    return `<section class="item" id="${it.itemId}">
  <h3>${it.itemId} <span>${it.arm === 'analyst' ? 'Behavior analysis' : 'Coaching'}${it.isArabic ? ' · Arabic' : ''}</span></h3>
  <details open><summary>Transcript</summary><pre dir="auto">${esc(t)}</pre></details>
  <div class="pair">${side('A', it.a, it.itemId)}${side('B', it.b, it.itemId)}</div>
  <p>Overall preference: ${['A', 'B', 'Tie'].map(v => `<label><input type="radio" name="${it.itemId}|pref" value="${v}"> ${v}</label>`).join(' ')}</p>
  <p><input name="${it.itemId}|note" placeholder="Optional note (what was wrong or good)" size="70"></p>
</section>`
  }).join('\n')

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StyleShift blind review</title>
<style>
body{font:15px/1.5 system-ui,Segoe UI,sans-serif;margin:0 auto;max-width:1200px;padding:16px;color:#1b2430;background:#f6f7f9}
.item{background:#fff;border:1px solid #d5dae1;border-radius:8px;padding:14px 18px;margin:18px 0}
h3 span{font-weight:400;color:#566277;font-size:13px;margin-left:8px}
pre{white-space:pre-wrap;background:#f1f3f6;padding:10px;border-radius:6px;font:14px/1.5 system-ui,Segoe UI,sans-serif}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:800px){.pair{grid-template-columns:1fr}}
td{padding:2px 6px 2px 0;font-size:13px;vertical-align:top}
.bar{position:sticky;top:0;background:#fff;border-bottom:1px solid #d5dae1;padding:10px 0;z-index:5}
button{font:inherit;padding:6px 14px}
</style></head><body>
<div class="bar"><b>Blind review.</b> You do not know which model wrote A or B. Score each output 1 (poor) to 5 (excellent), or N/A when a question does not apply.
Your answers stay in this browser. When finished, press <button id="export">Export CSV</button> and send the file back. <span id="count"></span></div>
<p>Read the transcript first. Judge only what the output says about this conversation. For Arabic items, judge whether Iraqi wording and Arabic/English mixes are understood as a native speaker would.</p>
${blocks}
<script>
const K='ss-blind-review-v1';let st={};try{st=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){}
const els=[...document.querySelectorAll('select,input[type=radio],input[name$="|note"]')];
els.forEach(e=>{const k=e.type==='radio'?e.name:e.name;if(e.type==='radio'){if(st[k]===e.value)e.checked=true}else if(st[k]!==undefined)e.value=st[k];
e.addEventListener('change',save);e.addEventListener('input',save)});
function save(){els.forEach(e=>{if(e.type==='radio'){if(e.checked)st[e.name]=e.value}else st[e.name]=e.value});try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}
const done=new Set(Object.keys(st).filter(k=>k.endsWith('|pref')&&st[k]));document.getElementById('count').textContent=done.size+' of ${items.length} items have a preference'}
document.getElementById('export').onclick=()=>{
const rows=[['item','side','criterion','score']];
for(const k of Object.keys(st)){const p=k.split('|');if(p.length===3&&st[k])rows.push([p[0],p[1],p[2],st[k]]);
if(p[1]==='pref'&&st[k])rows.push([p[0],'-','preference',st[k]]);if(p[1]==='note'&&st[k])rows.push([p[0],'-','note',st[k]])}
const csv='\\ufeff'+rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\\n');
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='review-scored.csv';document.body.appendChild(a);a.click()};
save();
</script></body></html>`
}

/** What the evaluator-facing file must never contain. Used by tests. */
export function leaksModelName(html: string, models: string[]): boolean {
  return models.some(m => html.includes(m))
}
