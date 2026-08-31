# SPS Onboarding Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port SPS Style's 16-question sales-behavior assessment into StyleShift as a mandatory, DB-persisted first-run onboarding step, so a rep's SPS profile lives on their StyleShift `profiles` row and shows up on the manager dashboard — without touching `spstyle.netlify.app`, which keeps running standalone as its own diagnostic-as-a-service product.

**Architecture:** Follow the codebase's existing `X-core.ts` (pure logic, vitest-tested) + `X-data.ts` / `X-data-ar.ts` (bilingual content) + thin client component pattern already used for scenarios (`scenario-engine.ts`) and leagues (`leagues-core.ts`). The scoring engine is a pure function ported 1:1 from `spstyle`'s `self/index.html` `showResults()` math. Content (questions, profiles) is copied verbatim from the live source — `spstyle` stays the canonical copy of that content going forward; this plan's data files are a point-in-time port, not a live link.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + RLS), Vitest.

**Spec:** No standalone spec doc — this plan implements the "Fold in SPS Style" step from the portfolio consolidation decision reached in conversation on 2026-08-31 (comparing SPS Style, Social Style Mastery, and StyleShift, and choosing StyleShift as the surviving chassis). Source content ported from `C:\Users\shadi\Desktop\AI APP 2026\sps-style\self\index.html` (the live, Supabase-backed assessment — not the legacy `SPS_assessment_bilingual.html` fork).

## Global Constraints

- `spstyle.netlify.app` / `self/index.html` is NOT modified by this plan and keeps running standalone. This plan only copies content out of it.
- Scoring math must match `self/index.html`'s `showResults()` exactly: 14 style questions + 2 compliance questions, dominant style = highest count with tie-break order `go > connect > plan > support`, margin/balanced/compliance-risk formulas as ported in Task 1.
- Out of scope for this pass (do not build): the per-category "situational pattern" breakdown, the PDF export, and the legacy `SPS_assessment_bilingual.html` fork. Only the core scoring result, the dominant-profile report, and the Opposing Force card are ported — those are the pieces that carry decision-relevant signal for the rep and the manager.
- Bilingual EN/AR throughout, following the existing flat-key `t()` dictionary pattern in `src/lib/i18n.tsx` for UI chrome, and the `X-data.ts`/`X-data-ar.ts` split (see `game-data.ts`/`game-data-ar.ts`) for question/profile content.
- No new RLS policies are needed — `sps_top_key`/`sps_profile` live on the existing `public.profiles` row, already covered by the "own profile update", "own profile read", and "manager profiles read" policies from `001_initial_schema.sql`.
- Follow existing inline-style convention (CSS custom properties like `var(--cyan)`, `var(--panel)`, `var(--line)`, `var(--mono)`, `var(--sans)`) — no Tailwind, no new CSS files. Mirror `HowItWorks.tsx`'s structure for the assessment screen.

---

## Task 1: SPS scoring core

**Files:**
- Create: `src/lib/sps-core.ts`
- Test: `src/lib/sps-core.test.ts`

**Interfaces:**
- Produces: `SpsKey` (`'go'|'connect'|'plan'|'support'`), `SpsQuestionSpec`, `SPS_QUESTIONS: SpsQuestionSpec[]` (16 entries), `SPS_OPPOSITE: Record<SpsKey, SpsKey>`, `SpsResult`, `scoreSps(answers: number[]): SpsResult` — every later task imports these exact names from `@/lib/sps-core`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/sps-core.test.ts
import { describe, it, expect } from 'vitest'
import { scoreSps, SPS_OPPOSITE } from './sps-core'

describe('scoreSps', () => {
  it('picks the dominant style, flags a strong margin, and reads compliance risk as elevated when every answer is A', () => {
    const answers = new Array(16).fill(0) // option A on every question = "go" on all 14 style Qs, risk 2 on both compliance Qs
    const r = scoreSps(answers)
    expect(r.scores).toEqual({ go: 14, connect: 0, plan: 0, support: 0 })
    expect(r.styleTotal).toBe(14)
    expect(r.topKey).toBe('go')
    expect(r.margin).toBe(14)
    expect(r.marginLevel).toBe('strong')
    expect(r.balanced).toBe(false)
    expect(r.complianceRisk).toBe(4)
    expect(r.complianceMax).toBe(4)
    expect(r.complianceLevel).toBe('elevated')
    expect(r.oppositeKey).toBe(SPS_OPPOSITE['go'])
    expect(r.oppositeKey).toBe('support')
  })

  it('detects a balanced, flexible profile with low compliance risk', () => {
    const answers = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 2, 2, 0, 1]
    // non-compliance picks (idx 0-11, 14-15): go x4, connect x4, plan x3, support x3
    // compliance picks (idx 12-13): both "C" -> risk 0
    const r = scoreSps(answers)
    expect(r.scores).toEqual({ go: 4, connect: 4, plan: 3, support: 3 })
    expect(r.styleTotal).toBe(14)
    expect(r.topKey).toBe('go') // tie at 4, "go" wins the order tie-break
    expect(r.margin).toBe(0)
    expect(r.marginLevel).toBe('flexible')
    expect(r.balanced).toBe(true) // sorted[0]-sorted[3] = 4-3 = 1 <= 3
    expect(r.complianceRisk).toBe(0)
    expect(r.complianceLevel).toBe('low')
  })

  it('reads a margin of exactly 3 as moderate, not strong, and as not balanced', () => {
    const answers = [0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3]
    // non-compliance (idx 0-11,14,15): go x6, connect x3, plan x3, support x2
    const r = scoreSps(answers)
    expect(r.scores).toEqual({ go: 6, connect: 3, plan: 3, support: 2 })
    expect(r.topKey).toBe('go')
    expect(r.margin).toBe(3) // 6 - 3
    expect(r.marginLevel).toBe('moderate')
    expect(r.balanced).toBe(false) // 6 - 2 = 4 > 3
  })

  it('reads a compliance risk of exactly 2 as moderate, not elevated', () => {
    const answers = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0]
    // compliance idx 12 -> option A (risk 2), idx 13 -> option C (risk 0) => total risk 2
    const r = scoreSps(answers)
    expect(r.complianceRisk).toBe(2)
    expect(r.complianceMax).toBe(4)
    expect(r.complianceLevel).toBe('moderate')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sps-core`
Expected: FAIL — `Cannot find module './sps-core'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/sps-core.ts

export type SpsKey = 'go' | 'connect' | 'plan' | 'support'

// Option order is always A=go, B=connect, C=plan, D=support across every
// question in the source assessment (self/index.html) — this is what lets
// scoring be driven purely by "which option index was picked" per question.
const KEY_ORDER: SpsKey[] = ['go', 'connect', 'plan', 'support']

export interface SpsQuestionSpec {
  /** True for the 2 Compliance & Ethics questions, scored separately from style. */
  compliance: boolean
  /** Present only when `compliance` is true: risk value (0-2) for options A-D. */
  risks?: [number, number, number, number]
}

// 16 questions, index-aligned with SPS_QUESTIONS_EN / SPS_QUESTIONS_AR in
// sps-data.ts / sps-data-ar.ts (which carry the display text for each index).
// Order: Selling Approach x2, Territory Management x2, Under Pressure x2,
// Scientific Knowledge x2, Teamwork x2, Customer Relationships x2,
// Compliance & Ethics x2, Mindset & Values x2 — same order as the source.
export const SPS_QUESTIONS: SpsQuestionSpec[] = [
  { compliance: false }, { compliance: false }, // Selling Approach
  { compliance: false }, { compliance: false }, // Territory Management
  { compliance: false }, { compliance: false }, // Under Pressure
  { compliance: false }, { compliance: false }, // Scientific Knowledge
  { compliance: false }, { compliance: false }, // Teamwork
  { compliance: false }, { compliance: false }, // Customer Relationships
  { compliance: true, risks: [2, 1, 0, 0] },     // Compliance & Ethics 1
  { compliance: true, risks: [2, 1, 0, 0] },     // Compliance & Ethics 2
  { compliance: false }, { compliance: false }, // Mindset & Values
]

// Diagonal-opposite quadrant on the Result/Process x Business/People grid.
export const SPS_OPPOSITE: Record<SpsKey, SpsKey> = {
  go: 'support', support: 'go', connect: 'plan', plan: 'connect',
}

export interface SpsResult {
  scores: Record<SpsKey, number>
  styleTotal: number
  topKey: SpsKey
  oppositeKey: SpsKey
  margin: number
  marginLevel: 'strong' | 'moderate' | 'flexible'
  balanced: boolean
  complianceRisk: number
  complianceMax: number
  complianceLevel: 'low' | 'moderate' | 'elevated'
  completedAt: string
}

/**
 * answers[i] = the option index (0-3, A-D) chosen for SPS_QUESTIONS[i].
 * Caller always supplies exactly 16 answers (the UI can't submit otherwise).
 */
export function scoreSps(answers: number[]): SpsResult {
  const scores: Record<SpsKey, number> = { go: 0, connect: 0, plan: 0, support: 0 }
  let styleTotal = 0
  let complianceRisk = 0
  let complianceMax = 0

  SPS_QUESTIONS.forEach((q, i) => {
    const pick = answers[i]
    if (q.compliance) {
      complianceRisk += q.risks![pick]
      complianceMax += 2
    } else {
      scores[KEY_ORDER[pick]]++
      styleTotal++
    }
  })

  const max = Math.max(...KEY_ORDER.map(k => scores[k]))
  const topKey = KEY_ORDER.find(k => scores[k] === max)!
  const sorted = KEY_ORDER.map(k => scores[k]).sort((a, b) => b - a)
  const margin = sorted[0] - sorted[1]
  const marginLevel = margin >= 5 ? 'strong' : margin >= 3 ? 'moderate' : 'flexible'
  const balanced = sorted[0] - sorted[3] <= 3
  const complianceLevel = complianceRisk === 0 ? 'low' : complianceRisk <= 2 ? 'moderate' : 'elevated'

  return {
    scores, styleTotal, topKey, oppositeKey: SPS_OPPOSITE[topKey],
    margin, marginLevel, balanced,
    complianceRisk, complianceMax, complianceLevel,
    completedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sps-core`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/sps-core.ts src/lib/sps-core.test.ts
git commit -m "feat: add SPS scoring core, ported from spstyle self/index.html"
```

---

## Task 2: SPS bilingual content

**Files:**
- Create: `src/lib/sps-data.ts`
- Create: `src/lib/sps-data-ar.ts`

**Interfaces:**
- Consumes: `SpsKey` from `@/lib/sps-core` (Task 1).
- Produces: `SpsQuestionText`, `SPS_QUESTIONS_EN: SpsQuestionText[]`, `SpsProfileText`, `SPS_PROFILES_EN: Record<SpsKey, SpsProfileText>` from `sps-data.ts`; `SPS_QUESTIONS_AR`, `SPS_PROFILES_AR` (same shapes) from `sps-data-ar.ts`. Task 5 imports all four.

- [ ] **Step 1: Create the English content file**

```typescript
// src/lib/sps-data.ts
import type { SpsKey } from './sps-core'

export interface SpsQuestionText {
  category: string
  text: string
  options: [string, string, string, string]
}

// Index-aligned 1:1 with SPS_QUESTIONS in sps-core.ts. Copied verbatim from
// spstyle's self/index.html (questions array, lines 392-568).
export const SPS_QUESTIONS_EN: SpsQuestionText[] = [
  {
    category: 'Selling Approach',
    text: "A senior cardiologist has 4 minutes before their next patient. You've been trying to get face time with them for 2 weeks. You:",
    options: [
      'Jump straight to your key clinical message and close with a specific prescribing request.',
      'Start by asking how their cardiology ward has been performing — build the moment first.',
      'Deliver one precise data point from the most relevant clinical study to their patient profile.',
      'Ask what information would be most helpful to them right now and adapt accordingly.',
    ],
  },
  {
    category: 'Selling Approach',
    text: "During a detail visit, a GP says your competitor's product has fewer side effects in their experience. You:",
    options: [
      'Counter directly — cite your comparative data and push to maintain your prescribing share.',
      'Acknowledge their experience, then explore which patient types might still suit your product.',
      'Ask to understand the specific cases, then walk through the head-to-head safety data methodically.',
      'Thank them for the candid feedback, note it, and follow up with a full safety comparison.',
    ],
  },
  {
    category: 'Territory Management',
    text: 'You are building your call plan for the month. Which approach best describes yours?',
    options: [
      'Prioritise the highest-potential prescribers first — maximum visits to maximum ROI accounts.',
      'Balance high-value targets with regular check-ins on loyal doctors to protect existing share.',
      'Segment all accounts by potential, frequency needs, and product fit — then build an optimised routing plan.',
      'Include a mix of high-potential and underserved accounts — focus on where you can genuinely add value.',
    ],
  },
  {
    category: 'Territory Management',
    text: 'Your district manager reviews your territory and says your coverage of mid-tier accounts is weak. You:',
    options: [
      'Defend your current plan — show the revenue numbers that justify your focus on A-tier accounts.',
      'Discuss it openly with your manager and ask what they\'re seeing that you might be missing.',
      'Review your call data against the targets and build a revised plan with supporting KPIs.',
      'Accept the feedback, identify the mid-tier doctors most in need of support, and adjust your plan.',
    ],
  },
  {
    category: 'Under Pressure',
    text: 'It is the last 5 working days of the quarter and you are 18% below target. You:',
    options: [
      'Go into full sprint mode — double your call rate, prioritise closeable accounts, and chase every opportunity.',
      'Call your most loyal key accounts personally and remind them of your relationship and ongoing support.',
      'Pull your CRM data, identify the accounts with highest prescribing probability, and build a focused plan.',
      "Talk to your manager and team, share your situation honestly, and ask if there's any collaborative support available.",
    ],
  },
  {
    category: 'Under Pressure',
    text: 'You receive a poor performance review despite a full quarter of effort. Your first instinct is to:',
    options: [
      'Channel the frustration into a plan — set new targets and come back stronger next quarter.',
      'Request a one-on-one to understand the perception gap and repair trust with your manager.',
      'Ask for the specific data behind the review — KPIs, call rates, coverage — and audit them yourself.',
      'Reflect on the feedback carefully, identify your blind spots, and seek mentoring or coaching.',
    ],
  },
  {
    category: 'Scientific Knowledge',
    text: "A specialist asks you a clinical question about your product that you can't fully answer in the moment. You:",
    options: [
      'Give the most confident answer you can with available information and follow up later.',
      'Acknowledge you want to give a precise answer, and use the follow-up as a relationship touchpoint.',
      'Tell them clearly you want to verify before answering and send them a detailed, sourced response.',
      'Be transparent about the limit of your knowledge and offer to bring in a medical affairs colleague.',
    ],
  },
  {
    category: 'Scientific Knowledge',
    text: 'You are preparing for a product launch. Your preparation time is mostly spent:',
    options: [
      'Identifying the first 10 priority doctors to target and preparing a compelling commercial pitch.',
      'Mapping your existing relationships — who trusts you, and who could become an early adopter.',
      'Studying the clinical dossier, competitor positioning, and market landscape in full detail.',
      'Preparing clear patient profiling materials and identifying where this product fills a real need.',
    ],
  },
  {
    category: 'Teamwork',
    text: 'Your regional team is behind on a shared KPI. A colleague seems to be struggling. You:',
    options: [
      'Focus on maximising your own numbers — your high performance will carry weight for the team.',
      "Reach out to the colleague and offer support — you're a team and results come from everyone.",
      'Suggest a structured team review: align on the root cause, redistribute activities strategically.',
      'Offer to shadow the colleague for a day — observe, coach, and share best practices directly.',
    ],
  },
  {
    category: 'Teamwork',
    text: 'Your manager introduces a new standardised detailing model for the entire team. You disagree with parts of it. You:',
    options: [
      'Express your disagreement directly — share your results as evidence that your current method works.',
      'Try the new model with an open mind and give feedback based on how doctors respond to it.',
      'Review the evidence or logic behind the new model before deciding whether to raise objections.',
      'Adopt it to maintain team alignment and share constructive observations through proper channels.',
    ],
  },
  {
    category: 'Customer Relationships',
    text: 'A pharmacy that regularly recommended your product has switched to a competitor\'s. You find out it was price-driven. You:',
    options: [
      'Immediately escalate to management and push for a commercial solution to win the account back.',
      "Visit the pharmacist personally — the relationship matters more than one lost transaction.",
      'Analyse the account\'s profitability and strategic importance before deciding on a response.',
      'Offer enhanced support — product training, patient materials — to show value beyond price.',
    ],
  },
  {
    category: 'Customer Relationships',
    text: 'After a successful detail visit, you send your follow-up communication. It typically looks like:',
    options: [
      'Short and focused — confirms the key message, restates the commitment, and sets a next step.',
      'Personal and warm — references something specific from the conversation to show genuine attention.',
      'Detailed and referenced — attaches the study discussed, a summary of key data, and source links.',
      'Open and supportive — thanks them sincerely and invites any further questions or patient queries.',
    ],
  },
  {
    category: 'Compliance & Ethics',
    text: "You realise mid-visit that a visual aid you're using contains a dosing figure that may have changed in the latest label update. You:",
    options: [
      "Continue the visit and address the discrepancy afterwards — you don't want to disrupt your momentum.",
      'Pause, acknowledge the uncertainty to the doctor, and offer to confirm and follow up before they act on it.',
      'Stop using the material immediately, clarify the correct information from your approved resources, and document it.',
      'Apologise for the confusion, set aside the material, and ensure the doctor has accurate guidance before leaving.',
    ],
  },
  {
    category: 'Compliance & Ethics',
    text: "A key prescriber asks you to organise a dinner event that stretches beyond your company's hospitality policy. You:",
    options: [
      'Find a creative way to meet their expectations within the policy — bending the spirit to keep the account.',
      'Explain the limitations honestly and offer an alternative that still strengthens the relationship.',
      'Review the exact policy thresholds, propose a fully compliant alternative, and document the interaction.',
      'Decline the request respectfully, explain the guidelines, and shift focus to educational activities instead.',
    ],
  },
  {
    category: 'Mindset & Values',
    text: 'At the end of a strong year, which achievement would feel most meaningful to you?',
    options: [
      'Ranking #1 in your district and receiving the top performer award at the annual conference.',
      "A specialist telling your manager: 'Your rep is the only one I genuinely look forward to seeing.'",
      'Your territory strategy being adopted by the regional team as the model for planning.',
      'Being asked by your manager to mentor and onboard the next class of new medical reps.',
    ],
  },
  {
    category: 'Mindset & Values',
    text: 'The environment where you perform your absolute best is one where:',
    options: [
      'Targets are ambitious, competition is visible, and high performance is publicly recognised.',
      'Trust flows in both directions, relationships are genuinely valued, and collaboration is the culture.',
      'Processes are clear, expectations are measurable, and decisions are backed by solid data.',
      'People support each other, learning is encouraged, and the impact on patients is front of mind.',
    ],
  },
]

export interface SpsProfileText {
  name: string
  orient: string
  color: string
  gradient: string
  traits: string[]
  desc: string
  strengths: string[]
  weaknesses: string[]
  motivate: string[]
  develop: string[]
  tip: string
  growth: string
}

// Copied verbatim from spstyle's self/index.html (profiles object, lines 571-624).
export const SPS_PROFILES_EN: Record<SpsKey, SpsProfileText> = {
  go: {
    name: 'The Go-Getter',
    orient: 'Result-Oriented · Business-Oriented',
    color: '#E05A3A',
    gradient: 'linear-gradient(135deg, #E05A3A, #B03820)',
    traits: ['Results-driven', 'Competitive', 'Decisive', 'Target-focused', 'High-energy'],
    desc: 'You are a results-driven force in the field. Highly motivated to achieve and exceed sales targets, you use strategic selling techniques and stay sharply aware of the competitive landscape. You move conversations toward business outcomes quickly and confidently, and you thrive when performance is visible and rewarded.',
    strengths: ['Closing deals under pressure', 'Growing market share in competitive territories', 'Overcoming objections assertively', 'Seizing new business opportunities'],
    weaknesses: ['May prioritise closing over long-term relationship building', 'Risk of aggressive tactics under pressure', 'Can be resistant to feedback not directly tied to results', 'Potential for burnout under sustained target pressure'],
    motivate: ['Ambitious targets with clear performance bonuses', 'Sales contests and public recognition', 'Regular competitive market intelligence', 'Coaching on advanced negotiation and closing skills'],
    develop: ['Relationship management and consultative selling training', 'Mentoring opportunities to build empathy', 'Compliance and ethical selling awareness', 'Involvement in educational events and KOL management'],
    tip: "Practise the 70/30 rule — let the doctor talk 70% of the time. Your most effective pitch almost always follows their most important insight.",
    growth: 'Your commercial drive is exceptional. Now channel it into deeper discovery — understanding what the doctor truly needs before presenting will multiply your conversion rate.',
  },
  connect: {
    name: 'The Connector',
    orient: 'Result-Oriented · People-Oriented',
    color: '#2D8F6A',
    gradient: 'linear-gradient(135deg, #2D8F6A, #1A6A4F)',
    traits: ['Empathetic', 'Relationship-driven', 'Trustworthy', 'Collaborative', 'Perceptive'],
    desc: 'You build trust naturally and create lasting partnerships with healthcare professionals. Doctors and pharmacists look forward to your visits — not just for the product, but for you. You balance sales results with genuine relationship investment, and you excel at understanding customer needs and providing tailored, patient-centred solutions.',
    strengths: ['Customer retention and loyalty management', 'KOL and stakeholder relationship building', 'Long-term brand representation', 'Multi-prescriber account navigation'],
    weaknesses: ['May hesitate to close for fear of damaging rapport', 'Risk of over-investing in a small network', 'Can downplay data and commercial metrics', 'Time management across large relationship portfolios'],
    motivate: ['Opportunities to attend congresses and scientific events', 'Recognition as a brand ambassador', 'Resources for relationship and account management', 'Cross-functional collaboration with marketing and medical'],
    develop: ['CRM tools and territory analytics training', 'Sales forecasting and KPI tracking', 'Assertiveness and closing confidence', 'Structured goal-setting and reporting habits'],
    tip: "After every meaningful conversation, ask: 'Based on what you've shared, would you be willing to try this with your next suitable patient?' Your relationship earns you the right to ask — use it.",
    growth: 'Your trust capital is your greatest commercial asset. The next step is converting that trust into consistent prescribing commitments with clear, confident asks.',
  },
  plan: {
    name: 'The Planner',
    orient: 'Process-Oriented · Business-Oriented',
    color: '#2D6A8F',
    gradient: 'linear-gradient(135deg, #2D6A8F, #1A4F72)',
    traits: ['Analytical', 'Systematic', 'Detail-oriented', 'Methodical', 'Data-driven'],
    desc: 'You bring structure, precision, and scientific credibility to every element of your work. You manage your territory with rigour — monitoring KPIs, tracking progress, and using data to optimise your sales strategy. Physicians and managers trust your thoroughness. You are the person people turn to when a plan needs to be built, not just executed.',
    strengths: ['Territory planning and KPI management', 'Evidence-based detailing and clinical discussions', 'Compliance and adherence to company guidelines', 'Systematic identification of prescribing trends'],
    weaknesses: ['Can over-analyse before acting — slow to adapt', 'Risk of appearing clinical or transactional with customers', 'Discomfort in emotionally charged or unpredictable situations', 'May lose sight of the customer experience behind the data'],
    motivate: ['Access to advanced CRM and analytics platforms', 'Training in sales forecasting and territory optimisation', 'Participation in process improvement projects', 'Clear KPIs and structured reporting frameworks'],
    develop: ['Relationship management and emotional intelligence training', 'Consultative selling — leading with story before data', 'Confidence in spontaneous, unscripted conversations', 'Presenting data in a human, engaging narrative'],
    tip: "Prepare one 'insight opener' per call — a single data point or patient story — and hold the full analysis until the doctor asks for it. Lead with intrigue, follow with evidence.",
    growth: 'Your analytical rigour is a foundation others envy. The growth edge is flexibility — not every conversation needs a structured framework. Let the doctor\'s context shape your approach.',
  },
  support: {
    name: 'The Supporter',
    orient: 'Process-Oriented · People-Oriented',
    color: '#8F4D8A',
    gradient: 'linear-gradient(135deg, #8F4D8A, #6A3570)',
    traits: ['Compassionate', 'Principled', 'Reliable', 'Patient-focused', 'Collaborative'],
    desc: 'You are the backbone of any high-performing team. Your integrity, patience, and genuine care for patients and colleagues build deep, lasting trust with everyone around you. You prioritise compliance, ethical promotion, and educational activities. Healthcare professionals know they can rely on your honesty — and colleagues know you\'ll always show up for them.',
    strengths: ['HCP education and scientific event facilitation', 'Compliance leadership and ethical promotion', 'Internal team support and knowledge sharing', 'Long-cycle relationship selling and patient support programs'],
    weaknesses: ['May deprioritise commercial targets in favour of relationship work', 'Struggles to assert or close in competitive situations', 'Risk of overextending support to others at cost to personal results', 'Can lack urgency when it comes to deal closure'],
    motivate: ['Mentorship and peer-coaching roles', 'Involvement in onboarding new reps', 'Recognition for compliance and ethical performance', 'Opportunities to lead educational or scientific events'],
    develop: ['Assertiveness training and commercial confidence', 'Clear personal targets with accountability checkpoints', 'Sales contest participation to build competitive awareness', 'Advanced negotiation and closing technique coaching'],
    tip: 'At the start of each week, write one commercial goal that is purely yours — a specific account, a prescribing target — and make it visible. Your caring nature will thrive even more when your personal targets are being hit.',
    growth: 'Your values and reliability are a competitive advantage. The development challenge is giving yourself permission to be commercially assertive — patients benefit most when you are also hitting your numbers.',
  },
}
```

- [ ] **Step 2: Create the Arabic content file**

```typescript
// src/lib/sps-data-ar.ts
import type { SpsKey } from './sps-core'
import type { SpsQuestionText, SpsProfileText } from './sps-data'

// Modern Standard Arabic, copied verbatim from spstyle's self/index.html
// (QAR array, lines 743-823). Index-aligned 1:1 with SPS_QUESTIONS_EN.
export const SPS_QUESTIONS_AR: SpsQuestionText[] = [
  { category: 'أسلوب البيع', text: 'طبيب قلبية مهم لديه ٤ دقائق فقط قبل موعد المريض التالي، وأنت تحاول الوصول إليه منذ أسبوعين. ماذا تفعل؟', options: [
    'تدخل مباشرة في رسالتك العلمية الأساسية وتختم بطلب وصف واضح.',
    'تبدأ بسؤاله كيف يسير العمل في قسم القلبية معه — تبني اللحظة أولاً.',
    'تعطيه نقطة بيانات واحدة دقيقة من أهم دراسة علمية تخص حالة مرضاه.',
    'تسأله ما المعلومة الأكثر فائدة له الآن وتتكيّف بناءً على ذلك.'] },
  { category: 'أسلوب البيع', text: 'خلال زيارة، يخبرك طبيب عام أن آثار منتج المنافس الجانبية أقل بحسب تجربته. ماذا تفعل؟', options: [
    'تردّ مباشرة — تعرض بياناتك المقارنة وتدافع عن حصتك في الوصف الطبي.',
    'تتفهّم تجربته، ثم تستكشف أنواع المرضى الذين قد يناسبهم منتجك.',
    'تسأل لتفهم الحالات بالضبط، ثم تستعرض معه بيانات الأمان وجهاً لوجه بطريقة منظمة.',
    'تشكره على صراحته، تسجّل ملاحظته، وتتابعه بمقارنة أمان كاملة.'] },
  { category: 'إدارة المنطقة', text: 'تضع خطة زياراتك للشهر. أي مما يلي أقرب إلى أسلوبك؟', options: [
    'تركّز على أصحاب أعلى احتمال للوصف أولاً — أكثر الزيارات لأكثر الحسابات ربحية.',
    'توازن بين الحسابات عالية القيمة وزيارات منتظمة للأطباء المخلصين حتى تحافظ على حصتك.',
    'تصنّف جميع الحسابات حسب الإمكانية والحاجة ومدى ملاءمة المنتج، ثم تضع خطة طريق مدروسة.',
    'تُبقي على مزيج من حسابات عالية الإمكانية وحسابات مهمَلة — وتركّز حيث تستطيع إضافة قيمة حقيقية.'] },
  { category: 'إدارة المنطقة', text: 'راجع مديرك منطقتك وقال إن تغطيتك للحسابات المتوسطة ضعيفة. ماذا تفعل؟', options: [
    'تدافع عن خطتك — تُظهر له أرقام المبيعات التي تبرر تركيزك على حسابات الدرجة الأولى.',
    'تناقش الأمر معه بصراحة وتسأله عمّا يراه أنك ربما فاتك.',
    'تراجع بيانات زياراتك مقابل الأهداف وتبني خطة معدّلة بمؤشرات داعمة.',
    'تتقبّل الملاحظة، تحدّد الأطباء المتوسطين الأكثر حاجة للدعم، وتعدّل خطتك.'] },
  { category: 'تحت الضغط', text: 'تبقّت ٥ أيام عمل على نهاية الربع وأنت دون الهدف بنسبة ١٨٪. ماذا تفعل؟', options: [
    'تدخل وضع السرعة القصوى — تضاعف زياراتك، تركّز على الحسابات القابلة للإغلاق، وتطارد كل فرصة.',
    'تتصل بأهم حساباتك المخلصة شخصياً وتذكّرهم بعلاقتك ودعمك المستمر.',
    'تسحب بيانات الـCRM، تحدّد الحسابات الأعلى احتمالاً بالوصف، وتبني خطة مركّزة.',
    'تتحدث مع مديرك وفريقك، تشرح وضعك بصراحة، وتسأل إن كان هناك دعم مشترك ممكن.'] },
  { category: 'تحت الضغط', text: 'تصلك مراجعة أداء ضعيفة رغم ربع كامل من الجهد. ما أول ردّ فعل لديك؟', options: [
    'تحوّل الإحباط إلى خطة — تضع أهدافاً جديدة وتعود أقوى في الربع القادم.',
    'تطلب اجتماعاً ثنائياً لفهم فجوة الانطباع وإصلاح الثقة مع مديرك.',
    'تطلب البيانات الدقيقة وراء المراجعة — المؤشرات، معدّل الزيارات، التغطية — وتدققها بنفسك.',
    'تتأمل في الملاحظات بهدوء، تحدّد نقاط ضعفك، وتبحث عن إرشاد أو تدريب.'] },
  { category: 'المعرفة العلمية', text: 'يطرح عليك اختصاصي سؤالاً علمياً عن منتجك لا تستطيع الإجابة عليه بالكامل في اللحظة نفسها. ماذا تفعل؟', options: [
    'تقدّم أوثق إجابة ممكنة بالمعلومات المتوفرة، ثم تتابع لاحقاً.',
    'تخبره أنك تريد تزويده بإجابة دقيقة، وتستغل المتابعة كفرصة تواصل تعزّز العلاقة.',
    'تخبره بوضوح أنك تريد التأكد قبل الإجابة، وترسل له رداً مفصلاً وموثّقاً.',
    'تكون شفافاً بحدود معرفتك وتعرض إحضار زميل من الشؤون الطبية.'] },
  { category: 'المعرفة العلمية', text: 'تستعد لإطلاق منتج جديد. أين يذهب معظم وقت تحضيرك؟', options: [
    'تحدّد أول ١٠ أطباء أولوية تستهدفهم وتجهّز عرضاً تجارياً مقنعاً.',
    'ترسم خريطة علاقاتك الحالية — من يثق بك ومن قد يكون من أوائل المتبنّين.',
    'تدرس الملف العلمي وموقع المنافسين والسوق بالتفصيل الكامل.',
    'تجهّز مواد واضحة لتصنيف المرضى وتحدّد أين يسدّ هذا المنتج حاجة حقيقية.'] },
  { category: 'العمل الجماعي', text: 'فريق منطقتك متأخر في مؤشر مشترك، وأحد الزملاء متراخٍ في أدائه. ماذا تفعل؟', options: [
    'تركّز على تعظيم أرقامك أنت — أداؤك العالي سيفيد الفريق.',
    'تتواصل مع الزميل وتعرض عليه الدعم — فالنتائج تأتي من الفريق كله.',
    'تقترح مراجعة منظّمة للفريق: تتفقون على السبب الجذري وتعيدون توزيع المهام بذكاء.',
    'تعرض مرافقة الزميل يوماً كاملاً — تلاحظ أداءه، تدرّبه، وتشاركه أفضل الممارسات.'] },
  { category: 'العمل الجماعي', text: 'يُدخل مديرك نموذج تفصيل موحّداً لكل الفريق، وأنت غير متفق مع بعض أجزائه. ماذا تفعل؟', options: [
    'تعبّر عن اعتراضك مباشرة — تشارك نتائجك كدليل على أن أسلوبك الحالي ناجح.',
    'تجرّب النموذج الجديد بذهن منفتح وتقدّم ملاحظات بناءً على ردّ فعل الأطباء.',
    'تراجع الأدلة أو المنطق وراء النموذج قبل أن تقرر ما إذا كنت ستعترض.',
    'تتبنّاه حتى تحافظ على انسجام الفريق وتشارك ملاحظاتك البنّاءة بالقنوات الصحيحة.'] },
  { category: 'علاقات الزبائن', text: 'صيدلية كانت توصي بمنتجك دائماً تحوّلت إلى منتج منافس، وتبيّن أن السبب هو السعر. ماذا تفعل؟', options: [
    'تصعّد الأمر مباشرة إلى الإدارة وتدفع نحو حل تجاري يستعيد لك الحساب.',
    'تزور الصيدلي شخصياً — فالعلاقة أهم من صفقة واحدة خسرتها.',
    'تحلّل ربحية الحساب وأهميته الاستراتيجية قبل أن تقرر ردّك.',
    'تعرض دعماً إضافياً — تدريباً على المنتج، ومواد توعوية للمرضى — لتُظهر قيمة أكبر من السعر.'] },
  { category: 'علاقات الزبائن', text: 'بعد زيارة ناجحة، ترسل رسالة متابعة. كيف تكون عادةً؟', options: [
    'قصيرة ومركّزة — تؤكّد الرسالة الأساسية، تعيد تأكيد الالتزام، وتضع خطوة قادمة.',
    'شخصية ودافئة — تشير إلى شيء محدد من الحديث لتُظهر اهتماماً صادقاً.',
    'مفصّلة وموثّقة — ترفق الدراسة التي تحدثتما عنها، وملخص البيانات، وروابط المصادر.',
    'مفتوحة وداعمة — تشكره بصدق وتدعوه لأي أسئلة أو استفسارات عن المرضى.'] },
  { category: 'الامتثال والأخلاقيات', text: 'في منتصف الزيارة، تلاحظ أن مادة العرض تحتوي على رقم جرعة ربما تغيّر في آخر تحديث للنشرة الدوائية. ماذا تفعل؟', options: [
    'تكمل الزيارة وتعالج الاختلاف لاحقاً — لا تريد كسر زخم الحديث.',
    'تتوقف، تخبر الطبيب بوجود شك، وتعرض التأكد ومتابعته قبل أن يعتمد عليها.',
    'توقف استخدام المادة فوراً، وتوضّح المعلومة الصحيحة من مصادرك المعتمدة، وتوثّقها.',
    'تعتذر عن اللبس، تنحّي المادة جانباً، وتتأكد أن الطبيب لديه إرشاد دقيق قبل أن تغادر.'] },
  { category: 'الامتثال والأخلاقيات', text: 'يطلب منك طبيب مهم تنظيم عشاء يتجاوز سياسة الضيافة في شركتك. ماذا تفعل؟', options: [
    'تجد طريقة ذكية تلبّي توقعاته ضمن السياسة — تتحايل قليلاً للحفاظ على الحساب.',
    'تشرح له الحدود بصراحة وتعرض بديلاً يقوّي العلاقة في الوقت نفسه.',
    'تراجع حدود السياسة بالضبط، تقترح بديلاً متوافقاً تماماً، وتوثّق التعامل.',
    'ترفض الطلب باحترام، تشرح القواعد، وتحوّل التركيز إلى أنشطة تعليمية.'] },
  { category: 'العقلية والقيم', text: 'في نهاية سنة قوية، أي إنجاز سيكون الأكثر معنى بالنسبة لك؟', options: [
    'أن تكون الأول في منطقتك وتحصل على جائزة أفضل أداء في المؤتمر السنوي.',
    'أن يقول اختصاصي لمديرك: «مندوبك الوحيد الذي أنتظر زيارته بصدق.»',
    'أن تُعتمد استراتيجية منطقتك من الفريق الإقليمي كنموذج للتخطيط.',
    'أن يطلب منك مديرك تدريب وتأهيل الدفعة الجديدة من المندوبين.'] },
  { category: 'العقلية والقيم', text: 'البيئة التي تُخرج أفضل ما لديك هي التي:', options: [
    'تكون الأهداف فيها طموحة، والمنافسة واضحة، والأداء العالي معروف للجميع.',
    'الثقة فيها متبادلة، وللعلاقات قيمة حقيقية، والتعاون هو الثقافة السائدة.',
    'العمليات فيها واضحة، والتوقعات قابلة للقياس، والقرارات مبنية على بيانات قوية.',
    'يساعد الناس فيها بعضهم بعضاً، والتعلّم مُشجَّع، وأثر العمل على المريض حاضر دائماً في الذهن.'] },
]

// Copied verbatim from spstyle's self/index.html (PAR object, lines 827-864).
export const SPS_PROFILES_AR: Record<SpsKey, SpsProfileText> = {
  go: {
    name: 'المُنجِز', orient: 'موجّه للنتيجة · موجّه للعمل',
    color: '#E05A3A', gradient: 'linear-gradient(135deg, #E05A3A, #B03820)',
    traits: ['موجّه بالنتائج', 'تنافسي', 'حاسم', 'مركّز على الهدف', 'طاقة عالية'],
    desc: 'أنت قوة موجَّهة بالنتائج في الميدان. متحمّس بشدة لتحقيق أهداف المبيعات وتجاوزها، تستخدم أساليب بيع استراتيجية وتنتبه دائماً للمنافسة. تنقل الحديث بسرعة وثقة نحو النتائج التجارية، وتتألق عندما يُعرف الأداء العالي ويُكافأ عليه.',
    strengths: ['إغلاق الصفقات تحت الضغط', 'تنمية الحصة السوقية في المناطق التنافسية', 'التعامل مع الاعتراضات بحزم', 'اقتناص الفرص الجديدة'],
    weaknesses: ['قد تُقدّم الإغلاق على بناء العلاقة طويلة الأمد', 'خطر اللجوء لأساليب هجومية تحت الضغط', 'قد تقاوم الملاحظات التي لا ترتبط بالنتائج مباشرة', 'احتمال الإرهاق تحت ضغط الأهداف المستمرة'],
    motivate: ['أهداف طموحة مع مكافآت أداء واضحة', 'مسابقات مبيعات وتقدير علني', 'معلومات تنافسية منتظمة عن السوق', 'تدريب على مهارات التفاوض والإغلاق المتقدمة'],
    develop: ['تدريب على إدارة العلاقات والبيع الاستشاري', 'فرص إرشاد لبناء التعاطف', 'وعي بالامتثال والبيع الأخلاقي', 'المشاركة في الفعاليات التعليمية وإدارة قادة الرأي'],
    tip: 'طبّق قاعدة ٧٠/٣٠ — اجعل الطبيب يتحدث ٧٠٪ من الوقت. أقوى عرض لك يأتي دائماً بعد أهم ملاحظة منه.',
    growth: 'اندفاعك التجاري ممتاز. وجّهه الآن نحو استكشاف أعمق — فعندما تفهم ما يحتاجه الطبيب فعلاً قبل أن تعرض، ستضاعف نسبة تحويلك.',
  },
  connect: {
    name: 'صاحب العلاقات', orient: 'موجّه للنتيجة · موجّه للناس',
    color: '#2D8F6A', gradient: 'linear-gradient(135deg, #2D8F6A, #1A6A4F)',
    traits: ['متعاطف', 'موجّه بالعلاقات', 'موثوق', 'تعاوني', 'فطن'],
    desc: 'تبني الثقة بشكل طبيعي وتُنشئ شراكات تدوم مع الكوادر الصحية. ينتظر الأطباء والصيادلة زيارتك — ليس فقط من أجل المنتج، بل بسببك أنت. توازن بين نتائج المبيعات والاستثمار الحقيقي في العلاقة، وتتميّز بفهم حاجات العميل وتقديم حلول مخصّصة تركّز على المريض.',
    strengths: ['الاحتفاظ بالعملاء وإدارة الولاء', 'بناء العلاقات مع قادة الرأي والشركاء', 'التمثيل طويل الأمد للعلامة التجارية', 'التنقّل بين الحسابات متعددة الأطباء'],
    weaknesses: ['قد تتردد في الإغلاق خوفاً على العلاقة', 'خطر الإفراط في الاستثمار في شبكة صغيرة', 'قد تقلّل من شأن البيانات والمؤشرات التجارية', 'صعوبة إدارة الوقت عبر محفظة علاقات كبيرة'],
    motivate: ['فرص حضور المؤتمرات والفعاليات العلمية', 'تقدير كسفير للعلامة التجارية', 'موارد لإدارة العلاقات والحسابات', 'التعاون متعدد الوظائف مع التسويق والشؤون الطبية'],
    develop: ['تدريب على أدوات الـCRM وتحليلات المنطقة', 'التنبؤ بالمبيعات وتتبّع المؤشرات', 'الحزم وثقة الإغلاق', 'عادات منظّمة لوضع الأهداف والتقارير'],
    tip: 'بعد كل حديث مفيد، اسأل: «بناءً على ما تحدثنا عنه، هل تستطيع تجربته مع أول مريض مناسب؟» علاقتك تمنحك حق السؤال — استغلها.',
    growth: 'رصيد ثقتك هو أكبر أصل تجاري لديك. الخطوة القادمة هي تحويل هذه الثقة إلى التزامات وصف ثابتة عبر طلبات واضحة وواثقة.',
  },
  plan: {
    name: 'المخطِّط', orient: 'موجّه للعملية · موجّه للعمل',
    color: '#2D6A8F', gradient: 'linear-gradient(135deg, #2D6A8F, #1A4F72)',
    traits: ['تحليلي', 'منهجي', 'دقيق في التفاصيل', 'منظّم', 'موجّه بالبيانات'],
    desc: 'تجلب البنية والدقة والمصداقية العلمية لكل عنصر في عملك. تدير منطقتك بصرامة — تراقب المؤشرات، وتتابع التقدّم، وتستخدم البيانات لتحسين استراتيجية مبيعاتك. يثق بك الأطباء والمدراء لدقتك. أنت الشخص الذي يلجأون إليه عندما يحتاجون خطة تُبنى، لا مجرد خطة تُنفَّذ.',
    strengths: ['تخطيط المنطقة وإدارة المؤشرات', 'التفصيل المبني على الأدلة والنقاش العلمي', 'الامتثال والالتزام بإرشادات الشركة', 'التحديد المنهجي لاتجاهات الوصف'],
    weaknesses: ['قد تبالغ في التحليل قبل التصرّف — بطيء في التكيّف', 'خطر الظهور بمظهر علمي جاف أو رسمي مع العملاء', 'عدم ارتياح في المواقف العاطفية أو غير المتوقعة', 'قد تفقد تجربة العميل خلف كثرة البيانات'],
    motivate: ['الوصول إلى منصّات CRM وتحليلات متقدمة', 'تدريب على التنبؤ بالمبيعات وتحسين المنطقة', 'المشاركة في مشاريع تحسين العمليات', 'مؤشرات واضحة وأطر تقارير منظّمة'],
    develop: ['تدريب على إدارة العلاقات والذكاء العاطفي', 'البيع الاستشاري — تبدأ بالقصة قبل البيانات', 'ثقة في الحديث العفوي غير المخطَّط له', 'تقديم البيانات من خلال سرد إنساني جذّاب'],
    tip: 'جهّز "افتتاحية ذات رؤية" واحدة لكل زيارة — نقطة بيانات واحدة أو قصة مريض — وأخّر التحليل الكامل إلى أن يطلبه الطبيب. ابدأ بالإثارة وأتبِعها بالدليل.',
    growth: 'دقتك التحليلية أساس يحسدك عليه غيرك. حافة النمو لديك هي المرونة — فليس كل حديث يحتاج إطاراً منظّماً. اجعل سياق الطبيب يشكّل أسلوبك.',
  },
  support: {
    name: 'الداعم', orient: 'موجّه للعملية · موجّه للناس',
    color: '#8F4D8A', gradient: 'linear-gradient(135deg, #8F4D8A, #6A3570)',
    traits: ['رحيم', 'مبدئي', 'موثوق', 'مركّز على المريض', 'تعاوني'],
    desc: 'أنت العمود الفقري لأي فريق ناجح. نزاهتك وصبرك واهتمامك الصادق بالمرضى والزملاء تبني ثقة عميقة تدوم مع كل من حولك. تُعطي الأولوية للامتثال والترويج الأخلاقي والأنشطة التعليمية. يعرف أفراد الكوادر الصحية أنهم يستطيعون الاعتماد على صدقك — ويعرف زملاؤك أنك معهم دائماً.',
    strengths: ['تثقيف الكوادر الصحية وتسهيل الفعاليات العلمية', 'قيادة الامتثال والترويج الأخلاقي', 'الدعم الداخلي للفريق ومشاركة المعرفة', 'البيع طويل الدورة وبرامج دعم المرضى'],
    weaknesses: ['قد تؤخّر الأهداف التجارية لصالح العمل على العلاقات', 'ضعف في الحزم والإغلاق ضمن المواقف التنافسية', 'خطر الإفراط في دعم الآخرين على حساب نتائجك', 'قد تفقد الإلحاح في إغلاق الصفقات'],
    motivate: ['أدوار الإرشاد والتدريب بين الأقران', 'المشاركة في تأهيل المندوبين الجدد', 'تقدير على الامتثال والأداء الأخلاقي', 'فرص قيادة فعاليات تعليمية أو علمية'],
    develop: ['تدريب على الحزم والثقة التجارية', 'أهداف شخصية واضحة مع نقاط مساءلة', 'المشاركة في مسابقات المبيعات لبناء الوعي التنافسي', 'تدريب متقدم على التفاوض وتقنيات الإغلاق'],
    tip: 'في بداية كل أسبوع، اكتب هدفاً تجارياً واحداً لك بالكامل — حساباً محدداً أو هدف وصف — واجعله واضحاً. طبيعتك المهتمة ستتألق أكثر عندما تحقق أهدافك الشخصية أيضاً.',
    growth: 'قيمك وموثوقيتك ميزة تنافسية. تحدّي التطوير أمامك هو أن تمنح نفسك الإذن لتكون حازماً تجارياً — فالمرضى يستفيدون أكثر عندما تحقق أرقامك أيضاً.',
  },
}
```

- [ ] **Step 3: Verify the file compiles and content is index-aligned**

Run: `npx tsc --noEmit`
Expected: no errors. Manually confirm `SPS_QUESTIONS_EN.length === 16 && SPS_QUESTIONS_AR.length === 16` and that category order matches `SPS_QUESTIONS` in `sps-core.ts` (Selling Approach x2, Territory Management x2, Under Pressure x2, Scientific Knowledge x2, Teamwork x2, Customer Relationships x2, Compliance & Ethics x2, Mindset & Values x2).

- [ ] **Step 4: Commit**

```bash
git add src/lib/sps-data.ts src/lib/sps-data-ar.ts
git commit -m "feat: add bilingual SPS question and profile content"
```

---

## Task 3: Database migration

**Files:**
- Create: `supabase/migrations/008_sps_profile.sql`

**Interfaces:**
- Produces: `public.profiles.sps_top_key` (text, nullable), `public.profiles.sps_profile` (jsonb, nullable) — Task 4 and Task 6 depend on these column names.

- [ ] **Step 1: Write the migration**

```sql
-- SPS onboarding: a rep's dominant sales-style profile, computed once on
-- first play and stored on their existing profiles row. No new RLS policies
-- needed — the existing "own profile update/read" and "manager profiles
-- read" policies from 001_initial_schema.sql already cover the whole row.
alter table public.profiles
  add column if not exists sps_top_key text,
  add column if not exists sps_profile jsonb;
```

- [ ] **Step 2: Apply the migration**

Run against the project's Supabase instance (via the Supabase SQL editor or CLI, matching how `007_leagues.sql` was applied per prior session notes — this repo has applied migrations by hand via MCP/SQL editor before, not automated CI migration).
Expected: `alter table` succeeds; `select sps_top_key, sps_profile from public.profiles limit 1;` returns nulls with no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_sps_profile.sql
git commit -m "feat: add sps_top_key and sps_profile columns to profiles"
```

---

## Task 4: Extend the Profile type

**Files:**
- Modify: `src/types/game.ts:41-49`

**Interfaces:**
- Consumes: `SpsKey`, `SpsResult` from `@/lib/sps-core` (Task 1).
- Produces: `Profile.sps_top_key: SpsKey | null`, `Profile.sps_profile: SpsResult | null` — Task 6, 7, 8 depend on these fields existing on `Profile`.

- [ ] **Step 1: Add the import and extend the interface**

```typescript
// src/types/game.ts — add near the top with the other imports
import type { SpsKey, SpsResult } from '@/lib/sps-core'

// Replace the existing Profile interface (lines 41-49) with:
export interface Profile {
  id: string
  display_name: string | null
  xp: number
  last_visit: string | null
  company_id: string | null
  role: string
  avatar_url: string | null
  sps_top_key: SpsKey | null
  sps_profile: SpsResult | null
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (existing code that constructs/reads `Profile` still works since the new fields are additive and nullable).

- [ ] **Step 3: Commit**

```bash
git add src/types/game.ts
git commit -m "feat: add sps_top_key/sps_profile to the Profile type"
```

---

## Task 5: SPS data hook + i18n chrome strings

**Files:**
- Modify: `src/lib/i18n.tsx`

**Interfaces:**
- Consumes: `SPS_QUESTIONS_EN`, `SPS_PROFILES_EN` from `@/lib/sps-data`; `SPS_QUESTIONS_AR`, `SPS_PROFILES_AR` from `@/lib/sps-data-ar` (Task 2).
- Produces: `useSpsData(): { SPS_QUESTIONS_TEXT: SpsQuestionText[]; SPS_PROFILES_TEXT: Record<SpsKey, SpsProfileText> }` and dictionary keys `sps.*` — Task 7 (`SpsAssessment.tsx`) depends on both.

- [ ] **Step 1: Import the new data at the top of `i18n.tsx`**

```typescript
import { SPS_QUESTIONS_EN, SPS_PROFILES_EN } from '@/lib/sps-data'
import { SPS_QUESTIONS_AR, SPS_PROFILES_AR } from '@/lib/sps-data-ar'
```

- [ ] **Step 2: Add `sps.*` keys to the `EN` dictionary** (insert after the `'login.*'` block, following the existing `daily.*`-style grouping)

```typescript
  // sps onboarding
  'sps.eyebrow': 'Sales Person Style',
  'sps.title': 'Discover Your Selling Style',
  'sps.intro': "A quick 16-question read on how you sell. It becomes your StyleShift player profile and shows up on your manager's dashboard. Takes about 4 minutes.",
  'sps.start': 'Begin →',
  'sps.progress': 'Question {n} of {total}',
  'sps.resultEyebrow': 'SPS Assessment Complete',
  'sps.resultTitle': 'Your Sales Profile',
  'sps.scoresTitle': 'Score Breakdown',
  'sps.strengths': 'Key Strengths',
  'sps.growthLabel': 'Growth Focus:',
  'sps.tipLabel': 'Field Action Tip:',
  'sps.oppEyebrow': 'Growth Edge',
  'sps.oppTitle': 'Your Opposing Force',
  'sps.oppIntro': 'You scored <b>{score}/{total}</b> on {name} traits — the direct opposite of your dominant style. This is not a weakness to fix; it\'s the pattern you rely on least.',
  'sps.oppBorrow': "Borrow this — don't become it:",
  'sps.balancedNote': 'Your scores are spread across styles — a Balanced Profile, meaning you can adapt your approach across different situations.',
  'sps.complianceTitle': 'Compliance & Ethics Signal',
  'sps.complianceIntro': 'On the 2 compliance scenarios, your responses scored <b>{level} risk</b> ({score}/{max}). Scored separately from your SPS style.',
  'sps.complianceLevel.low': 'Low',
  'sps.complianceLevel.moderate': 'Moderate',
  'sps.complianceLevel.elevated': 'Elevated',
  'sps.continue': 'Continue to StyleShift →',
```

- [ ] **Step 3: Add the matching `AR` keys** (Modern Standard Arabic, matching the tone already used in `login.*`/`daily.*` AR strings)

```typescript
  // sps onboarding
  'sps.eyebrow': 'أسلوب مندوب المبيعات',
  'sps.title': 'اكتشف أسلوبك في البيع',
  'sps.intro': 'تقييم سريع من ١٦ سؤالاً حول أسلوبك في البيع. يصبح ملفك الشخصي في StyleShift ويظهر في لوحة مديرك. يستغرق حوالي ٤ دقائق.',
  'sps.start': 'ابدأ ←',
  'sps.progress': 'السؤال {n} من {total}',
  'sps.resultEyebrow': 'اكتمل تقييم SPS',
  'sps.resultTitle': 'أسلوبك في المبيعات',
  'sps.scoresTitle': 'تفصيل الدرجات',
  'sps.strengths': 'أهم نقاط القوة',
  'sps.growthLabel': 'محور التطوير:',
  'sps.tipLabel': 'نصيحة ميدانية:',
  'sps.oppEyebrow': 'حافة النمو',
  'sps.oppTitle': 'قوّتك المقابلة',
  'sps.oppIntro': 'حصلت على <b>{score}/{total}</b> في صفات {name} — الأسلوب المعاكس تماماً لأسلوبك الغالب. هذه ليست نقطة ضعف، بل النمط الذي تستخدمه أقل.',
  'sps.oppBorrow': 'استعرها، ولا تصبح إياها:',
  'sps.balancedNote': 'درجاتك موزّعة على أكثر من أسلوب — لديك أسلوب متوازن، ما يعني أنك تستطيع تكييف أسلوبك حسب الموقف.',
  'sps.complianceTitle': 'الامتثال والأخلاقيات',
  'sps.complianceIntro': 'في سؤالي الامتثال، جاءت إجاباتك بمستوى <b>مخاطرة {level}</b> ({score}/{max}). يُحتسب هذا منفصلاً عن أسلوبك في SPS.',
  'sps.complianceLevel.low': 'منخفض',
  'sps.complianceLevel.moderate': 'متوسط',
  'sps.complianceLevel.elevated': 'مرتفع',
  'sps.continue': 'المتابعة إلى StyleShift ←',
```

- [ ] **Step 4: Add the `useSpsData` hook** (place it right after the existing `useGameData` function, ~line 571)

```typescript
/** Returns the SPS assessment content set for the current language. */
export function useSpsData() {
  const { lang } = useLang()
  if (lang === 'ar') {
    return { SPS_QUESTIONS_TEXT: SPS_QUESTIONS_AR, SPS_PROFILES_TEXT: SPS_PROFILES_AR }
  }
  return { SPS_QUESTIONS_TEXT: SPS_QUESTIONS_EN, SPS_PROFILES_TEXT: SPS_PROFILES_EN }
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n.tsx
git commit -m "feat: add useSpsData hook and sps.* translation keys"
```

---

## Task 6: Persist the SPS result on the profile

**Files:**
- Modify: `src/hooks/useProfile.ts`

**Interfaces:**
- Consumes: `SpsResult` from `@/lib/sps-core`.
- Produces: `saveSpsAssessment(result: SpsResult): Promise<void>` on the `useProfile()` return object — Task 8 (`GameShell.tsx`) depends on this exact name and signature.

- [ ] **Step 1: Add the import**

```typescript
// src/hooks/useProfile.ts — add near the top with the other imports
import type { SpsResult } from '@/lib/sps-core'
```

- [ ] **Step 2: Add the `saveSpsAssessment` callback** (place it after `updateAvatar`, before `earnBadge`, following the same shape as the other mutators in this file)

```typescript
  // Writes the completed SPS assessment onto the rep's profile row. Called
  // once, the first time GameShell detects sps_top_key is missing.
  const saveSpsAssessment = useCallback(async (result: SpsResult) => {
    if (!profile) return
    const { error } = await supabase
      .from('profiles')
      .update({ sps_top_key: result.topKey, sps_profile: result })
      .eq('id', profile.id)
    if (error) return
    setProfile(prev => prev ? { ...prev, sps_top_key: result.topKey, sps_profile: result } : prev)
  }, [profile, supabase])
```

- [ ] **Step 3: Add it to the returned object**

```typescript
  // Replace the final return statement with:
  return { profile, badges, completedLevels, loading, addXp, earnBadge, saveSession, recordDaily, updateAvatar, saveSpsAssessment, reload: load }
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useProfile.ts
git commit -m "feat: add saveSpsAssessment to useProfile"
```

---

## Task 7: SPS assessment screen

**Files:**
- Create: `src/components/game/SpsAssessment.tsx`

**Interfaces:**
- Consumes: `SPS_QUESTIONS`, `SPS_OPPOSITE`, `scoreSps`, `SpsResult`, `SpsKey` from `@/lib/sps-core`; `useLang`, `useT`, `useSpsData` from `@/lib/i18n` (Task 5).
- Produces: `export default function SpsAssessment({ onComplete }: { onComplete: (result: SpsResult) => void })` — Task 8 (`GameShell.tsx`) renders this component and passes `onComplete`.

- [ ] **Step 1: Write the component**

```tsx
'use client'
import { useState } from 'react'
import { useLang, useT, useSpsData } from '@/lib/i18n'
import { SPS_QUESTIONS, SPS_OPPOSITE, scoreSps, type SpsResult } from '@/lib/sps-core'
import LangToggle from '@/components/LangToggle'

interface Props { onComplete: (result: SpsResult) => void }

const LETTERS = ['A', 'B', 'C', 'D']

export default function SpsAssessment({ onComplete }: Props) {
  const t = useT()
  const { dir } = useLang()
  const { SPS_QUESTIONS_TEXT, SPS_PROFILES_TEXT } = useSpsData()
  const fwd = dir === 'rtl' ? '←' : '→'

  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro')
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<SpsResult | null>(null)

  const qIndex = answers.length
  const total = SPS_QUESTIONS.length

  function pick(optionIndex: number) {
    const next = [...answers, optionIndex]
    setAnswers(next)
    if (next.length === total) {
      setResult(scoreSps(next))
      setPhase('result')
    }
  }

  const card: React.CSSProperties = {
    width: '100%', maxWidth: 480,
    background: 'linear-gradient(180deg,var(--panel),#0a1430)',
    border: '1px solid var(--line)', borderRadius: 18,
    padding: '18px 20px 20px', boxShadow: '0 16px 50px rgba(0,0,0,.55)',
  }
  const eyebrow = (text: string) => (
    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.4em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 10 }}>{text}</div>
  )
  const btnPrimary: React.CSSProperties = {
    width: '100%', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12,
    letterSpacing: '.12em', textTransform: 'uppercase', border: '1px solid var(--cyan)',
    color: '#04121c', background: 'var(--cyan)', borderRadius: 10, padding: '12px 18px',
    boxShadow: 'var(--glow-cyan)', touchAction: 'manipulation',
  }

  if (phase === 'intro') {
    return (
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}><LangToggle /></div>
          {eyebrow(t('sps.eyebrow'))}
          <h2 style={{ fontSize: 'clamp(20px,5vw,28px)', fontWeight: 800, marginBottom: 12, lineHeight: 1.15 }}>{t('sps.title')}</h2>
          <p style={{ color: 'var(--ink-dim)', fontSize: 14.5, lineHeight: 1.6, marginBottom: 20 }}>{t('sps.intro')}</p>
          <button style={btnPrimary} onClick={() => setPhase('quiz')}>{t('sps.start')}</button>
        </div>
      </div>
    )
  }

  if (phase === 'quiz') {
    const q = SPS_QUESTIONS_TEXT[qIndex]
    return (
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--ink-dim)' }}>{t('sps.progress', { n: qIndex + 1, total })}</span>
            <LangToggle />
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--line)', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(qIndex / total) * 100}%`, background: 'var(--cyan)', transition: 'width .25s' }} />
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 8 }}>{q.category}</div>
          <p style={{ fontSize: 15.5, lineHeight: 1.5, marginBottom: 18 }}>{q.text}</p>
          {q.options.map((opt, i) => (
            <button key={i} onClick={() => pick(i)} style={{ textAlign: 'start', width: '100%', cursor: 'pointer', color: 'var(--ink)', fontFamily: 'var(--sans)', fontSize: 14, lineHeight: 1.4, border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', background: 'rgba(0,0,0,.18)', marginBottom: 10, touchAction: 'manipulation', display: 'flex', gap: 10 }}>
              <b style={{ color: 'var(--cyan)', flexShrink: 0 }}>{LETTERS[i]}</b>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // phase === 'result'
  const r = result!
  const p = SPS_PROFILES_TEXT[r.topKey]
  const opp = SPS_PROFILES_TEXT[SPS_OPPOSITE[r.topKey]]
  const order: SpsKey[] = ['go', 'connect', 'plan', 'support']

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ ...card, maxWidth: 520 }}>
        {eyebrow(t('sps.resultEyebrow'))}
        <div style={{ background: p.gradient, borderRadius: 14, padding: '18px 18px 16px', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .85 }}>{t('sps.resultTitle')}</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 2px' }}>{p.name}</div>
          <div style={{ fontSize: 12.5, opacity: .85, marginBottom: 10 }}>{p.orient}</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{p.desc}</p>
        </div>

        {r.balanced && (
          <p style={{ fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.5, marginBottom: 14 }}>{t('sps.balancedNote')}</p>
        )}

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 8 }}>{t('sps.scoresTitle')}</div>
          {order.map(key => {
            const pct = Math.round((r.scores[key] / r.styleTotal) * 100)
            return (
              <div key={key} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                  <span>{SPS_PROFILES_TEXT[key].name}{key === r.topKey ? ' ✦' : ''}</span>
                  <span style={{ fontFamily: 'var(--mono)' }}>{r.scores[key]}/{r.styleTotal}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: SPS_PROFILES_TEXT[key].color }} />
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: p.color, marginBottom: 6 }}>{t('sps.strengths')}</div>
          {p.strengths.map((s, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>• {s}</div>)}
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 6 }}><b>{t('sps.growthLabel')}</b> {p.growth}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}><b>{t('sps.tipLabel')}</b> {p.tip}</div>
        </div>

        <div style={{ border: `1px solid ${opp.color}`, borderRadius: 12, padding: '13px 14px', marginBottom: 12 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: opp.color, marginBottom: 6 }}>{t('sps.oppEyebrow')} · {t('sps.oppTitle')}</div>
          <span style={{ fontSize: 13.5, lineHeight: 1.5, display: 'block', marginBottom: 8 }}
            dangerouslySetInnerHTML={{ __html: t('sps.oppIntro', { score: r.scores[SPS_OPPOSITE[r.topKey]], total: r.styleTotal, name: opp.name }) }} />
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{t('sps.oppBorrow')}</div>
          {opp.strengths.slice(0, 3).map((s, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>• {s}</div>)}
        </div>

        {r.complianceMax > 0 && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '13px 14px', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-dim)', marginBottom: 6 }}>{t('sps.complianceTitle')}</div>
            <span style={{ fontSize: 13, lineHeight: 1.5 }}
              dangerouslySetInnerHTML={{ __html: t('sps.complianceIntro', { level: t(`sps.complianceLevel.${r.complianceLevel}`), score: r.complianceRisk, max: r.complianceMax }) }} />
          </div>
        )}

        <button style={btnPrimary} onClick={() => onComplete(r)}>{t('sps.continue')} {fwd}</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (This component has no unit test — it's a thin renderer over the already-tested `scoreSps`; it's covered by the manual QA pass in Task 9.)

- [ ] **Step 3: Commit**

```bash
git add src/components/game/SpsAssessment.tsx
git commit -m "feat: add SpsAssessment onboarding screen"
```

---

## Task 8: Wire the gate into GameShell

**Files:**
- Modify: `src/components/game/GameShell.tsx`

**Interfaces:**
- Consumes: `SpsAssessment` (Task 7), `saveSpsAssessment` from `useProfile()` (Task 6), `profile.sps_top_key` (Task 4).

- [ ] **Step 1: Import `SpsAssessment`**

```typescript
// src/components/game/GameShell.tsx — add with the other component imports
import SpsAssessment from './SpsAssessment'
```

- [ ] **Step 2: Add `'sps'` to the `Screen` union** (line 22)

```typescript
type Screen = 'home' | 'level' | 'result' | 'daily' | 'how' | 'prep' | 'assignment' | 'sps'
```

- [ ] **Step 3: Replace the mount-only intro effect (lines 62-65) with a profile-aware gate**

The original:
```typescript
  // Show the intro once for first-time reps; reopenable from the home screen.
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem(INTRO_KEY)) setScreen('how')
  }, [])
```

Replace with:
```typescript
  // First-run gating, in order: complete the SPS assessment (DB-persisted,
  // so it survives across devices), then show the one-time intro carousel
  // (localStorage, reopenable from the home screen).
  useEffect(() => {
    if (loading) return
    if (profile && !profile.sps_top_key) { setScreen('sps'); return }
    if (typeof window !== 'undefined' && !localStorage.getItem(INTRO_KEY)) setScreen('how')
  }, [loading, profile])
```

- [ ] **Step 4: Add the `'sps'` screen branch** (immediately before the existing `if (screen === 'how')` block, ~line 197)

```typescript
  if (screen === 'sps') {
    return (
      <SpsAssessment
        onComplete={async (result) => {
          await saveSpsAssessment(result)
          if (typeof window !== 'undefined' && !localStorage.getItem(INTRO_KEY)) setScreen('how')
          else setScreen('home')
        }}
      />
    )
  }
```

- [ ] **Step 5: Destructure `saveSpsAssessment` from `useProfile()`** (line 34)

```typescript
  const { profile, badges, completedLevels, loading, addXp, earnBadge, saveSession, recordDaily, updateAvatar, saveSpsAssessment } = useProfile()
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, sign in as a rep whose `profiles.sps_top_key` is null (or null it out via SQL for an existing test account: `update profiles set sps_top_key=null, sps_profile=null where id='<test-rep-id>';`).
Expected: landing on `/play` shows the SPS intro screen first, not the game home or the "how it works" carousel. Answering all 16 questions shows the result screen with a dominant profile, score bars, and an opposing-force card. Clicking "Continue to StyleShift" lands on the "how it works" carousel (first-ever visit) and then the game home. Reloading `/play` afterward skips straight to the game home (both gates now cleared, confirmed by `select sps_top_key from profiles where id='<test-rep-id>'` returning the expected key).

- [ ] **Step 8: Commit**

```bash
git add src/components/game/GameShell.tsx
git commit -m "feat: gate first play on the SPS assessment"
```

---

## Task 9: Show SPS style on the manager dashboard

**Files:**
- Modify: `src/lib/team-stats.ts:3-12,52-96`
- Modify: `src/components/dashboard/Leaderboard.tsx`

**Interfaces:**
- Consumes: `RepStat` (extended), `SpsKey` from `@/lib/sps-core`.
- Produces: `RepStat.sps_top_key: SpsKey | null` — the last consumer in this plan; nothing downstream depends on it.

- [ ] **Step 1: Extend `RepStat` and the query in `team-stats.ts`**

```typescript
// src/lib/team-stats.ts — add the import
import type { SpsKey } from '@/lib/sps-core'

// Extend the RepStat interface (lines 3-12):
export interface RepStat {
  id: string
  display_name: string | null
  xp: number
  last_visit: string | null
  total_sessions: number
  avg_accuracy: number
  flag: boolean
  avatar_url: string | null
  sps_top_key: SpsKey | null
}
```

```typescript
// Update the reps query (line 52-57) to select the new column:
  const { data: reps } = await admin
    .from('profiles')
    .select('id, display_name, xp, last_visit, avatar_url, sps_top_key')
    .eq('company_id', companyId)
    .eq('role', 'rep')
    .order('xp', { ascending: false })
```

```typescript
// Update the repStats.map (lines 81-96) to carry it through:
  const repStats: RepStat[] = reps.map(rep => {
    const repSessions = allSessions.filter(s => s.rep_id === rep.id)
    const avg = repSessions.length
      ? Math.round(repSessions.reduce((sum, s) => sum + s.accuracy, 0) / repSessions.length)
      : 0
    return {
      id: rep.id,
      display_name: rep.display_name,
      xp: rep.xp,
      last_visit: rep.last_visit,
      total_sessions: repSessions.length,
      avg_accuracy: avg,
      flag: avg > 0 && avg < 70,
      avatar_url: rep.avatar_url ?? null,
      sps_top_key: (rep.sps_top_key as SpsKey | null) ?? null,
    }
  })
```

- [ ] **Step 2: Add an SPS style column to `Leaderboard.tsx`**

```typescript
// src/components/dashboard/Leaderboard.tsx — add near the top, after the imports
import { SPS_PROFILES_EN } from '@/lib/sps-data'

// Update the header grid (lines 33-39): 5 columns -> 6, insert "Style" before "Status"
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px 90px 100px', gap: 8, padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--ink-dim)', borderBottom: '1px solid var(--line)' }}>
        <span>Rep</span>
        <span style={{ textAlign: 'center' }}>Rank</span>
        <span style={{ textAlign: 'center' }}>Accuracy</span>
        <span style={{ textAlign: 'center' }}>Sessions</span>
        <span style={{ textAlign: 'center' }}>Style</span>
        <span style={{ textAlign: 'center' }}>Status</span>
      </div>

// Update the row grid (line 46) to match: '1fr 100px 80px 80px 90px 100px'

// Insert a new cell between the Sessions cell and the Status cell (after line 55):
            <div style={{ textAlign: 'center' }}>
              {rep.sps_top_key
                ? <span style={{ fontSize: 10.5, fontFamily: 'var(--mono)', fontWeight: 700, color: SPS_PROFILES_EN[rep.sps_top_key].color }}>
                    {SPS_PROFILES_EN[rep.sps_top_key].name.replace('The ', '')}
                  </span>
                : <span style={{ color: 'var(--ink-dim)', fontSize: 11 }}>—</span>}
            </div>
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, sign in as a manager whose team has at least one rep with `sps_top_key` set (from Task 8's test run) and one without.
Expected: `/dashboard` → Team Leaderboard shows the rep's SPS style name (e.g. "Go-Getter") in their team's brand color, and an em dash for the rep who hasn't completed the assessment yet.

- [ ] **Step 5: Commit**

```bash
git add src/lib/team-stats.ts src/components/dashboard/Leaderboard.tsx
git commit -m "feat: show SPS style on the manager dashboard leaderboard"
```

---

## Self-Review

**Spec coverage:** Scoring engine (Task 1), bilingual content (Task 2), schema (Task 3), type (Task 4), i18n/data hook (Task 5), persistence (Task 6), UI (Task 7), first-run gate (Task 8), manager visibility (Task 9) — covers everything in the Goal statement. `spstyle.netlify.app` is untouched, per the Global Constraint. Category-breakdown/PDF export explicitly deferred, per the Global Constraint.

**Placeholder scan:** No TBD/TODO markers; every code block is complete, runnable content copied from or matching the live source; every step names its exact file and run command.

**Type consistency:** `SpsKey`/`SpsResult` defined once (Task 1) and imported everywhere else by that exact name. `saveSpsAssessment` signature (`(result: SpsResult) => Promise<void>`) matches its Task 6 definition and Task 8 call site. `sps_top_key`/`sps_profile` column names match across the migration (Task 3), the type (Task 4), the hook (Task 6), and the dashboard query (Task 9). `SPS_QUESTIONS_TEXT`/`SPS_PROFILES_TEXT` (from `useSpsData()`) vs. `SPS_QUESTIONS`/`SPS_OPPOSITE` (from `sps-core.ts`) are consistently two different, non-colliding families of names throughout Task 7.
