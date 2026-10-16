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
      'Acknowledge you want to give a precise answer, and use the follow-up as a chance to connect with them.',
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
    desc: "You are driven by results. You are highly motivated to reach and beat sales targets. You use smart selling methods and you know your competitors well. You move conversations toward business results quickly and with confidence. You do best when your performance is visible and rewarded.",
    strengths: ['Closing deals under pressure', 'Growing market share in competitive territories', 'Handling objections with confidence', 'Taking new business opportunities'],
    weaknesses: ['May focus on closing more than on long-term relationships', 'May use aggressive tactics under pressure', 'May resist feedback that is not directly about results', 'May burn out under constant target pressure'],
    motivate: ['Ambitious targets with clear performance bonuses', 'Sales contests and public recognition', 'Regular updates on competitors and the market', 'Coaching on advanced negotiation and closing skills'],
    develop: ['Training in relationship management and consultative selling', 'Mentoring to build empathy', 'Awareness of compliance and ethical selling', 'Taking part in educational events and KOL management'],
    tip: "Try the 70/30 rule: let the doctor talk 70% of the time. Your best pitch usually comes right after the doctor shares what matters most.",
    growth: "Your drive to sell is excellent. Now use it for deeper discovery. Understand what the doctor really needs before you present, and more doctors will say yes.",
  },
  connect: {
    name: 'The Connector',
    orient: 'Result-Oriented · People-Oriented',
    color: '#2D8F6A',
    gradient: 'linear-gradient(135deg, #2D8F6A, #1A6A4F)',
    traits: ['Empathetic', 'Relationship-driven', 'Trustworthy', 'Collaborative', 'Perceptive'],
    desc: "You build trust naturally and create lasting partnerships with healthcare professionals. Doctors and pharmacists look forward to your visits, not only for the product, but for you. You balance sales results with real care for relationships. You are good at understanding customer needs and offering solutions that fit their patients.",
    strengths: ['Keeping customers loyal', 'Building relationships with KOLs and other key people', 'Representing the brand over the long term', 'Working with accounts that have many prescribers'],
    weaknesses: ['May hesitate to close because you fear harming the relationship', 'May spend too much time on a small network', 'May give too little attention to data and sales numbers', 'May struggle to manage time across many relationships'],
    motivate: ['Chances to attend congresses and scientific events', 'Recognition as a brand ambassador', 'Tools for managing relationships and accounts', 'Working with the marketing and medical teams'],
    develop: ['Training in CRM tools and territory analysis', 'Sales forecasting and KPI tracking', 'Assertiveness and confidence in closing', 'Clear goal-setting and reporting habits'],
    tip: "After every important conversation, ask: 'Based on what you shared, would you try this with your next suitable patient?' Your relationship earns you the right to ask. Use it.",
    growth: "The trust you build is your biggest sales strength. The next step is to turn that trust into regular prescribing commitments by asking clearly and with confidence.",
  },
  plan: {
    name: 'The Planner',
    orient: 'Process-Oriented · Business-Oriented',
    color: '#2D6A8F',
    gradient: 'linear-gradient(135deg, #2D6A8F, #1A4F72)',
    traits: ['Analytical', 'Systematic', 'Detail-oriented', 'Methodical', 'Data-driven'],
    desc: "You bring structure, accuracy, and scientific credibility to everything you do. You manage your territory carefully: you watch KPIs, track progress, and use data to improve your sales plan. Doctors and managers trust your thoroughness. People come to you when a plan must be built, not only carried out.",
    strengths: ['Territory planning and KPI management', 'Detailing and clinical talks based on evidence', 'Following compliance and company rules', 'Finding prescribing trends step by step'],
    weaknesses: ['May analyze for too long before acting and adapt slowly', 'May seem cold or purely business-like to customers', 'May feel uncomfortable in emotional or unpredictable situations', 'May forget the customer experience behind the data'],
    motivate: ['Access to advanced CRM and analytics tools', 'Training in sales forecasting and territory planning', 'Taking part in process improvement projects', 'Clear KPIs and structured reports'],
    develop: ['Training in relationship management and emotional intelligence', 'Consultative selling: start with a story, then give data', 'Confidence in unplanned conversations', 'Presenting data as a clear, interesting story'],
    tip: "Prepare one 'insight opener' for each call: one data point or one patient story. Keep the full analysis until the doctor asks for it. Start with something interesting, then give the evidence.",
    growth: "Your careful, analytical approach is a strong base. Your next step is flexibility. Not every conversation needs a fixed structure. Let the doctor's situation shape your approach.",
  },
  support: {
    name: 'The Supporter',
    orient: 'Process-Oriented · People-Oriented',
    color: '#8F4D8A',
    gradient: 'linear-gradient(135deg, #8F4D8A, #6A3570)',
    traits: ['Compassionate', 'Principled', 'Reliable', 'Patient-focused', 'Collaborative'],
    desc: "You are the backbone of any strong team. Your honesty, patience, and real care for patients and colleagues build deep, lasting trust. You put compliance, ethical promotion, and education first. Healthcare professionals know they can rely on your honesty, and colleagues know you will always help.",
    strengths: ['Educating HCPs and organizing scientific events', 'Leading on compliance and ethical promotion', 'Supporting the team and sharing knowledge', 'Long-term relationship selling and patient support programs'],
    weaknesses: ['May put sales targets second to relationship work', 'May find it hard to be assertive or close in competitive situations', 'May give too much help to others and hurt your own results', 'May lack urgency when it is time to close'],
    motivate: ['Mentoring and peer-coaching roles', 'Helping to onboard new reps', 'Recognition for compliance and ethical work', 'Chances to lead educational or scientific events'],
    develop: ['Assertiveness training and sales confidence', 'Clear personal targets with check-ins', 'Joining sales contests to build competitive awareness', 'Coaching in advanced negotiation and closing'],
    tip: "At the start of each week, write one sales goal that is only yours, such as a specific account or a prescribing target. Make it visible. Your caring nature will work even better when you reach your own targets.",
    growth: "Your values and reliability are an advantage. Your challenge is to give yourself permission to be assertive in sales. Patients benefit most when you also reach your numbers.",
  },
}
