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
