import type { StyleDef, StyleKey, L1Item, L2Item, L3Item, L4Item, Rank, XpValues } from '@/types/game'

export const STYLES: Record<StyleKey, StyleDef> = {
  driver:     { name:'Driver',     cls:'driver',     icon:'▲', drive:'Control & Achievement', blurb:'Assertive, direct, ROI-focused. Decides fast and dislikes wasted time.' },
  expressive: { name:'Expressive', cls:'expressive', icon:'✦', drive:'Recognition & Ideas',   blurb:'Enthusiastic, visionary, collaborative. Loves big ideas and being seen as innovative.' },
  amiable:    { name:'Amiable',    cls:'amiable',    icon:'♥', drive:'Security & Harmony',    blurb:'Warm, patient, relationship-first. Risk-averse and seeks consensus.' },
  analytical: { name:'Analytical', cls:'analytical', icon:'◆', drive:'Certainty & Accuracy',  blurb:'Precise, logical, data-driven. Wants evidence and time to evaluate.' },
}

export const STYLE_ORDER: StyleKey[] = ['driver','expressive','amiable','analytical']

export const L1: L1Item[] = [
  { style:'driver',     name:'CEO Clara',      persona:'Driver archetype',
    cues:['Cuts the small talk: "Give me the bottom line."','Checks the clock twice in two minutes.','Wants two options and will decide on the spot.'] },
  { style:'analytical', name:'CFO Alan',        persona:'Analytical archetype',
    cues:['Asks for the source behind every figure you quote.','Takes notes and re-reads the spec sheet.',"Won't commit until the data is fully reviewed."] },
  { style:'expressive', name:'Marketing Mike',  persona:'Expressive archetype',
    cues:['Riffs on a "game-changing" vision for the launch.','Talks fast, jumps between three ideas.','Wants the campaign to make the team look brilliant.'] },
  { style:'amiable',    name:'Support Sarah',   persona:'Amiable archetype',
    cues:["Asks how the change will affect her team's workload.",'Wants to check with colleagues before agreeing.','Values a long, trusting relationship over a fast deal.'] },
  { style:'analytical', name:'Dr. Reyes',       persona:'Analytical archetype',
    cues:['Requests the clinical study methodology, not the summary.','Questions the sample size of your evidence.','Methodical, cautious, avoids quick conclusions.'] },
  { style:'driver',     name:'VP Okafor',        persona:'Driver archetype',
    cues:["Interrupts to ask \"What's the ROI?\"","Impatient with background detail.",'Frames everything around hitting the target.'] },
]

export const L2: L2Item[] = [
  { style:'analytical', name:'CFO Alan', crisis:'"CRITICAL DATA FAILURE — your numbers don\'t reconcile. Fix it NOW."',
    q:'Alan (Analytical) is stressed. Choose your path.',
    opts:[
      { t:'Path A — Reassure him emotionally that it will be fine.',          r:'escalate', why:'Emotional reassurance ignores his drive for certainty. An Analytical under stress needs evidence, not comfort.' },
      { t:'Path B — Walk through the data line-by-line and isolate the discrepancy.', r:'win', why:'Winning Strategy. Precision and a logical breakdown directly satisfy the Analytical drive for Certainty & Accuracy.' },
      { t:'Path C — Tell him to stop worrying and trust your read.',           r:'escalate', why:"Dismissing the data raises an Analytical's stress and erodes trust." },
    ]},
  { style:'driver', name:'CEO Clara', crisis:'"We\'re behind quota and you\'re wasting my time. What\'s the move?"',
    q:'Clara (Driver) is stressed. Choose your path.',
    opts:[
      { t:'Give two clear options with the ROI of each and let her decide.',   r:'win',      why:'Winning Strategy. Brevity, options, and control feed the Driver drive for Control & Achievement.' },
      { t:'Open with a detailed 10-slide background recap.',                   r:'escalate', why:'Long detail with no decision point escalates a stressed Driver.' },
      { t:"Ask how she's feeling about the pressure first.",                   r:'escalate', why:"A Driver reads this as a delay, not empathy — stress rises." },
    ]},
  { style:'amiable', name:'Support Sarah', crisis:'"This rollout is moving too fast — my team isn\'t ready and I\'m worried."',
    q:'Sarah (Amiable) is stressed. Choose your path.',
    opts:[
      { t:'Push for sign-off today to keep the timeline.',                     r:'escalate', why:"Pressure attacks the Amiable drive for Security — stress spikes." },
      { t:'Acknowledge the concern, offer a phased plan with support and a safety net.', r:'win', why:'Winning Strategy. Reassurance and a low-risk path satisfy the Amiable drive for Security & Harmony.' },
      { t:"Tell her the data says it'll be fine and move on.",                  r:'escalate', why:"Data alone doesn't reassure an Amiable; she needs to feel supported." },
    ]},
  { style:'expressive', name:'Marketing Mike', crisis:'"Leadership trashed my idea in front of everyone. I\'m done."',
    q:'Mike (Expressive) is stressed. Choose your path.',
    opts:[
      { t:'Recognise the spark in his idea, then co-build the next version together.', r:'win', why:'Winning Strategy. Recognition plus fresh ideas restores the Expressive drive for Recognition & Ideas.' },
      { t:'Send him a spreadsheet of why the idea failed.',                     r:'escalate', why:'Cold analysis deflates an Expressive and raises stress.' },
      { t:'Tell him to toughen up and stop being dramatic.',                    r:'escalate', why:'Denying recognition escalates an Expressive fast.' },
    ]},
]

export const L3: L3Item[] = [
  { multi:false, style:'driver', name:'CEO Clara', persona:'Driver — drive: Control & Achievement',
    situation:'Clara is calm but evaluating you. She has 5 minutes before her next meeting.',
    q:'Which opening best feeds her core drive?',
    opts:[
      { t:'"Here are the two best routes to your Q3 target, with the expected return on each — your call."', correct:true,  why:'Control + measurable achievement. Exactly the Driver drive.' },
      { t:'"Let me tell you the whole backstory of how we got here."',          correct:false, why:'Process narrative drains a Driver who wants control of the outcome.' },
      { t:'"I\'d love to hear how your weekend was first."',                    correct:false, why:"Relationship warmth is the Amiable drive, not the Driver's." },
    ]},
  { multi:false, style:'expressive', name:'Marketing Mike', persona:'Expressive — drive: Recognition & Ideas',
    situation:'Mike is pitching you his vision for the launch.',
    q:'Which response best feeds his core drive?',
    opts:[
      { t:'"That\'s a bold, original angle — let\'s build on it and put your name on the rollout."', correct:true, why:'Recognition + room for ideas. The Expressive drive.' },
      { t:'"Can you send me the supporting data tables first?"',                correct:false, why:"That satisfies an Analytical, not an Expressive who wants to be seen." },
      { t:'"Let\'s slow down and reduce the risk before anything."',            correct:false, why:"Caution speaks to the Amiable drive, deflating the Expressive." },
    ]},
  { multi:false, style:'amiable', name:'Support Sarah', persona:'Amiable — drive: Security & Harmony',
    situation:"Sarah likes you but hasn't committed to the change.",
    q:'Which response best feeds her core drive?',
    opts:[
      { t:'"We\'ll roll out gradually, I\'ll support your team personally, and we can pause anytime."', correct:true, why:'Security + harmony with a safety net. The Amiable drive.' },
      { t:'"Decide now — the deal expires tonight."',                           correct:false, why:"Urgency threatens an Amiable's need for security." },
      { t:'"The numbers are airtight, that should settle it."',                 correct:false, why:"Data reassures an Analytical, not an Amiable." },
    ]},
  { multi:true, name:'Boardroom: Alan + Mike', persona:'Multi-stakeholder — competing drives',
    situation:'Analytical CFO Alan wants proof; Expressive Marketing Mike wants his bold vision recognised. Both are in the room.',
    q:'Which single move best balances BOTH drives at once?',
    opts:[
      { t:'"Mike\'s vision is the headline — and here\'s the data set that proves it can deliver."', correct:true, why:'Recognition for Mike (Expressive) + evidence for Alan (Analytical). Both drives met.' },
      { t:'"Let\'s just go with the most exciting idea and sort the numbers later."', correct:false, why:"Pleases Mike but ignores Alan's drive for certainty." },
      { t:'"We\'ll only move once every figure is triple-checked."',             correct:false, why:"Satisfies Alan but starves Mike's need for recognition." },
    ]},
]

export const L4: L4Item[] = [
  { q:'Opening move with all four stakeholders watching:',
    opts:[
      { t:'Lead with a bold launch vision, lightly backed by headline data.',        quota:+8,  morale:+10, risk:+12, why:'Energises Expressive & Driver, but the thin data spikes Risk for the Analytical.' },
      { t:'Present a measured plan: clear ROI, phased rollout, full evidence pack.',  quota:+10, morale:+6,  risk:-8,  why:"Balanced. Hits the Driver's ROI and Analytical's evidence while keeping Risk low." },
      { t:'Spend the slot building rapport and reassurance only.',                    quota:-4,  morale:+12, risk:-2,  why:"Amiable loves it; Driver sees no progress on the number — Quota slips." },
    ]},
  { q:'Alan (Analytical) challenges your forecast model. You:',
    opts:[
      { t:'Open the model and walk the assumptions line-by-line.',                   quota:+6,  morale:+4,  risk:-12, why:'Transparency satisfies Analytical and cuts Risk sharply.' },
      { t:'Wave it off — "the vision matters more than the model."',                 quota:0,   morale:-8,  risk:+15, why:'Dismissing data alienates the Analytical and inflates Risk.' },
      { t:'Promise to send numbers later and push to the close.',                    quota:+4,  morale:-2,  risk:+8,  why:'Buys momentum but unresolved data keeps Risk elevated.' },
    ]},
  { q:"Sarah (Amiable) worries the team can't absorb the targets. You:",
    opts:[
      { t:'Bulldoze: "The quota is the quota."',                                     quota:+10, morale:-16, risk:+6,  why:"Short-term number, but Morale collapses and Amiable trust breaks." },
      { t:'Add a phased ramp with support — same target, safer path.',               quota:+6,  morale:+12, risk:-6,  why:'Protects Morale and Security while still advancing Quota.' },
      { t:'Drop the target to avoid any friction.',                                  quota:-10, morale:+6,  risk:-4,  why:"Harmony at the cost of the Driver's achievement goal." },
    ]},
  { q:'Clara (Driver) demands the close NOW. Final move:',
    opts:[
      { t:'Offer two decision-ready options with ROI and a clear recommendation.',   quota:+14, morale:+6,  risk:-4,  why:'Decisive + evidenced. Lands the Driver without spooking the others.' },
      { t:'Ask for another week to align everyone.',                                  quota:-8,  morale:+4,  risk:-2,  why:"A stressed Driver reads delay as failure — Quota momentum lost." },
      { t:'Close hard on price alone, skip the rationale.',                           quota:+6,  morale:-6,  risk:+10, why:'May win the moment but leaves Analytical & Amiable uneasy — Risk climbs.' },
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
  { n:2, title:'Crisis Mode',   sub:'Manage the stress meter under fire' },
  { n:3, title:'Drive Decoder', sub:'Satisfy the underlying drive' },
  { n:4, title:'The Boardroom', sub:'Balance Quota, Morale & Risk' },
]
