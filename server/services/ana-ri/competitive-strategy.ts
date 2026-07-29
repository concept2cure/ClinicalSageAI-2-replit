/**
 * Competitive-strategy pack — how to read precedent and position against the field.
 *
 * The platform's precedent engine pulls the data: who got approved, what the
 * label says, which programs failed. This module supplies the judgment layer —
 * how to interpret that data and turn it into a position:
 *   - precedent_reading → when a precedent actually transfers, and when it does not
 *   - positioning       → how to place your program relative to what exists
 *   - differentiation   → how to differentiate on the axis the agency rewards
 *
 * Each play is:
 *     situation → when it applies
 *     insight   → the principle a veteran holds
 *     move      → what to do with it
 *     watchOut  → the failure mode it avoids
 *     basis     → the precedent / guidance / pattern it rests on
 *
 * Read by:
 *   - context-enrichment.ts (/position, /landscape, /compete commands +
 *     competitive-positioning language triggers)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/competitive-strategy
 */

import type { ClientSegment } from './industry-wisdom-pack.js';
import { SEGMENT_LABELS } from './industry-wisdom-pack.js';

export type CompetitiveFocus = 'precedent_reading' | 'positioning' | 'differentiation';

export interface CompetitivePlay {
  id: string;
  /** null = applies across all segments. */
  segment: ClientSegment | null;
  focus: CompetitiveFocus;
  /** When this play applies. */
  situation: string;
  /** Phrases that signal the user is in this situation. */
  triggers: RegExp[];
  /** The principle a veteran holds. */
  insight: string;
  /** What to do with it. */
  move: string;
  /** The failure mode it avoids. */
  watchOut: string;
  /** Precedent / guidance / pattern the play rests on. */
  basis: string;
}

// ─── Precedent reading ───────────────────────────────────────────────────────

const PRECEDENT_READING: CompetitivePlay[] = [
  {
    id: 'cs-precedent-transfers-when-comparison-holds',
    segment: null,
    focus: 'precedent_reading',
    situation: 'You found an approval you want to cite as precedent for your path.',
    triggers: [
      /\b(?:cite|use|lean on|rely on)\b[^.?!]{0,25}\b(?:precedent|prior approval|approved (?:product|drug|device))/i,
      /\b(?:does|can|is)\b[^.?!]{0,25}\bprecedent\b[^.?!]{0,20}\b(?:apply|transfer|hold|work for us)/i,
    ],
    insight:
      'A precedent transfers only when the comparison actually holds: same indication, same endpoint, same review division, same era of guidance. A close-looking approval from a different division or a pre-guidance era is a weak citation.',
    move:
      'Before citing a precedent, check the four axes — indication, endpoint, division, guidance era. Cite the ones that match exactly and concede the ones that do not, rather than letting the reviewer find the gap.',
    watchOut:
      'Citing a superficially similar approval that the reviewer can distinguish on one axis damages the credibility of your whole argument.',
    basis: 'FDA review-division consistency practice; guidance-era dependence of precedent.',
  },
  {
    id: 'cs-approval-template-crl-checklist',
    segment: null,
    focus: 'precedent_reading',
    situation: 'You are studying how comparable programs fared with the agency.',
    triggers: [
      /\b(?:how did|what did)\b[^.?!]{0,30}\b(?:get approved|win approval|fail|get a crl)/i,
      /\b(?:comparable|similar) (?:programs?|products?|approvals?|submissions?)\b/i,
    ],
    insight:
      'The closest approval is your template; the closest complete-response or refuse-to-file is your checklist. Approvals show what cleared the bar; rejections show exactly where the bar was.',
    move:
      'Build two reference sets — the nearest approvals to model your argument on, and the nearest negative actions to pre-empt. Map each deficiency in the negative set to a section of your own file.',
    watchOut:
      'Studying only the success cases leaves you blind to the specific failure modes the division has already punished.',
    basis: 'FDA CRL / RTF patterns; advisory committee and approval-package review.',
  },
  {
    id: 'cs-adcomm-is-richest-precedent',
    segment: null,
    focus: 'precedent_reading',
    situation: 'A comparable product went to an advisory committee.',
    triggers: [
      /\b(?:advisory committee|adcomm|odac|ad.?com|panel meeting)\b/i,
    ],
    insight:
      'The advisory committee transcript and briefing documents are the richest precedent you can get: they show the real debate, the division\'s actual concerns, and the questions that decided the vote.',
    move:
      'Read the FDA and sponsor briefing documents and the transcript for any comparable AdComm. The questions the committee was asked are the questions you should be ready to answer.',
    watchOut:
      'Reading only the outcome of an AdComm misses the reasoning that will resurface in your own review.',
    basis: 'FDA advisory committee briefing materials and transcripts (public).',
  },
  {
    id: 'cs-benchmark-design-not-outcome',
    segment: null,
    focus: 'precedent_reading',
    situation: 'You are benchmarking your trial against a competitor\'s.',
    triggers: [
      /\bbenchmark\b[^.?!]{0,25}\b(?:trial|study|design|program|competitor)/i,
      /\b(?:match|mirror|copy)\b[^.?!]{0,20}\b(?:competitor|their) (?:trial|study|design)/i,
    ],
    insight:
      'Benchmark against the precedent\'s trial design, not its outcome. A competitor\'s positive result on a different endpoint, population, or comparator does not transfer to your program just because the molecule is similar.',
    move:
      'Compare design choices line by line — endpoint, comparator, population, analysis — and only borrow the choices the agency actually accepted. Treat their outcome as context, not as your expected result.',
    watchOut:
      'Assuming a competitor\'s win predicts yours, when the win rode on a design choice you did not replicate.',
    basis: 'ICH E9(R1), E10; comparator and endpoint precedent.',
  },
];

// ─── Positioning ─────────────────────────────────────────────────────────────

const POSITIONING: CompetitivePlay[] = [
  {
    id: 'cs-position-against-the-label',
    segment: null,
    focus: 'positioning',
    situation: 'You are positioning your program against an approved competitor.',
    triggers: [
      /\b(?:position|positioning)\b[^.?!]{0,25}\b(?:against|versus|vs\.?|relative to)\b/i,
      /\b(?:compete|competing|competitive)\b[^.?!]{0,25}\b(?:against|with|landscape|position)/i,
      /\bcompetitive landscape\b/i,
    ],
    insight:
      'Position against the competitor\'s approved label, not their press release or investor deck. The label is the only statement of what they actually proved to the agency, and it is the bar you will be measured against.',
    move:
      'Pull the approved label and read the indication wording, the limitations of use, and the warnings. Build your positioning and your evidence plan against what the label actually claims.',
    watchOut:
      'Positioning against marketing claims that exceed the label leaves you targeting a bar the competitor never actually cleared.',
    basis: 'FDA approved labeling (USPI); EMA SmPC.',
  },
  {
    id: 'cs-first-in-class-sets-precedent',
    segment: null,
    focus: 'positioning',
    situation: 'You are first-in-class with no real precedent.',
    triggers: [
      /\bfirst.?in.?class\b/i,
      /\b(?:no|without)\b[^.?!]{0,15}\bprecedent\b/i,
      /\b(?:novel|new) (?:mechanism|class|pathway)\b[^.?!]{0,25}\b(?:no precedent|first)/i,
    ],
    insight:
      'When you are first, there is no precedent to cite — so you set it. The endpoint you validate and the path you negotiate become the template every fast-follower will use against you and with you.',
    move:
      'Engage the agency early to co-define the endpoint and the evidentiary standard, because you are writing the rulebook. Document those agreements carefully; they are your precedent.',
    watchOut:
      'Waiting for a precedent that does not exist, or letting the agency set the endpoint reactively rather than negotiating it.',
    basis: 'FDA novel-endpoint and first-in-class engagement practice.',
  },
  {
    id: 'cs-fast-follower-inherits-playbook',
    segment: null,
    focus: 'positioning',
    situation: 'You are a fast-follower behind a first-in-class approval.',
    triggers: [
      /\b(?:fast.?follow|second.?to.?file|me.?too|follow.?on)\b/i,
      /\b(?:behind|after)\b[^.?!]{0,20}\b(?:the )?(?:first|incumbent|leader)\b[^.?!]{0,20}\bapprov/i,
    ],
    insight:
      'A fast-follower inherits both the first mover\'s scrutiny and the first mover\'s playbook. The endpoint is settled and the path is mapped, but the division now knows the class risks and will look for them in you.',
    move:
      'Adopt the validated endpoint and the negotiated path the first mover established, and pre-empt the class-level risks the division surfaced in their review.',
    watchOut:
      'Assuming the path is now easy; the division\'s class-level concerns are sharper, not duller, after the first approval.',
    basis: 'FDA class-precedent review behavior.',
  },
];

// ─── Differentiation ─────────────────────────────────────────────────────────

const DIFFERENTIATION: CompetitivePlay[] = [
  {
    id: 'cs-differentiate-on-agency-axis',
    segment: null,
    focus: 'differentiation',
    situation: 'You are deciding how to differentiate from an incumbent.',
    triggers: [
      /\bdifferentiate\b/i,
      /\b(?:how|what)\b[^.?!]{0,20}\b(?:stand out|set us apart|advantage over)\b/i,
    ],
    insight:
      'Differentiate on the axis the agency rewards in the label — a real safety or efficacy delta — not on the axis marketing prefers. Convenience and dosing differences rarely earn a labeled superiority claim.',
    move:
      'If you want a differentiation reflected in the label, power a head-to-head or a non-inferiority-plus-safety design on the axis the agency will recognize. Otherwise, position the convenience benefit honestly as off-label-of-the-claim messaging.',
    watchOut:
      'Building the program around a convenience claim and then discovering the label will not carry it.',
    basis: 'FDA comparative-claims and superiority-claim evidentiary standards.',
  },
  {
    id: 'cs-failed-confirmatory-is-a-warning',
    segment: null,
    focus: 'differentiation',
    situation: 'A competitor took an accelerated path that later unwound.',
    triggers: [
      /\b(?:accelerated|conditional)\b[^.?!]{0,30}\b(?:withdrawn|failed|pulled|unwound|confirmatory failed)/i,
      /\b(?:competitor|they)\b[^.?!]{0,20}\b(?:withdrew|pulled|lost)\b[^.?!]{0,20}\bapprov/i,
    ],
    insight:
      'A competitor\'s accelerated approval that later failed its confirmatory trial is a warning, not an opening. The division will be more skeptical of the surrogate and the path, not less.',
    move:
      'If you are following a path that unwound for a competitor, strengthen exactly the link that failed — usually the surrogate-to-benefit connection — and expect a higher bar, not a clear lane.',
    watchOut:
      'Reading a competitor\'s withdrawal as a market opening while ignoring that it raised the agency\'s bar for the whole approach.',
    basis: 'FDA accelerated-approval withdrawal precedent; FDORA 2022.',
  },
  {
    id: 'cs-precedent-not-binding-across-regions',
    segment: null,
    focus: 'differentiation',
    situation: 'You want to use an FDA approval to argue an EMA or PMDA path.',
    triggers: [
      /\b(?:fda approval|us approval|approved in the us)\b[^.?!]{0,30}\b(?:ema|eu|europe|pmda|japan|china|nmpa)/i,
      /\b(?:same|reuse)\b[^.?!]{0,20}\bargument\b[^.?!]{0,25}\b(?:ema|eu|pmda|other regions?)/i,
    ],
    insight:
      'A precedent in one region is persuasive but not binding in another. FDA acceptance of an endpoint or path does not obligate EMA or PMDA, which may weigh the same evidence differently.',
    move:
      'Use the FDA precedent as supporting context in scientific advice, but build the regional argument on that region\'s own guidance and any local precedent. Confirm endpoint acceptability per region before assuming transfer.',
    watchOut:
      'Assuming an FDA win pre-clears the EMA or PMDA path and discovering a different endpoint or population expectation late.',
    basis: 'ICH regional implementation differences; EMA scientific advice; PMDA consultation.',
  },
  {
    id: 'cs-predicate-not-clinical-precedent',
    segment: 'mdx',
    focus: 'differentiation',
    situation: 'You want to extend a cleared predicate to a new clinical claim.',
    triggers: [
      /\bpredicate\b[^.?!]{0,25}\b(?:new|expanded|different) (?:claim|indication|use)/i,
      /\b(?:cleared|510\(?k\)?)\b[^.?!]{0,25}\bclinical claim\b/i,
    ],
    insight:
      'A cleared predicate is precedent for substantial equivalence, not for a new clinical claim. Equivalence to a marketed device does not validate a claim that device never made.',
    move:
      'If your claim goes beyond the predicate\'s cleared intended use, plan the clinical evidence to support the new claim directly, or consider De Novo rather than stretching the 510(k).',
    watchOut:
      'Treating a 510(k) clearance as if it validated a clinical-outcome claim the predicate never carried.',
    basis: '21 CFR 807.92; FDA intended-use and SE guidance.',
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const COMPETITIVE_PLAYS: CompetitivePlay[] = [
  ...PRECEDENT_READING,
  ...POSITIONING,
  ...DIFFERENTIATION,
];

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect competitive-strategy plays relevant to the message, optionally
 * narrowed to a segment (cross-cutting plays always remain eligible) and a
 * focus (precedent_reading / positioning / differentiation).
 */
export function detectRelevantPlays(
  message: string,
  opts: { segment?: ClientSegment | null; focus?: CompetitiveFocus } = {},
): CompetitivePlay[] {
  return COMPETITIVE_PLAYS.filter((p) => {
    const segOk = p.segment === null || !opts.segment || p.segment === opts.segment;
    const focusOk = !opts.focus || p.focus === opts.focus;
    if (!segOk || !focusOk) return false;
    return p.triggers.some((re) => re.test(message));
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a Markdown block giving AnA the relevant competitive-strategy plays.
 * Returns '' when nothing matches — unless forceGeneric is set, in which case
 * it emits a general "read the landscape" instruction so an explicit command
 * always does work.
 */
export function buildCompetitiveBlock(opts: {
  message: string;
  segment?: ClientSegment | null;
  focus?: CompetitiveFocus;
  limit?: number;
  forceGeneric?: boolean;
}): string {
  const matched = detectRelevantPlays(opts.message, { segment: opts.segment, focus: opts.focus }).slice(
    0,
    opts.limit ?? 3,
  );

  if (matched.length === 0) {
    if (!opts.forceGeneric) return '';
    return (
      '\n\n## Competitive strategy — read the landscape, then position\n' +
      'The user is thinking about precedent or the competitive field. Help them read it like a strategist: a precedent ' +
      'transfers only when indication, endpoint, division, and guidance era line up; position against the competitor\'s ' +
      'approved label, not their marketing; differentiate on the axis the agency rewards; and treat a path that unwound for ' +
      'someone else as a raised bar, not an opening.'
    );
  }

  const focusLabel: Record<CompetitiveFocus, string> = {
    precedent_reading: 'Reading precedent',
    positioning: 'Positioning',
    differentiation: 'Differentiation',
  };

  const lines = matched.map((p) => {
    const scope = p.segment === null ? 'all segments' : SEGMENT_LABELS[p.segment];
    return (
      `### ${p.insight}\n` +
      `_${focusLabel[p.focus]} · ${scope}_\n` +
      `- **When:** ${p.situation}\n` +
      `- **The move:** ${p.move}\n` +
      `- **Watch out for:** ${p.watchOut}\n` +
      `- **Basis:** ${p.basis}`
    );
  });

  return (
    '\n\n## Competitive strategy — precedent and positioning\n' +
    'The user is reasoning about precedent or the competitive landscape. Apply the plays below to their specifics — the ' +
    'principle, the move, and the failure mode it avoids. Be concrete; this is strategy help grounded in how agencies ' +
    'actually treat precedent.\n\n' +
    lines.join('\n\n')
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getPlay(id: string): CompetitivePlay | null {
  return COMPETITIVE_PLAYS.find((p) => p.id === id) ?? null;
}

export function listPlaysByFocus(focus: CompetitiveFocus): CompetitivePlay[] {
  return COMPETITIVE_PLAYS.filter((p) => p.focus === focus);
}
