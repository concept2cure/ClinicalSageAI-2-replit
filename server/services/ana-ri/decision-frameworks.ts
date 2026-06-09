/**
 * Decision-frameworks pack — how AnA reasons about legitimate trade-offs.
 *
 * Three layers now sit under AnA's judgment:
 *   - industry-wisdom-pack: the pitfall lore (what experience teaches).
 *   - challenge-library: pushback when a client asserts something *wrong*.
 *   - decision-frameworks (this module): structure when a client faces a
 *     genuine strategic *choice* with no single right answer.
 *
 * A framework is not a recommendation. It is the way a veteran thinks the
 * choice through: what the trade-off actually is, the factors that tilt it
 * each way, and how to decide. AnA surfaces the relevant framework and then
 * helps the user apply it to their specifics — she does not impose the
 * answer, because the call (risk appetite, business priority) is theirs.
 *
 *     theTradeoff   → the real tension, stated plainly
 *     tiltsToward A → factors that favor option A
 *     tiltsToward B → factors that favor option B
 *     howToDecide   → the question that resolves it for this program
 *     basis         → the precedent / guidance the framework rests on
 *
 * Read by:
 *   - context-enrichment.ts (/decide command + trade-off language triggers)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/decision-frameworks
 */

import type { ClientSegment, LifecycleStage } from './industry-wisdom-pack.js';
import { SEGMENT_LABELS } from './industry-wisdom-pack.js';

// ─── Framework shape ─────────────────────────────────────────────────────────

export interface DecisionFramework {
  id: string;
  /** null = applies across all segments. */
  segment: ClientSegment | null;
  stage: LifecycleStage;
  /** The choice, named the way a client would phrase it. */
  choice: string;
  /** Phrases that signal the client is weighing this choice. */
  triggers: RegExp[];
  /** The real tension underneath the choice. */
  theTradeoff: string;
  /** The two options being weighed. */
  optionA: string;
  optionB: string;
  /** Factors that favor option A. */
  tiltsTowardA: string[];
  /** Factors that favor option B. */
  tiltsTowardB: string[];
  /** The question that resolves the choice for a specific program. */
  howToDecide: string;
  /** Precedent / guidance the framework rests on. */
  basis: string;
}

// ─── Cross-cutting frameworks ────────────────────────────────────────────────

const CROSS_CUTTING: DecisionFramework[] = [
  {
    id: 'd-speed-vs-certainty',
    segment: null,
    stage: 'strategy',
    choice: 'Go for an expedited pathway now, or build the fuller package first?',
    triggers: [
      /\b(?:accelerated|breakthrough|fast.?track|expedited|conditional)\b[^.?!]{0,30}\b(?:or|versus|vs\.?|instead of)\b/i,
      /\b(?:rush|speed|faster)\b[^.?!]{0,25}\b(?:approval|filing)\b[^.?!]{0,25}\b(?:or|versus|vs\.?|wait)/i,
      /\b(?:worth (?:it )?to|should we) (?:go for|pursue|chase)\b[^.?!]{0,25}\b(?:accelerated|breakthrough|conditional)/i,
    ],
    theTradeoff:
      'Speed to market against the certainty and durability of the approval. An expedited route gets you there sooner but on a thinner, more conditional footing.',
    optionA: 'Pursue the expedited pathway now',
    optionB: 'Build the fuller package first',
    tiltsTowardA: [
      'High unmet need and a credible surrogate the agency already accepts',
      'Competitive pressure where first-mover position has real value',
      'You can fund and start the confirmatory or post-market commitment now',
    ],
    tiltsTowardB: [
      'The surrogate is contested or the confirmatory plan is vague',
      'A conditional approval that later unwinds would cost more than the time saved',
      'Payers in your markets discount conditional or surrogate-based approvals',
    ],
    howToDecide:
      'Ask whether you can stand behind the confirmatory commitment today. If you cannot start it now, the expedited route is borrowing against credibility you have not earned yet.',
    basis: 'FDA expedited programs guidance (2014); FDORA 2022 confirmatory-trial provisions; EMA conditional MA.',
  },
  {
    id: 'd-sequential-vs-parallel',
    segment: null,
    stage: 'strategy',
    choice: 'File one region first, or file multiple regions in parallel?',
    triggers: [
      /\b(?:file|submit|launch)\b[^.?!]{0,30}\b(?:fda (?:first|then)|us (?:first|then)|sequential|one (?:region|market) (?:first|at a time))/i,
      /\b(?:parallel|simultaneous|same time|all (?:at once|markets))\b[^.?!]{0,30}\b(?:fil(?:e|ing)|submi|regions?|markets?)/i,
      /\b(?:fda|us)\b[^.?!]{0,15}\b(?:or|versus|vs\.?|then|before)\b[^.?!]{0,15}\b(?:ema|eu|europe|pmda|japan)/i,
    ],
    theTradeoff:
      'Learning and de-risking against speed and reliance leverage. Filing sequentially lets the first review inform the next; filing in parallel captures reliance windows and launches sooner.',
    optionA: 'Sequential — anchor region first, then expand',
    optionB: 'Parallel — file regions together',
    tiltsTowardA: [
      'The first agency interaction is likely to reshape the dossier',
      'Limited regulatory bandwidth to run multiple reviews at once',
      'You want one agency precedent to cite into the others',
    ],
    tiltsTowardB: [
      'A reliance or recognition route (Access Consortium, Project Orbis) rewards simultaneous filing',
      'Commercial urgency across markets is symmetric',
      'The dossier is stable enough that early feedback will not force rework',
    ],
    howToDecide:
      'Ask how much you expect the first review to change the file. High expected change favors sequencing; a stable dossier with a reliance window favors parallel.',
    basis: 'FDA Project Orbis; Access Consortium; WHO collaborative procedures.',
  },
  {
    id: 'd-presub-now-vs-proceed',
    segment: null,
    stage: 'pre_submission',
    choice: 'Spend a pre-submission meeting now, or proceed on your current read?',
    triggers: [
      /\b(?:pre.?sub|pre.?ind|pre.?nda|q.?sub|meeting)\b[^.?!]{0,25}\b(?:now|first|or just|or (?:proceed|go|file))/i,
      /\b(?:worth|need|should we (?:get|book|request))\b[^.?!]{0,20}\b(?:a )?(?:meeting|pre.?sub|agency feedback)/i,
    ],
    theTradeoff:
      'A meeting costs calendar time but converts an assumption into an agreement. Proceeding without one keeps the clock moving but carries the risk you guessed wrong.',
    optionA: 'Request the meeting now',
    optionB: 'Proceed on your current read',
    tiltsTowardA: [
      'A genuine uncertainty exists — novel endpoint, unagreed method, ambiguous predicate',
      'The cost of being wrong is a refuse-to-file or a redo of pivotal work',
      'You can frame a tight question list with your own position on each',
    ],
    tiltsTowardB: [
      'The path is well-trodden with clear precedent you can cite',
      'No question is load-bearing enough to change the program',
      'The meeting slot would delay a filing that is otherwise low-risk',
    ],
    howToDecide:
      'Name the single question you most want answered. If getting it wrong would cost more than the meeting delay, book the meeting.',
    basis: 'FDA Q-Submission program; pre-IND 21 CFR 312.82.',
  },
  {
    id: 'd-broad-vs-narrow-indication',
    segment: null,
    stage: 'strategy',
    choice: 'Pursue a broad initial indication, or a narrow one you can win cleanly?',
    triggers: [
      /\b(?:broad|wide|all.?comers|whole population)\b[^.?!]{0,25}\b(?:or|versus|vs\.?)\b[^.?!]{0,25}\b(?:narrow|focused|subgroup|restricted)/i,
      /\b(?:narrow|focused|restrict|subgroup)\b[^.?!]{0,25}\bindication\b/i,
      /\b(?:label|indication)\b[^.?!]{0,20}\b(?:broad|wide|narrow|focused)\b/i,
    ],
    theTradeoff:
      'Commercial ceiling against probability and speed of approval. A broad indication is worth more but is harder to power and defend; a narrow one wins faster and can expand later.',
    optionA: 'Broad initial indication',
    optionB: 'Narrow, defensible initial indication',
    tiltsTowardA: [
      'The mechanism and data support the broad population without subgroup heterogeneity',
      'A narrow label would strand most of the commercial value',
      'The trial can be powered for the broad claim without exploding the size',
    ],
    tiltsTowardB: [
      'The signal is concentrated in a definable subgroup',
      'Speed to a first approval matters and label expansion is a viable next step',
      'A broad claim risks a benefit-risk question across the diluting population',
    ],
    howToDecide:
      'Ask where the evidence is strongest. Win the indication the data defends cleanly, then expand from an approval rather than gambling the first one on breadth.',
    basis: 'ICH E4 (dose-response), E9(R1); label-expansion precedent.',
  },
];

// ─── Medical device / IVD frameworks ─────────────────────────────────────────

const MDX_FRAMEWORKS: DecisionFramework[] = [
  {
    id: 'd-510k-denovo-pma',
    segment: 'mdx',
    stage: 'strategy',
    choice: 'Which device pathway — 510(k), De Novo, or PMA?',
    triggers: [
      /\b510\(?k\)?\b[^.?!]{0,20}\b(?:or|versus|vs\.?)\b[^.?!]{0,20}\b(?:de.?novo|pma)/i,
      /\b(?:de.?novo)\b[^.?!]{0,20}\b(?:or|versus|vs\.?)\b[^.?!]{0,20}\b(?:510|pma)/i,
      /\bwhich (?:pathway|route|submission)\b[^.?!]{0,30}\b(?:device|510|pma|de.?novo)/i,
    ],
    theTradeoff:
      'Burden and time against the strength and breadth of the resulting clearance. 510(k) is fastest but needs a defensible predicate; De Novo creates your own classification; PMA is the highest bar but the strongest position.',
    optionA: '510(k) — claim equivalence to a predicate',
    optionB: 'De Novo or PMA — establish the device on its own evidence',
    tiltsTowardA: [
      'A clean, same-intended-use predicate exists',
      'Technology differences do not raise new safety or effectiveness questions',
      'Speed and cost are the dominant constraints',
    ],
    tiltsTowardB: [
      'No suitable predicate, or only distant ones with a troubled history (De Novo)',
      'Class III risk or a novel benefit-risk profile (PMA)',
      'A De Novo classification would give you a moat as the new predicate',
    ],
    howToDecide:
      'Start from the predicate question. A defensible predicate points to 510(k); no predicate but low-to-moderate risk points to De Novo; high risk points to PMA.',
    basis: '21 CFR 807 / 814; FDA SE guidance (2014); De Novo classification process.',
  },
  {
    id: 'd-clinical-vs-bench',
    segment: 'mdx',
    stage: 'clinical',
    choice: 'Support the claim with clinical data, or with bench and analytical performance?',
    triggers: [
      /\b(?:clinical (?:data|study|trial))\b[^.?!]{0,25}\b(?:or|versus|vs\.?|instead of)\b[^.?!]{0,25}\b(?:bench|performance|analytical|non.?clinical)/i,
      /\b(?:do we (?:really )?need|is .* needed)\b[^.?!]{0,20}\bclinical (?:data|study)\b/i,
    ],
    theTradeoff:
      'Cost and time of clinical evidence against the risk that bench data alone will not answer the agency question. Clinical data is expensive but sometimes the only thing that closes the gap.',
    optionA: 'Generate clinical data',
    optionB: 'Rely on bench / analytical performance',
    tiltsTowardA: [
      'The technology difference from the predicate raises a clinical question bench cannot answer',
      'The agency has signaled it expects clinical evidence for this device type',
      'The claim is a clinical-outcome claim, not a technical one',
    ],
    tiltsTowardB: [
      'Substantial equivalence can be shown by intended use plus validated bench performance',
      'The performance question is purely analytical (accuracy, precision, durability)',
      'A Pre-Sub has confirmed bench data will suffice',
    ],
    howToDecide:
      'Ask what question the difference from the predicate actually raises. If it is clinical, bench data will not retire it — confirm the expectation in a Pre-Sub before committing either way.',
    basis: 'FDA SE guidance (2014); device-specific guidance; Q-Submission feedback.',
  },
];

// ─── Biotech frameworks ──────────────────────────────────────────────────────

const BIOTECH_FRAMEWORKS: DecisionFramework[] = [
  {
    id: 'd-lock-process-vs-flexibility',
    segment: 'biotech',
    stage: 'nonclinical_cmc',
    choice: 'Lock the commercial process before the pivotal, or keep flexibility?',
    triggers: [
      /\block (?:the |our )?(?:commercial )?process\b[^.?!]{0,25}\b(?:before|or|versus|vs\.?)/i,
      /\b(?:freeze|fix|lock)\b[^.?!]{0,20}\bprocess\b[^.?!]{0,25}\b(?:pivotal|phase 3|or keep)/i,
      /\b(?:keep|maintain|retain)\b[^.?!]{0,15}\b(?:flexibility|optionality)\b[^.?!]{0,25}\b(?:process|manufacturing|cmc)/i,
    ],
    theTradeoff:
      'Comparability risk against manufacturing flexibility. Locking early means the pivotal material is the commercial material; staying flexible keeps options open but may owe a comparability bridge.',
    optionA: 'Lock the commercial process before the pivotal',
    optionB: 'Keep process flexibility into late development',
    tiltsTowardA: [
      'You have a credible commercial process and site now',
      'A late change would force a comparability or clinical bridge the timeline cannot absorb',
      'The product is sensitive to process (aggregation, glycosylation, potency)',
    ],
    tiltsTowardB: [
      'Real cost or capacity pressure makes the current process untenable at scale',
      'The molecule is robust and comparability risk is well understood',
      'You can budget the bridging study explicitly and the timeline allows it',
    ],
    howToDecide:
      'Ask whether the pivotal material will be the commercial material. If not, you are choosing to owe a comparability bridge — decide that on purpose, not by drift.',
    basis: 'ICH Q5E comparability; FDA/EMA post-change expectations.',
  },
  {
    id: 'd-surrogate-vs-clinical',
    segment: 'biotech',
    stage: 'clinical',
    choice: 'Power on a surrogate endpoint, or a definitive clinical outcome?',
    triggers: [
      /\bsurrogate\b[^.?!]{0,25}\b(?:or|versus|vs\.?|instead of)\b[^.?!]{0,25}\b(?:clinical|outcome|hard endpoint|survival)/i,
      /\b(?:clinical (?:outcome|endpoint)|overall survival)\b[^.?!]{0,25}\b(?:or|versus|vs\.?)\b[^.?!]{0,25}\bsurrogate/i,
      /\bwhich endpoint\b[^.?!]{0,30}\b(?:surrogate|clinical|outcome)/i,
    ],
    theTradeoff:
      'Trial speed and size against the strength of the approval. A surrogate reads out sooner and smaller; a clinical outcome is slower but definitive and harder to question later.',
    optionA: 'Power on a surrogate endpoint',
    optionB: 'Power on a definitive clinical outcome',
    tiltsTowardA: [
      'The surrogate is established and the agency already accepts it for the indication',
      'A clinical-outcome trial would be prohibitively long or large',
      'You intend an accelerated route with a confirmatory outcome trial underway',
    ],
    tiltsTowardB: [
      'The surrogate-to-benefit link is contested for your mechanism',
      'Payers in your markets will demand outcome data anyway',
      'A surrogate-based approval would be fragile to a later negative outcome read',
    ],
    howToDecide:
      'Ask how settled the surrogate-to-benefit link is for your specific mechanism. A contested surrogate buys speed you may have to repay with an outcome trial.',
    basis: 'FDA surrogate endpoint table; 21 CFR 314 Subpart H / 601 Subpart E; ICH E9(R1).',
  },
];

// ─── Pharma frameworks ───────────────────────────────────────────────────────

const PHARMA_FRAMEWORKS: DecisionFramework[] = [
  {
    id: 'd-build-vs-rely',
    segment: 'pharma',
    stage: 'strategy',
    choice: 'Generate your own data, or rely on a reference under 505(b)(2)?',
    triggers: [
      /\b505\(?b\)?\(?2\)?\b/i,
      /\b(?:rely on|reference|rely upon)\b[^.?!]{0,25}\b(?:listed drug|literature|prior (?:approval|data)|reference (?:product|drug))/i,
      /\b(?:generate|run) (?:our own|full)\b[^.?!]{0,20}\b(?:data|studies|program)\b[^.?!]{0,25}\b(?:or|versus|vs\.?|rely)/i,
    ],
    theTradeoff:
      'Development cost and time against the bridging burden and patent exposure of relying on data you did not generate.',
    optionA: 'Generate a full own-data program',
    optionB: 'Rely on a reference under 505(b)(2)',
    tiltsTowardA: [
      'No suitable reference, or the reference data does not cover your product',
      'You want a clean exclusivity and patent position',
      'The bridging studies would approach the cost of a full program anyway',
    ],
    tiltsTowardB: [
      'A well-characterized reference covers most of the safety and efficacy question',
      'Your product differs in a way that PK bridging can connect',
      'Speed and cost are the dominant constraints and the patent path is clear',
    ],
    howToDecide:
      'Scope the bridging data you would owe to justify reliance. If the bridge approaches a full program, reliance is not actually cheaper.',
    basis: 'FDA 505(b)(2) guidance; patent certification and exclusivity framework.',
  },
  {
    id: 'd-mrct-vs-bridging',
    segment: 'pharma',
    stage: 'clinical',
    choice: 'Run a multi-regional trial, or a separate regional bridging study for Asia?',
    triggers: [
      /\b(?:mrct|multi.?regional)\b[^.?!]{0,25}\b(?:or|versus|vs\.?)\b[^.?!]{0,25}\b(?:bridging|local|regional)/i,
      /\b(?:bridging study)\b[^.?!]{0,25}\b(?:or|versus|vs\.?)\b[^.?!]{0,25}\b(?:mrct|multi.?regional|global)/i,
      /\b(?:japan|china|pmda|nmpa)\b[^.?!]{0,25}\b(?:mrct|bridging|regional (?:data|trial))/i,
    ],
    theTradeoff:
      'Up-front trial complexity against downstream filing speed in Asia. An MRCT bakes regional data into the pivotal; a separate bridge keeps the pivotal simpler but adds a later study and filing lag.',
    optionA: 'One multi-regional trial under ICH E17',
    optionB: 'Global pivotal plus a separate regional bridge',
    tiltsTowardA: [
      'Asia is a strategic market you want to file in close behind the US/EU',
      'You can pre-agree regional sample sizes and harmonize endpoints',
      'Operational capability exists to run a genuinely multi-regional trial',
    ],
    tiltsTowardB: [
      'Asia is a later priority and a simpler global pivotal speeds the lead filing',
      'Regional regulatory expectations differ enough to complicate one protocol',
      'You lack the sites or operational reach for a true MRCT now',
    ],
    howToDecide:
      'Ask how close behind the lead filing you need Asia. Tight follow-on favors the MRCT; a later Asia priority favors a clean global pivotal plus a bridge.',
    basis: 'ICH E5(R1), E17; PMDA and NMPA local-data expectations.',
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

// ─── Global / multi-market frameworks ────────────────────────────────────────

const GLOBAL_FRAMEWORKS: DecisionFramework[] = [
  {
    id: 'g-reference-first-vs-parallel',
    segment: null,
    stage: 'strategy',
    choice: 'File the reference market first, or file multiple markets in parallel',
    triggers: [
      /\b(?:file|submit|launch)\b[^.?!]{0,40}\b(?:first|sequence|parallel|simultaneous)\b/i,
      /\b(?:which (?:market|region|agency)) (?:first|to file)/i,
      /\bsequenc\w+\b[^.?!]{0,30}\b(?:market|region|filing)/i,
    ],
    theTradeoff:
      'A strong reference-market decision (FDA/EMA) becomes leverage in reliance markets, but waiting for it delays revenue and access in the other markets.',
    optionA: 'File the reference market first, then use its decision in reliance/recognition routes elsewhere.',
    optionB: 'File the major markets in parallel to compress the global timeline.',
    tiltsTowardA: [
      'Many target markets offer reliance/recognition routes off a reference approval',
      'The reference decision is likely to be clean and quotable',
      'Bandwidth or budget limits how many full reviews you can run at once',
    ],
    tiltsTowardB: [
      'Markets are large enough to justify independent full reviews',
      'Competitive timing makes simultaneous launch decisive',
      'The dossier and labelling are stable enough to run several reviews together',
    ],
    howToDecide:
      'For each target market, ask whether it offers a reliance route off your reference approval and how much earlier a parallel filing would actually launch it; reserve parallel full reviews for the markets where reliance is unavailable or speed is worth the cost.',
    basis: 'WHO/ICMRA reliance frameworks; MHRA IRP; TGA comparable-overseas-regulator pathways.',
  },
  {
    id: 'g-accelerated-take-or-wait',
    segment: null,
    stage: 'strategy',
    choice: 'Take an accelerated/conditional approval now, or wait for the full data package',
    triggers: [
      /\b(?:accelerated|conditional|provisional)\b[^.?!]{0,30}\b(?:approval|pathway|now|wait)/i,
      /\b(?:surrogate|interim)\b[^.?!]{0,30}\bendpoint\b/i,
    ],
    theTradeoff:
      'Accelerated/conditional approval gets the product to patients earlier on less data, but it commits you to confirmatory work and carries withdrawal risk if the confirmation slips or fails.',
    optionA: 'Pursue accelerated/conditional approval on a surrogate or interim endpoint.',
    optionB: 'Wait and file on the complete outcome data.',
    tiltsTowardA: [
      'Serious condition with meaningful unmet need and a credible surrogate',
      'A confirmatory trial is already designed and can enrol quickly',
      'Earlier access has a decisive patient or competitive benefit',
    ],
    tiltsTowardB: [
      'The surrogate-to-outcome link is weak or contested',
      'The confirmatory trial would be slow or hard to enrol post-approval',
      'A failed confirmation would do more reputational/commercial damage than the delay',
    ],
    howToDecide:
      'Decide whether you can stand behind the surrogate and start the confirmatory trial immediately; if either is shaky, the full-data route is usually the lower-risk path.',
    basis: 'FDA Accelerated Approval (21 CFR 314 Subpart H / 601 Subpart E); EMA conditional MA (Reg 507/2006).',
  },
  {
    id: 'g-mrct-vs-local-bridging',
    segment: null,
    stage: 'clinical',
    choice: 'Run one multi-regional trial, or run a local bridging study for a region',
    triggers: [
      /\bmrct\b/i,
      /\bbridg\w+\b[^.?!]{0,30}\b(?:study|trial|data)/i,
      /\b(?:japan|china)\b[^.?!]{0,30}\b(?:trial|study|data|inclusion)/i,
    ],
    theTradeoff:
      'A single MRCT that includes a region avoids a separate bridging study, but it constrains the design (timing, sites, regional sizing) to that region’s expectations.',
    optionA: 'Include the region in one ICH E17 multi-regional trial.',
    optionB: 'Run the global trial without the region, then bridge locally (ICH E5).',
    tiltsTowardA: [
      'The region is a priority market worth designing for from the start',
      'You can meet the region’s sizing and consistency expectations in one trial',
      'Regulatory timing in the region aligns with the global program',
    ],
    tiltsTowardB: [
      'The region is a later-stage market and would slow the global trial',
      'Ethnic-factor sensitivity is low enough that a focused bridge suffices',
      'Operational constraints make including the region in the pivotal impractical',
    ],
    howToDecide:
      'Weigh the region’s commercial priority and ethnic-factor sensitivity against the design constraints of including it; a priority market with real ethnic-factor questions usually justifies designing the MRCT to include it.',
    basis: 'ICH E17; ICH E5(R1); PMDA/NMPA MRCT acceptance.',
  },
];

export const DECISION_FRAMEWORKS: DecisionFramework[] = [
  ...CROSS_CUTTING,
  ...MDX_FRAMEWORKS,
  ...BIOTECH_FRAMEWORKS,
  ...PHARMA_FRAMEWORKS,
  ...GLOBAL_FRAMEWORKS,
];

// ─── Detection ───────────────────────────────────────────────────────────────

/** Generic trade-off language — used to recognize that a choice is in play. */
const TRADEOFF_LANGUAGE = [
  /\b(?:should we|do we|better to|worth it to)\b[^.?!]{0,40}\b(?:or|versus|vs\.?)\b/i,
  /\b(?:trade.?off|trade off|pros and cons|which (?:is better|makes more sense|should we (?:pick|choose)))\b/i,
  /\b(?:decide between|choosing between|torn between|weighing)\b/i,
];

/**
 * Detect decision frameworks relevant to the user's message. Returns frameworks
 * whose specific triggers match, optionally narrowed to a segment (cross-cutting
 * frameworks always remain eligible).
 */
export function detectRelevantFrameworks(
  message: string,
  segment?: ClientSegment | null,
): DecisionFramework[] {
  return DECISION_FRAMEWORKS.filter((f) => {
    const segOk = f.segment === null || !segment || f.segment === segment;
    if (!segOk) return false;
    return f.triggers.some((t) => t.test(message));
  });
}

/** True when the message contains generic trade-off language. */
export function looksLikeTradeoff(message: string): boolean {
  return TRADEOFF_LANGUAGE.some((t) => t.test(message));
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a Markdown block giving AnA the relevant decision framework(s). Returns
 * '' when no framework matches — unless forceGeneric is set, in which case it
 * emits a general "how to think about this trade-off" instruction so an
 * explicit /decide always does work.
 */
export function buildDecisionFrameworkBlock(opts: {
  message: string;
  segment?: ClientSegment | null;
  limit?: number;
  forceGeneric?: boolean;
}): string {
  const matched = detectRelevantFrameworks(opts.message, opts.segment).slice(0, opts.limit ?? 2);

  if (matched.length === 0) {
    if (!opts.forceGeneric) return '';
    return (
      '\n\n## Decision framework — think the trade-off through\n' +
      'The user is weighing a strategic choice. Do not jump to an answer. First name the real trade-off underneath their ' +
      'options, lay out the two or three factors that tilt it each way for a program like theirs, and then give them the ' +
      'single question that resolves it. The call is theirs — risk appetite and business priority are not yours to set. ' +
      'Surface the trade-off honestly, recommend if you have a basis, and let them decide.'
    );
  }

  const lines = matched.map((f) => {
    const scope = f.segment === null ? 'all segments' : SEGMENT_LABELS[f.segment];
    return (
      `### ${f.choice}\n` +
      `_${scope} · ${f.stage.replace(/_/g, ' ')}_\n` +
      `- **The real trade-off:** ${f.theTradeoff}\n` +
      `- **Tilts toward "${f.optionA}":** ${f.tiltsTowardA.join('; ')}.\n` +
      `- **Tilts toward "${f.optionB}":** ${f.tiltsTowardB.join('; ')}.\n` +
      `- **How to decide:** ${f.howToDecide}\n` +
      `- **Basis:** ${f.basis}`
    );
  });

  return (
    '\n\n## Decision framework — help them reason, do not decide for them\n' +
    'The user is weighing a real strategic choice. Apply the framework(s) below: name the trade-off, lay out what tilts it ' +
    'each way for their specifics, and give them the deciding question. Recommend where you have a basis, but the call — ' +
    'risk appetite, business priority — is theirs. Do not pretend a hard trade-off has one obvious answer.\n\n' +
    lines.join('\n\n')
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getFramework(id: string): DecisionFramework | null {
  return DECISION_FRAMEWORKS.find((f) => f.id === id) ?? null;
}

export function listFrameworksForSegment(segment: ClientSegment): DecisionFramework[] {
  return DECISION_FRAMEWORKS.filter((f) => f.segment === segment || f.segment === null);
}
