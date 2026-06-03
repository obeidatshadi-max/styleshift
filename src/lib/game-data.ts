import type { StyleDef, StyleKey, L1Item, L2Item, L3Item, L4Item, Rank, XpValues } from '@/types/game'

// Pharma sales context: the player is a medical sales rep calling on doctors and
// pharmacies. Scenarios are pools — the scenario engine draws a fresh random
// subset each session (see scenario-engine.ts). Arabic mirror lives in
// game-data-ar.ts, keyed by the SAME ids.

export const STYLES: Record<StyleKey, StyleDef> = {
  driver:     { name:'Driver',     cls:'driver',     icon:'▲', drive:'Control & Achievement', blurb:'Assertive, direct, ROI-focused. Decides fast and dislikes wasted time.' },
  expressive: { name:'Expressive', cls:'expressive', icon:'✦', drive:'Recognition & Ideas',   blurb:'Enthusiastic, visionary, collaborative. Loves big ideas and being seen as innovative.' },
  amiable:    { name:'Amiable',    cls:'amiable',    icon:'♥', drive:'Security & Harmony',    blurb:'Warm, patient, relationship-first. Risk-averse and seeks consensus.' },
  analytical: { name:'Analytical', cls:'analytical', icon:'◆', drive:'Certainty & Accuracy',  blurb:'Precise, logical, data-driven. Wants evidence and time to evaluate.' },
}

export const STYLE_ORDER: StyleKey[] = ['driver','expressive','amiable','analytical']

// ───────────────────────── LEVEL 1 · Style Scan (pool of 18) ─────────────────────────
export const L1: L1Item[] = [
  { id:101, style:'driver', name:'Dr. Khalid · Surgeon', persona:'Surgeon',
    cues:['Stops you early: "Which patients, what outcome — give me the bottom line."','Glances at the OR schedule twice.','Wants two options and will decide on the spot.'] },
  { id:102, style:'analytical', name:'Dr. Salim · Cardiologist', persona:'Cardiologist',
    cues:['"Where\'s the head-to-head trial data, not the brochure?"','Re-reads the methodology before commenting.','Won\'t commit until he has reviewed the study design.'] },
  { id:103, style:'expressive', name:'Dr. Hana · Dermatologist', persona:'Dermatologist',
    cues:['Excited to be among the first to use a novel option.','Talks about presenting her cases at a conference.','Wants the brand to make her clinic look cutting-edge.'] },
  { id:104, style:'amiable', name:'Dr. Mona · Family GP', persona:'Family GP',
    cues:['Asks how her regular patients will tolerate a switch.','Wants to start slowly with a few patients.','Values a rep she can trust over the long term.'] },
  { id:105, style:'analytical', name:'Fadi · Hospital Pharmacist', persona:'Hospital Pharmacist',
    cues:['Asks for stability and storage data.','Checks each formulary inclusion criterion.','Wants the full dossier before listing anything.'] },
  { id:106, style:'driver', name:'Ziad · Pharmacy Owner', persona:'Pharmacy Owner',
    cues:['"What\'s my margin and how fast does it move?"','Counts shelf turnover as you talk.','Decides immediately if the numbers work.'] },
  { id:107, style:'expressive', name:'Dr. Yousef · Psychiatrist (KOL)', persona:'Psychiatrist · KOL',
    cues:['Riffs on a bold new treatment approach.','Wants to be recognized as a thought leader.','Asks about advisory boards and speaking slots.'] },
  { id:108, style:'amiable', name:'Huda · Community Pharmacist', persona:'Community Pharmacist',
    cues:['Asks how it helps her regular customers.','Wants reassurance on side effects so she can advise patients.','Prefers a steady relationship over a one-off deal.'] },
  { id:109, style:'analytical', name:'Dr. Omar · Endocrinologist', persona:'Endocrinologist',
    cues:['Quotes the latest treatment guideline.','Asks for the exact HbA1c reduction figures.','Methodical — wants time to evaluate.'] },
  { id:110, style:'driver', name:'Dr. Tarek · Orthopedic Surgeon', persona:'Orthopedic Surgeon',
    cues:['Interrupts: "Bottom line on recovery time?"','Impatient with mechanism-of-action detail.','Frames everything around patient throughput.'] },
  { id:111, style:'driver', name:'Sara · Chain Pharmacy Buyer', persona:'Chain Buyer',
    cues:['"Give me your best price and terms."','Watching her turnover targets.','Wants two SKU options and a fast decision.'] },
  { id:112, style:'amiable', name:'Dr. Layla · Pediatrician', persona:'Pediatrician',
    cues:['Worried about safety in children.','Wants to consult colleagues first.','Gentle and relationship-first.'] },
  { id:113, style:'analytical', name:'Dr. Nadia · Oncologist', persona:'Oncologist',
    cues:['Requests survival-curve and subgroup data.','Questions the sample size of your evidence.','Cautious — avoids quick conclusions.'] },
  { id:114, style:'expressive', name:'Rami · Pharmacy Manager', persona:'Pharmacy Manager',
    cues:['Wants an eye-catching counter display.','Loves being the "first pharmacy" with a launch.','Talks fast about promotions and visibility.'] },
  { id:115, style:'driver', name:'Dr. Sami · High-Prescriber GP', persona:'GP',
    cues:['"How many samples can you leave? I\'m slammed."','Wants speed and simplicity.','Decides fast and moves on.'] },
  { id:116, style:'analytical', name:'Dr. Reem · Rheumatologist', persona:'Rheumatologist',
    cues:['Asks for the long-term safety registry.','Reviews the prescribing information line by line.','Will not be rushed into a decision.'] },
  { id:117, style:'amiable', name:'Karim · Community Pharmacist', persona:'Community Pharmacist',
    cues:['Asks how the change affects his elderly customers.','Checks with his partner before ordering.','Values trust above a quick sale.'] },
  { id:118, style:'expressive', name:'Dr. Faris · ENT Specialist', persona:'ENT Specialist',
    cues:['Enthusiastic about an innovative formulation.','Wants co-marketing and visibility.','Jumps quickly between three ideas.'] },
]

// ───────────────────────── LEVEL 2 · Crisis Mode (pool of 10) ─────────────────────────
export const L2: L2Item[] = [
  { id:201, style:'analytical', name:'Dr. Salim · Cardiologist', crisis:'"A competitor rep just showed me data saying your drug is no better. Convince me or leave."',
    q:'Dr. Salim (Analytical) is challenging you. Choose your path.',
    opts:[
      { t:'Walk through the head-to-head endpoints and number-needed-to-treat, calmly.', r:'win', why:'Winning Strategy. Evidence and a logical breakdown satisfy the Analytical drive for Certainty & Accuracy.' },
      { t:'Insist your drug is simply better and ask him to trust your experience.',       r:'escalate', why:'Dismissing data raises an Analytical\'s stress and erodes trust.' },
      { t:'Appeal emotionally to your long relationship.',                                  r:'escalate', why:'Emotion over evidence ignores what an Analytical needs under pressure.' },
    ]},
  { id:202, style:'driver', name:'Dr. Khalid · Surgeon', crisis:'"I have 20 patients waiting. Why are you wasting my time?"',
    q:'Dr. Khalid (Driver) is stressed. Choose your path.',
    opts:[
      { t:'Give one-line benefit, then two options, and let him decide.', r:'win', why:'Winning Strategy. Brevity, options and control feed the Driver drive for Control & Achievement.' },
      { t:'Launch into the full mechanism-of-action story.',              r:'escalate', why:'Long detail with no decision point escalates a stressed Driver.' },
      { t:'Ask how he\'s coping with the busy clinic first.',             r:'escalate', why:'A Driver reads this as a delay, not empathy.' },
    ]},
  { id:203, style:'amiable', name:'Huda · Community Pharmacist', crisis:'"A customer complained of side effects from your product — I\'m nervous about recommending it."',
    q:'Huda (Amiable) is worried. Choose your path.',
    opts:[
      { t:'Acknowledge the concern, share the safety profile and a patient-counseling guide, and offer support.', r:'win', why:'Winning Strategy. Reassurance and a safety net satisfy the Amiable drive for Security & Harmony.' },
      { t:'Push her to keep ordering — one complaint is nothing.',         r:'escalate', why:'Pressure attacks the Amiable need for security; stress spikes.' },
      { t:'Tell her the data says it\'s fine and move on.',               r:'escalate', why:'Data alone doesn\'t reassure an Amiable — she needs to feel supported.' },
    ]},
  { id:204, style:'expressive', name:'Dr. Hana · Dermatologist', crisis:'"The conference panel dismissed the approach I championed. I look foolish."',
    q:'Dr. Hana (Expressive) is deflated. Choose your path.',
    opts:[
      { t:'Recognize her leadership, then co-build the next case series together.', r:'win', why:'Winning Strategy. Recognition plus fresh ideas restore the Expressive drive for Recognition & Ideas.' },
      { t:'Send her a chart explaining why the approach underperformed.',  r:'escalate', why:'Cold analysis deflates an Expressive and raises stress.' },
      { t:'Tell her to toughen up and not take it personally.',            r:'escalate', why:'Denying recognition escalates an Expressive fast.' },
    ]},
  { id:205, style:'analytical', name:'Fadi · Hospital Pharmacist', crisis:'"Your stability data doesn\'t match our storage conditions. This can\'t be listed."',
    q:'Fadi (Analytical) has blocked the listing. Choose your path.',
    opts:[
      { t:'Go through the stability dossier and your storage range point by point.', r:'win', why:'Winning Strategy. Precision on the exact data resolves the Analytical objection.' },
      { t:'Reassure him vaguely that it will be fine.',                    r:'escalate', why:'Vague comfort ignores his drive for certainty.' },
      { t:'Point out that other hospitals listed it, so he should too.',   r:'escalate', why:'Social proof doesn\'t answer an Analytical\'s data question.' },
    ]},
  { id:206, style:'driver', name:'Ziad · Pharmacy Owner', crisis:'"Your product is sitting on my shelf, not moving. I want to return it."',
    q:'Ziad (Driver) wants out. Choose your path.',
    opts:[
      { t:'Offer two concrete sell-through actions with the margin impact, his pick.', r:'win', why:'Winning Strategy. Action, options and control feed the Driver drive.' },
      { t:'Tell the long brand-heritage story to rebuild interest.',       r:'escalate', why:'Narrative with no decision point frustrates a stressed Driver.' },
      { t:'Remind him of your loyal relationship and ask him to be patient.', r:'escalate', why:'A Driver reads patience as no progress on the number.' },
    ]},
  { id:207, style:'amiable', name:'Dr. Mona · Family GP', crisis:'"You\'re pushing me to switch all my patients too fast — I\'m not comfortable."',
    q:'Dr. Mona (Amiable) feels pressured. Choose your path.',
    opts:[
      { t:'Reassure her; propose switching only new patients first, with your support.', r:'win', why:'Winning Strategy. A low-risk phased path satisfies the Amiable drive for Security.' },
      { t:'Push for a full switch now to hit the cycle target.',           r:'escalate', why:'Pressure attacks the Amiable need for security; stress rises.' },
      { t:'Tell her the data proves it\'s safe, so she should just do it.', r:'escalate', why:'Data alone doesn\'t reassure an Amiable under pressure.' },
    ]},
  { id:208, style:'expressive', name:'Dr. Yousef · Psychiatrist (KOL)', crisis:'"Another company offered me a bigger speaking role. Why should I stay with you?"',
    q:'Dr. Yousef (Expressive) is courting offers. Choose your path.',
    opts:[
      { t:'Recognize his influence and offer a visible platform for his ideas — a symposium and advisory role.', r:'win', why:'Winning Strategy. Recognition and a stage feed the Expressive drive.' },
      { t:'Counter with cold, detailed contract terms.',                   r:'escalate', why:'Spreadsheet-first deflates an Expressive who wants to be seen.' },
      { t:'Downplay the competitor and ask him to stay out of loyalty.',   r:'escalate', why:'Denying his standing escalates an Expressive.' },
    ]},
  { id:209, style:'driver', name:'Sara · Chain Pharmacy Buyer', crisis:'"Your price is higher than the generic. Give me a reason in ten seconds."',
    q:'Sara (Driver) wants it fast. Choose your path.',
    opts:[
      { t:'Lead with margin and turnover, give two pack options, her call.', r:'win', why:'Winning Strategy. Numbers, options and a fast decision feed the Driver drive.' },
      { t:'Deliver a clinical lecture on why the brand is superior.',        r:'escalate', why:'A buyer under time pressure reads this as wasted time.' },
      { t:'Ask how she feels about stocking quality products.',             r:'escalate', why:'A Driver wants the number, not a feelings question.' },
    ]},
  { id:210, style:'analytical', name:'Dr. Omar · Endocrinologist', crisis:'"Your HbA1c claim isn\'t in the latest guideline. I can\'t prescribe on marketing."',
    q:'Dr. Omar (Analytical) wants proof. Choose your path.',
    opts:[
      { t:'Show the pivotal trial and exactly where its evidence sits relative to the guideline.', r:'win', why:'Winning Strategy. Locating the evidence precisely satisfies the Analytical drive.' },
      { t:'Make an emotional case about patients who could benefit.',       r:'escalate', why:'Emotion doesn\'t answer an evidence objection.' },
      { t:'Tell him most of his peers already prescribe it.',               r:'escalate', why:'Popularity isn\'t proof for an Analytical.' },
    ]},
]

// ───────────────────────── LEVEL 3 · Drive Decoder (pool of 10) ─────────────────────────
export const L3: L3Item[] = [
  { id:301, multi:false, style:'driver', name:'Dr. Khalid · Surgeon', persona:'Driver — drive: Control & Achievement',
    situation:'Dr. Khalid is calm but has 5 minutes before his next case.',
    q:'Which opening best feeds his core drive?',
    opts:[
      { t:'"Two regimens that cut your patients\' recovery time, with the outcome data on each — your call."', correct:true, why:'Control + measurable achievement. Exactly the Driver drive.' },
      { t:'"Let me walk you through the full development story first."', correct:false, why:'Process narrative drains a Driver who wants control of the outcome.' },
      { t:'"How was your weekend? Let\'s catch up first."',             correct:false, why:'Relationship warmth is the Amiable drive, not the Driver\'s.' },
    ]},
  { id:302, multi:false, style:'expressive', name:'Dr. Hana · Dermatologist', persona:'Expressive — drive: Recognition & Ideas',
    situation:'Dr. Hana is pitching you her idea to run a local case series.',
    q:'Which response best feeds her core drive?',
    opts:[
      { t:'"Bold, original — let\'s build it and put your name on the publication."', correct:true, why:'Recognition + room for ideas. The Expressive drive.' },
      { t:'"Could you send me the supporting data tables first?"',      correct:false, why:'That satisfies an Analytical, not an Expressive who wants to be seen.' },
      { t:'"Let\'s slow down and reduce the risk before anything."',    correct:false, why:'Caution speaks to the Amiable drive and deflates the Expressive.' },
    ]},
  { id:303, multi:false, style:'amiable', name:'Dr. Mona · Family GP', persona:'Amiable — drive: Security & Harmony',
    situation:'Dr. Mona likes you but hasn\'t committed to prescribing.',
    q:'Which response best feeds her core drive?',
    opts:[
      { t:'"We\'ll start with a few new patients, I\'ll support you personally, and we can pause anytime."', correct:true, why:'Security + harmony with a safety net. The Amiable drive.' },
      { t:'"Decide today — the launch offer expires tonight."',         correct:false, why:'Urgency threatens an Amiable\'s need for security.' },
      { t:'"The trial numbers are airtight, that should settle it."',   correct:false, why:'Data reassures an Analytical, not an Amiable.' },
    ]},
  { id:304, multi:false, style:'analytical', name:'Fadi · Hospital Pharmacist', persona:'Analytical — drive: Certainty & Accuracy',
    situation:'Fadi is deciding whether to add your drug to the formulary.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Here\'s the full trial dossier and stability data matched to your storage conditions."', correct:true, why:'Evidence and precision. The Analytical drive.' },
      { t:'"Everyone\'s listing it — you don\'t want to be last."',     correct:false, why:'Social pressure doesn\'t answer a certainty-driven mind.' },
      { t:'"Let\'s just trial it informally and see what happens."',    correct:false, why:'Improvising undermines an Analytical\'s need for rigor.' },
    ]},
  { id:305, multi:false, style:'analytical', name:'Dr. Salim · Cardiologist', persona:'Analytical — drive: Certainty & Accuracy',
    situation:'Dr. Salim is skeptical and evaluating the evidence.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Here\'s the head-to-head RCT: primary endpoint, and the number needed to treat."', correct:true, why:'Rigorous evidence. The Analytical drive.' },
      { t:'"It\'s the market leader — that says enough."',              correct:false, why:'Market position isn\'t clinical proof.' },
      { t:'"All my other cardiologists already love it."',             correct:false, why:'Anecdote doesn\'t satisfy an evidence-driven specialist.' },
    ]},
  { id:306, multi:false, style:'driver', name:'Ziad · Pharmacy Owner', persona:'Driver — drive: Control & Achievement',
    situation:'Ziad is deciding whether to stock your product.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Two pack sizes — here\'s the margin and turnover on each. Pick what fits."', correct:true, why:'Numbers, options and control. The Driver drive.' },
      { t:'"Let me explain the science behind the formulation."',       correct:false, why:'Mechanism detail bores a results-focused Driver.' },
      { t:'"It\'ll build patient loyalty over the years."',            correct:false, why:'Slow, soft benefit doesn\'t move a Driver who wants the number now.' },
    ]},
  { id:307, multi:false, style:'expressive', name:'Dr. Yousef · Psychiatrist (KOL)', persona:'Expressive — drive: Recognition & Ideas',
    situation:'Dr. Yousef wants to be at the front of a new treatment trend.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"Let\'s put you on the symposium panel to share your early experience."', correct:true, why:'Recognition + a stage for his ideas. The Expressive drive.' },
      { t:'"First, please complete this detailed audit form."',         correct:false, why:'Paperwork-first deflates an Expressive.' },
      { t:'"Best to wait until everyone else has adopted it."',         correct:false, why:'Caution kills the Expressive\'s appetite to be first.' },
    ]},
  { id:308, multi:false, style:'amiable', name:'Dr. Layla · Pediatrician', persona:'Amiable — drive: Security & Harmony',
    situation:'Dr. Layla is cautious about using it in children.',
    q:'Which response best feeds her core drive?',
    opts:[
      { t:'"Here\'s the pediatric safety data; start with a few patients and I\'ll be reachable anytime."', correct:true, why:'Safety + a supported, gradual path. The Amiable drive.' },
      { t:'"You\'re behind your peers — start prescribing widely now."', correct:false, why:'Pressure threatens the Amiable need for security.' },
      { t:'"The efficacy numbers are excellent, that\'s all you need."', correct:false, why:'Efficacy data alone doesn\'t calm a safety-first Amiable.' },
    ]},
  { id:309, multi:true, name:'Formulary mini-board: Fadi + Dr. Yousef', persona:'Multi-stakeholder — competing drives',
    situation:'Analytical pharmacist Fadi wants proof; Expressive KOL Dr. Yousef wants his approach recognized. Both are in the room.',
    q:'Which single move best balances BOTH drives at once?',
    opts:[
      { t:'"Dr. Yousef\'s approach leads the case — and here\'s the evidence dossier that backs it for the formulary."', correct:true, why:'Recognition for Yousef (Expressive) + evidence for Fadi (Analytical). Both drives met.' },
      { t:'"Let\'s champion the exciting approach now and sort the data later."', correct:false, why:'Pleases Yousef but ignores Fadi\'s drive for certainty.' },
      { t:'"We\'ll only move once every figure is triple-checked."',     correct:false, why:'Satisfies Fadi but starves Yousef\'s need for recognition.' },
    ]},
  { id:310, multi:true, name:'Pharmacy chain meeting: Sara + Huda', persona:'Multi-stakeholder — competing drives',
    situation:'Driver buyer Sara wants the numbers; Amiable pharmacist Huda wants her customers cared for. Both must agree.',
    q:'Which single move best balances BOTH drives at once?',
    opts:[
      { t:'"Best terms for your turnover targets — plus a counseling guide so your pharmacists keep customers safe and loyal."', correct:true, why:'Margin/turnover for Sara (Driver) + patient-care security for Huda (Amiable). Both drives met.' },
      { t:'"Let\'s focus purely on price and volume today."',           correct:false, why:'Wins Sara but ignores Huda\'s care-and-trust drive.' },
      { t:'"Let\'s center everything on patient stories and relationships."', correct:false, why:'Warms Huda but starves Sara\'s need for the numbers.' },
    ]},
]

// ───────────────────────── LEVEL 4 · The Formulary Committee (pool of 8) ─────────────────────────
// You present your drug to a hospital Pharmacy & Therapeutics committee:
// Analytical pharmacist, Driver department head, Amiable nurse manager, Expressive KOL.
// Meters: Adoption (quota) · Trust (morale) · Risk.
export const L4: L4Item[] = [
  { id:401, q:'Opening move with the whole committee watching:',
    opts:[
      { t:'Lead with a bold innovation story, lightly backed by headline data.',      quota:+8,  morale:+10, risk:+12, why:'Energizes the KOL & department head, but thin data spikes Risk for the Analytical pharmacist.' },
      { t:'Present a measured case: evidence pack, cost-effectiveness, phased rollout.', quota:+10, morale:+6,  risk:-8,  why:'Balanced. Hits the cost and evidence needs while keeping Risk low.' },
      { t:'Spend the slot only building rapport and reassurance.',                     quota:-4,  morale:+12, risk:-2,  why:'The nurse manager warms to it; the department head sees no progress on adoption.' },
    ]},
  { id:402, q:'The Analytical pharmacist challenges your stability and evidence. You:',
    opts:[
      { t:'Open the dossier and walk the data line by line.',                          quota:+6,  morale:+4,  risk:-12, why:'Transparency satisfies the Analytical and cuts Risk sharply.' },
      { t:'Wave it off — "the innovation matters more than the fine print."',          quota:0,   morale:-8,  risk:+15, why:'Dismissing data alienates the pharmacist and inflates Risk.' },
      { t:'Promise to send the data later and push to a vote.',                        quota:+4,  morale:-2,  risk:+8,  why:'Buys momentum but unresolved data keeps Risk elevated.' },
    ]},
  { id:403, q:'The Amiable nurse manager worries staff can\'t absorb the protocol change. You:',
    opts:[
      { t:'Bulldoze: "The protocol is set, they\'ll adapt."',                          quota:+10, morale:-16, risk:+6,  why:'Short-term push, but Trust collapses and the Amiable turns against you.' },
      { t:'Add a phased rollout with training and support — same protocol, safer path.', quota:+6,  morale:+12, risk:-6,  why:'Protects Trust and safety while still advancing Adoption.' },
      { t:'Drop the protocol change entirely to avoid friction.',                      quota:-10, morale:+6,  risk:-4,  why:'Harmony at the cost of the committee\'s adoption goal.' },
    ]},
  { id:404, q:'The Driver department head demands the cost decision now. You:',
    opts:[
      { t:'Offer two cost-effective options with a clear recommendation.',            quota:+14, morale:+6,  risk:-4,  why:'Decisive + evidenced. Lands the Driver without spooking the others.' },
      { t:'Ask for another month to align everyone.',                                 quota:-8,  morale:+4,  risk:-2,  why:'A Driver reads delay as failure — Adoption momentum is lost.' },
      { t:'Close hard on price alone, skipping the rationale.',                        quota:+6,  morale:-6,  risk:+10, why:'May win the moment but leaves the others uneasy — Risk climbs.' },
    ]},
  { id:405, q:'The Expressive KOL wants to champion the drug publicly. You:',
    opts:[
      { t:'Give him a visible role and co-author the rollout protocol.',              quota:+12, morale:+8,  risk:-2,  why:'Recognition turns him into your advocate, lifting Adoption and Trust.' },
      { t:'Tell him to keep it low-key for now.',                                     quota:-2,  morale:-8,  risk:+2,  why:'Denying the stage deflates the Expressive and cools the room.' },
      { t:'Ignore him and stay focused on the numbers.',                             quota:+4,  morale:-4,  risk:+4,  why:'Missing his recognition need costs you a champion.' },
    ]},
  { id:406, q:'The budget holder flags your price versus the generic. You:',
    opts:[
      { t:'Show total cost-of-care evidence — fewer admissions and complications.',   quota:+10, morale:+4,  risk:-10, why:'Reframes price as value with data; lowers Risk and advances Adoption.' },
      { t:'Argue it\'s premium and simply worth it, with no figures.',                quota:+2,  morale:-6,  risk:+10, why:'Assertion without evidence raises Risk for the committee.' },
      { t:'Offer a deep discount that undercuts your value story.',                   quota:+6,  morale:+2,  risk:+6,  why:'Buys a little adoption but signals the price was never real — Risk rises.' },
    ]},
  { id:407, q:'A safety signal from a competitor is raised in the room. You:',
    opts:[
      { t:'Present the safety registry transparently and put the signal in context.', quota:+6,  morale:+6,  risk:-12, why:'Openness builds Trust and cuts Risk hardest.' },
      { t:'Dismiss the competitor\'s claim as a smear.',                              quota:+2,  morale:-6,  risk:+12, why:'Defensiveness reads as hiding something — Risk spikes.' },
      { t:'Deflect with "the regulator approved it, end of story."',                  quota:+4,  morale:-2,  risk:+6,  why:'Approval isn\'t the same as engaging the concern — unease lingers.' },
    ]},
  { id:408, q:'The final vote moment. Your closing move:',
    opts:[
      { t:'Summarize evidence, cost and safety, and ask for adoption with a monitored pilot.', quota:+14, morale:+8,  risk:-6,  why:'Decisive, evidenced and low-risk — the apex close.' },
      { t:'Push hard for full immediate adoption across the hospital.',               quota:+8,  morale:-6,  risk:+10, why:'Over-reach unsettles the cautious members — Risk climbs.' },
      { t:'Withdraw and ask to revisit next quarter.',                               quota:-10, morale:+4,  risk:-4,  why:'Avoids friction but surrenders all Adoption momentum.' },
    ]},
]

export const RANKS: Rank[] = [
  { name:'Rookie',       minXp:0 },
  { name:'Field Rep',    minXp:200 },
  { name:'Style Reader', minXp:500 },
  { name:'Drive Expert', minXp:1000 },
  { name:'Style Master', minXp:2000 },
]

export const XP_VALUES: XpValues = {
  correct:       20,
  fastBonus:     10,
  levelComplete: 50,
  perfectLevel:  100,
  dailyStreak:   30,
}

export const LEVELS = [
  { n:1, title:'Style Scan',    sub:'Read behaviour, name the style' },
  { n:2, title:'Crisis Mode',   sub:'Defuse the objection under fire' },
  { n:3, title:'Drive Decoder', sub:'Satisfy the underlying drive' },
  { n:4, title:'The Formulary', sub:'Balance Adoption, Trust & Risk' },
]
