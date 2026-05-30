/**
 * Stakeholder-alignment pack — the internal / organizational layer.
 *
 * Every other pack is agency- and science-facing: what to build, what to
 * decide, how to talk to the regulator. But programs stall as often on
 * internal misalignment as on the science — CMC and clinical disagreeing on
 * timelines, commercial wanting a label the data will not carry, a board that
 * wants a date, a CRO that owns the data. A great advisor helps the client
 * navigate the people, not just the file.
 *
 * This module gives AnA plays for those moments. It is not org-chart advice;
 * it ties each internal tension back to its regulatory consequence, so the
 * alignment conversation is grounded in what actually moves the program.
 *
 * Each play is:
 *     tension  → the internal friction
 *     insight  → what an experienced operator understands about it
 *     move     → how to resolve it, tied to regulatory consequence
 *     watchOut → the failure mode
 *     basis    → the precedent / pattern it rests on
 *
 * Read by:
 *   - context-enrichment.ts (/align command + stakeholder-tension triggers)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/stakeholder-alignment
 */

import type { ClientSegment } from './industry-wisdom-pack.js';
import { SEGMENT_LABELS } from './industry-wisdom-pack.js';

/** Who the internal tension sits between. */
export type StakeholderAxis =
  | 'cross_functional'  // CMC vs clinical vs reg, internal teams
  | 'commercial'        // commercial / marketing label ambitions
  | 'executive'         // board / CEO / investors
  | 'external_partner'; // CRO, CDMO, licensing partner

export interface AlignmentPlay {
  id: string;
  /** null = applies across all segments. */
  segment: ClientSegment | null;
  axis: StakeholderAxis;
  /** The internal friction. */
  tension: string;
  /** Phrases that signal the user is in this situation. */
  triggers: RegExp[];
  /** What an experienced operator understands about it. */
  insight: string;
  /** How to resolve it, tied to regulatory consequence. */
  move: string;
  /** The failure mode. */
  watchOut: string;
  /** Precedent / pattern it rests on. */
  basis: string;
}

// ─── Cross-functional ────────────────────────────────────────────────────────

const CROSS_FUNCTIONAL: AlignmentPlay[] = [
  {
    id: 'sa-cmc-clinical-timeline',
    segment: null,
    axis: 'cross_functional',
    tension: 'CMC and clinical disagree on the program timeline.',
    triggers: [
      /\b(?:cmc|manufacturing)\b[^.?!]{0,30}\b(?:and|vs\.?|versus)\b[^.?!]{0,20}\bclinical\b[^.?!]{0,25}\b(?:timeline|schedule|disagree|conflict|aligned?)/i,
      /\b(?:clinical|cmc)\b[^.?!]{0,25}\b(?:wants?|pushing|says)\b[^.?!]{0,30}\b(?:different|faster|slower) (?:timeline|date)/i,
    ],
    insight:
      'The disagreement is usually about a hidden dependency neither side owns end to end — most often the comparability bridge or stability data that gates the filing regardless of how fast the clinic moves.',
    move:
      'Surface the load-bearing dependency explicitly and make the decision against it, not against either team\'s preferred date. Name the regulatory consequence of each path (a comparability bridge owed, a stability gap at filing) so the trade-off is visible.',
    watchOut:
      'Letting the louder function set the date. The schedule that ignores the gating CMC dependency is the one that slips at submission.',
    basis: 'ICH Q5E/Q1A dependency on the filing critical path.',
  },
  {
    id: 'sa-function-owns-its-risk',
    segment: null,
    axis: 'cross_functional',
    tension: 'A risk is falling between functions because no one clearly owns it.',
    triggers: [
      /\b(?:no one|nobody|unclear who) (?:owns|is responsible for|is on the hook)/i,
      /\b(?:falling through the cracks|between (?:teams|functions)|orphan(?:ed)? (?:risk|item|workstream))/i,
    ],
    insight:
      'Unowned risks are the ones that surface as deficiencies, because no single function felt accountable to close them before filing.',
    move:
      'Assign every load-bearing risk a single named owner with the authority to close it, and tie the ownership to the submission section it affects so accountability is concrete.',
    watchOut:
      'Diffuse, committee-level ownership that means no one actually drives the item to closure.',
    basis: 'Recurring deficiency pattern from unowned cross-functional gaps.',
  },
];

// ─── Commercial ──────────────────────────────────────────────────────────────

const COMMERCIAL: AlignmentPlay[] = [
  {
    id: 'sa-commercial-label-ambition',
    segment: null,
    axis: 'commercial',
    tension: 'Commercial wants a broader label or claim than the data will carry.',
    triggers: [
      /\b(?:commercial|marketing|sales)\b[^.?!]{0,30}\b(?:wants?|pushing for|needs?)\b[^.?!]{0,25}\b(?:broad|broader|stronger|superiority|claim|label|indication)/i,
      /\b(?:broader|stronger|superiority) (?:claim|label|indication)\b[^.?!]{0,30}\b(?:commercial|marketing|business)/i,
    ],
    insight:
      'A label claim is bounded by what you proved to the agency, not by what the market would value. The gap between the two is an evidence-cost decision, not a messaging decision.',
    move:
      'Translate the desired claim into the study it would require and the time and cost that adds, then let commercial and the board decide the claim with that price visible. Anchor the conversation on the approved-label standard.',
    watchOut:
      'Building the program around a claim the label will not carry, then discovering it at the pre-NDA meeting. Promising commercial a claim you cannot underwrite.',
    basis: 'FDA comparative-claims and superiority evidentiary standards; approved-label scope.',
  },
  {
    id: 'sa-launch-pressure-vs-readiness',
    segment: null,
    axis: 'commercial',
    tension: 'Commercial launch planning is pressuring the filing date past readiness.',
    triggers: [
      /\b(?:launch|commercial) (?:date|timeline|pressure|deadline)\b[^.?!]{0,30}\b(?:filing|submission|readiness|file)/i,
      /\b(?:pressure to file|file (?:early|sooner)|move up the (?:filing|date))\b/i,
    ],
    insight:
      'A filing forced to a launch date rather than a readiness state does not actually launch sooner — a refuse-to-file or a review-cycle deficiency moves the launch further out than the wait would have.',
    move:
      'Show the launch team the expected-value timeline: readiness-driven filing versus the probability-weighted cost of a deficiency from filing early. Let them see that on-time-but-incomplete is usually the slower path to market.',
    watchOut:
      'Treating the filing date as a commercial commitment rather than a readiness gate.',
    basis: 'FDA refuse-to-file / complete-response cycle costs.',
  },
];

// ─── Executive / board ───────────────────────────────────────────────────────

const EXECUTIVE: AlignmentPlay[] = [
  {
    id: 'sa-board-wants-a-date',
    segment: null,
    axis: 'executive',
    tension: 'The board or CEO wants a firm date and a confident story.',
    triggers: [
      /\b(?:board|ceo|leadership|exec(?:utive)?s?|investors?)\b[^.?!]{0,30}\b(?:wants?|asking for|expects?|needs?)\b[^.?!]{0,25}\b(?:date|timeline|deadline|certainty|confidence|guarantee|commitment)\b/i,
      /\b(?:board (?:meeting|update|deck)|investor (?:update|deck))\b/i,
    ],
    insight:
      'Leadership is choosing whether to commit capital, and false confidence costs more later than honest uncertainty costs now. They need a defensible path, not optimism.',
    move:
      'Give them a dated path with the next two de-risking milestones, the specific risk each one retires, and the named conditions that would change the plan. Confidence comes from the structure, not from a single promised date.',
    watchOut:
      'Giving a hard date you cannot defend to avoid a hard conversation. A missed promised date costs more credibility than a well-framed range.',
    basis: 'Due-diligence and board-governance pattern; milestone-based de-risking.',
  },
  {
    id: 'sa-deliver-bad-news-up',
    segment: null,
    axis: 'executive',
    tension: 'You have to tell leadership the program slipped or hit a setback.',
    triggers: [
      /\b(?:tell|brief|update|inform)\b[^.?!]{0,20}\b(?:the )?(?:board|ceo|leadership|exec|investors)\b[^.?!]{0,30}\b(?:bad news|delay|slip|setback|problem|miss)/i,
      /\b(?:how (?:do|to)) (?:i|we) (?:tell|explain to|brief)\b[^.?!]{0,20}\b(?:the )?(?:board|ceo|leadership)/i,
    ],
    insight:
      'Leadership can absorb bad news; what erodes trust is being surprised, or hearing a problem without a plan. The delivery is what they remember.',
    move:
      'Lead with the impact in one line, then the recovery path and the decision you need from them. Bring the revised dated milestones, not just the slip. Own it without drama.',
    watchOut:
      'Softening the news into ambiguity, or arriving with a problem and no proposed path. Both read as not being in control.',
    basis: 'Executive risk-communication practice.',
  },
];

// ─── External partners ───────────────────────────────────────────────────────

const EXTERNAL_PARTNER: AlignmentPlay[] = [
  {
    id: 'sa-cro-owns-the-data',
    segment: null,
    axis: 'external_partner',
    tension: 'A CRO or CDMO holds data or process you depend on for the filing.',
    triggers: [
      /\b(?:cro|cdmo|cmo|vendor|partner|contractor)\b[^.?!]{0,30}\b(?:owns|holds|controls|has)\b[^.?!]{0,20}\b(?:the )?(?:data|process|material|batch records?)/i,
      /\b(?:rely(?:ing)? on|depend(?:ing)? on|outsourced? to)\b[^.?!]{0,20}\b(?:a |the )?(?:cro|cdmo|cmo|partner)/i,
    ],
    insight:
      'Your submission is only as defensible as your access to and oversight of the partner\'s data and process. Reviewers hold you, the sponsor, accountable regardless of who did the work.',
    move:
      'Build data access, quality oversight, and audit rights into the relationship before the pivotal or registration batches — not after. Confirm you can produce the records and respond to a deficiency without depending on the partner\'s goodwill.',
    watchOut:
      'Discovering at filing that you cannot get the raw data, the batch records, or the method details the agency asks for because the contract did not secure them.',
    basis: 'FDA sponsor accountability (21 CFR 312/211); GCP/GMP oversight expectations.',
  },
  {
    id: 'sa-licensing-partner-misaligned',
    segment: null,
    axis: 'external_partner',
    tension: 'A licensing or co-development partner has different regulatory priorities.',
    triggers: [
      /\b(?:licensing|co.?develop|alliance|partner(?:ship)?)\b[^.?!]{0,30}\b(?:different|conflict|disagree|misalign|priorities|territories?)/i,
      /\b(?:partner)\b[^.?!]{0,20}\b(?:wants?|prefers?)\b[^.?!]{0,25}\b(?:different (?:region|strategy|filing)|their territory)/i,
    ],
    insight:
      'Partners optimize for their own territory and timeline, which can pull the global regulatory strategy in directions that suboptimize the lead filing.',
    move:
      'Separate the decisions that must be global (the pivotal design, the core dossier) from those that can be territory-specific, and govern the global ones jointly with a clear decision rule. Protect the lead filing from territory-driven compromises.',
    watchOut:
      'Letting a partner\'s territorial preference reshape the pivotal or the core dossier in a way that weakens the lead-market submission.',
    basis: 'ICH E17 multi-regional design; alliance-governance pattern.',
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const ALIGNMENT_PLAYS: AlignmentPlay[] = [
  ...CROSS_FUNCTIONAL,
  ...COMMERCIAL,
  ...EXECUTIVE,
  ...EXTERNAL_PARTNER,
];

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect stakeholder-alignment plays relevant to the message, optionally
 * narrowed to a segment (cross-cutting plays always remain eligible) and an axis.
 */
export function detectRelevantAlignment(
  message: string,
  opts: { segment?: ClientSegment | null; axis?: StakeholderAxis } = {},
): AlignmentPlay[] {
  return ALIGNMENT_PLAYS.filter((p) => {
    const segOk = p.segment === null || !opts.segment || p.segment === opts.segment;
    const axisOk = !opts.axis || p.axis === opts.axis;
    if (!segOk || !axisOk) return false;
    return p.triggers.some((re) => re.test(message));
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a Markdown block giving AnA the relevant stakeholder-alignment plays.
 * Returns '' when nothing matches — unless forceGeneric is set, in which case
 * it emits a general "align the people, tied to regulatory consequence"
 * instruction so an explicit /align always does work.
 */
export function buildAlignmentBlock(opts: {
  message: string;
  segment?: ClientSegment | null;
  axis?: StakeholderAxis;
  limit?: number;
  forceGeneric?: boolean;
}): string {
  const matched = detectRelevantAlignment(opts.message, { segment: opts.segment, axis: opts.axis }).slice(
    0,
    opts.limit ?? 3,
  );

  if (matched.length === 0) {
    if (!opts.forceGeneric) return '';
    return (
      '\n\n## Stakeholder alignment — align the people, grounded in consequence\n' +
      'The user is navigating an internal or partner tension. Help them resolve it the way a seasoned operator would: ' +
      'name the real friction, tie it to the regulatory consequence that makes it matter, and give a concrete way to align ' +
      'the parties around what actually moves the program. The internal decision is theirs; your job is to make the ' +
      'trade-off and its program impact visible.'
    );
  }

  const axisLabel: Record<StakeholderAxis, string> = {
    cross_functional: 'Cross-functional',
    commercial: 'Commercial',
    executive: 'Executive / board',
    external_partner: 'External partner',
  };

  const lines = matched.map((p) => {
    const scope = p.segment === null ? 'all segments' : SEGMENT_LABELS[p.segment];
    return (
      `### ${p.tension}\n` +
      `_${axisLabel[p.axis]} · ${scope}_\n` +
      `- **What is really going on:** ${p.insight}\n` +
      `- **How to align:** ${p.move}\n` +
      `- **Watch out for:** ${p.watchOut}\n` +
      `- **Basis:** ${p.basis}`
    );
  });

  return (
    '\n\n## Stakeholder alignment — the internal side of the program\n' +
    'The user is navigating a people problem, not only a science problem. Apply the plays below: name the tension, tie it to ' +
    'the regulatory consequence that makes it matter, and give a concrete way to align the parties. The internal call is ' +
    'theirs; make the trade-off and its program impact visible.\n\n' +
    lines.join('\n\n')
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getAlignmentPlay(id: string): AlignmentPlay | null {
  return ALIGNMENT_PLAYS.find((p) => p.id === id) ?? null;
}

export function listAlignmentByAxis(axis: StakeholderAxis): AlignmentPlay[] {
  return ALIGNMENT_PLAYS.filter((p) => p.axis === axis);
}
