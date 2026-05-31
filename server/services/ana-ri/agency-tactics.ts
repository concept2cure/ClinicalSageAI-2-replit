/**
 * Agency-interaction tactics pack — how to run the conversation with a regulator.
 *
 * The other packs cover what to build and what to decide. This one covers the
 * highest-leverage, least-documented skill: how to actually conduct the
 * interaction with the agency — the meeting, the question list, the response to
 * a deficiency or complete-response letter, and the posture to hold across all
 * of them.
 *
 * Three kinds:
 *   - meeting_prep      → pre-IND / Type B-C / Pre-Sub / scientific advice
 *   - response_strategy → HAQs, deficiency letters, CRL / RTF / RTA
 *   - posture           → how to carry the relationship across interactions
 *
 * Each tactic is:
 *     situation → when it applies
 *     tactic    → the move a veteran makes
 *     why       → why it works
 *     watchOut  → the failure mode it avoids
 *     basis     → the precedent / guidance it rests on
 *
 * Read by:
 *   - context-enrichment.ts (/meeting, /agency, /tactics commands + meeting and
 *     response-letter language triggers)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/agency-tactics
 */

import type { ClientSegment } from './industry-wisdom-pack.js';
import { SEGMENT_LABELS } from './industry-wisdom-pack.js';

export type TacticKind = 'meeting_prep' | 'response_strategy' | 'posture';

export interface AgencyTactic {
  id: string;
  /** null = applies across all segments. */
  segment: ClientSegment | null;
  kind: TacticKind;
  /** When this tactic applies. */
  situation: string;
  /** Phrases that signal the user is in this situation. */
  triggers: RegExp[];
  /** The move a veteran makes. */
  tactic: string;
  /** Why it works. */
  why: string;
  /** The failure mode it avoids. */
  watchOut: string;
  /** Precedent / guidance the tactic rests on. */
  basis: string;
}

// ─── Meeting preparation ─────────────────────────────────────────────────────

const MEETING_PREP: AgencyTactic[] = [
  {
    id: 'a-bring-your-position',
    segment: null,
    kind: 'meeting_prep',
    situation: 'Preparing questions for any agency meeting or written-advice request.',
    triggers: [
      /\b(?:prep(?:are|aring)?|draft(?:ing)?|writing)\b[^.?!]{0,30}\b(?:meeting|pre.?sub|pre.?ind|briefing (?:book|package|document)|questions for (?:fda|ema|the agency))/i,
      /\b(?:what (?:should we|do we) ask|questions (?:for|to ask))\b[^.?!]{0,20}\b(?:fda|ema|pmda|the agency)/i,
    ],
    tactic:
      'Frame each question as your proposal plus a request to agree — "We propose X; does the agency concur?" — not an open "What does the agency want?".',
    why:
      'A specific proposal gets a specific answer you can hold to in the minutes. An open question invites vague feedback you cannot rely on later.',
    watchOut:
      'Open-ended questions waste your limited meeting slots and produce minutes too soft to plan against.',
    basis: 'FDA formal meetings guidance; EMA scientific advice practice.',
  },
  {
    id: 'a-rank-three-to-five',
    segment: null,
    kind: 'meeting_prep',
    situation: 'Deciding how many questions to bring to a meeting.',
    triggers: [
      /\bhow many questions\b/i,
      /\b(?:too many|list of) questions\b[^.?!]{0,20}\b(?:meeting|fda|ema)/i,
    ],
    tactic:
      'Bring three to five questions, ranked, and lead with the single load-bearing one. If time runs short, the question that most changes the program is already answered.',
    why:
      'Meeting time is finite and the agency works the list in order. Front-loading the decisive question protects you against running out of clock.',
    watchOut:
      'A long flat list means the meeting ends with your most important question unanswered.',
    basis: 'FDA formal meetings guidance (PDUFA meeting management).',
  },
  {
    id: 'a-briefing-book-is-the-meeting',
    segment: null,
    kind: 'meeting_prep',
    situation: 'Assembling the pre-meeting briefing package.',
    triggers: [
      /\bbriefing (?:book|package|document)\b/i,
      /\b(?:pre.?meeting|meeting) package\b/i,
    ],
    tactic:
      'Treat the briefing package as the meeting. The review team forms its preliminary positions from it before anyone sits down; the meeting mostly confirms or adjusts those.',
    why:
      'Written preliminary responses often arrive before the meeting. A strong package sets the frame; a weak one means you spend the meeting digging out of a hole.',
    watchOut:
      'A thin or late briefing package wastes the meeting on clarification instead of decisions.',
    basis: 'FDA pre-meeting preliminary-response practice.',
  },
  {
    id: 'a-pre-ind-scope',
    segment: null,
    kind: 'meeting_prep',
    situation: 'Preparing a pre-IND or INTERACT meeting.',
    triggers: [
      /\bpre.?ind\b/i,
      /\binteract meeting\b/i,
    ],
    tactic:
      'Focus a pre-IND on the two questions that gate the IND: is the nonclinical package adequate to support the proposed first-in-human design, and is that design acceptable. Leave commercial and later-phase questions out.',
    why:
      'A pre-IND that wanders into Phase 3 or commercial detail dilutes the feedback you actually need to start dosing humans safely.',
    watchOut:
      'Over-scoping the pre-IND produces shallow answers on the only questions that matter right now.',
    basis: 'FDA pre-IND practice (21 CFR 312.82); CBER INTERACT for advanced therapies.',
  },
  {
    id: 'a-right-meeting-type',
    segment: null,
    kind: 'meeting_prep',
    situation: 'Choosing which formal meeting type to request.',
    triggers: [
      /\btype [abc]\b/i,
      /\b(?:which|what) (?:meeting|type)\b[^.?!]{0,20}\b(?:request|ask for|fda)/i,
      /\bscientific advice\b/i,
    ],
    tactic:
      'Match the meeting type to the stakes: Type B for the milestone meetings (pre-IND, end-of-Phase-2, pre-NDA/BLA) with their guaranteed timelines, Type C for everything else, Type A only to get an unstuck program moving.',
    why:
      'Each type has a different FDA response clock and a different implicit weight. Asking for the wrong one costs time or signals the wrong urgency.',
    watchOut:
      'Defaulting every question to a Type C can forfeit the guaranteed milestone-meeting timelines a Type B carries.',
    basis: 'FDA formal meetings guidance (Types A, B, B(EOP), C).',
  },
];

// ─── Response strategy ───────────────────────────────────────────────────────

const RESPONSE_STRATEGY: AgencyTactic[] = [
  {
    id: 'a-answer-the-question-asked',
    segment: null,
    kind: 'response_strategy',
    situation: 'Responding to a health-authority question or deficiency.',
    triggers: [
      /\b(?:respond(?:ing)?|response|answer(?:ing)?|reply)\b[^.?!]{0,25}\b(?:haq|deficiency|information request|fda question|ema question|day 120|list of questions|major objection)/i,
      /\b(?:haq|deficiency letter|information request|day 120 questions|major objections?)\b/i,
    ],
    tactic:
      'Answer the question the reviewer asked, in their words, before adding context. Lead each response with the direct answer, then the supporting evidence.',
    why:
      'Reviewers grade responsiveness. Burying the answer under preamble reads as evasion and invites a follow-up question and another cycle.',
    watchOut:
      'Reframing the question to the one you wish they had asked is the fastest way to a second round.',
    basis: 'Recurring HAQ / deficiency review pattern across FDA and EMA.',
  },
  {
    id: 'a-respond-in-their-order',
    segment: null,
    kind: 'response_strategy',
    situation: 'Structuring a response package to a multi-item letter.',
    triggers: [
      /\b(?:structure|organi[sz]e|order|format)\b[^.?!]{0,25}\b(?:response|reply)\b/i,
      /\bcover letter\b[^.?!]{0,20}\bresponse/i,
    ],
    tactic:
      'Mirror the agency numbering and order exactly, item by item, with verbatim references back to the section you changed. One response per item, no merging.',
    why:
      'Reviewers read in their own sequence. Matching it lets them check off each item without hunting, which is the experience that gets you a clean close.',
    watchOut:
      'Reordering or merging items forces the reviewer to reconcile your structure with theirs and erodes the goodwill you need.',
    basis: 'FDA / EMA response-package convention; eCTD lifecycle referencing.',
  },
  {
    id: 'a-concede-fast',
    segment: null,
    kind: 'response_strategy',
    situation: 'A deficiency you know you cannot fully defend.',
    triggers: [
      /\b(?:push back|fight|contest|disagree|defend)\b[^.?!]{0,25}\b(?:deficiency|finding|haq|comment)/i,
      /\b(?:weak|indefensible|can.?t (?:defend|win))\b[^.?!]{0,20}\b(?:deficiency|finding|point)/i,
    ],
    tactic:
      'Concede the points you cannot defend quickly and cleanly, with the corrective action, and spend your credibility only on the ones where you are right.',
    why:
      'Fighting a valid deficiency burns a review cycle and the reviewer\'s patience. Conceding fast preserves your standing for the issues that matter.',
    watchOut:
      'Defending every point equally signals you cannot tell a strong position from a weak one.',
    basis: 'Review-division interaction practice.',
  },
  {
    id: 'a-crl-is-a-roadmap',
    segment: null,
    kind: 'response_strategy',
    situation: 'You received a Complete Response Letter.',
    triggers: [
      /\b(?:complete response letter|\bcrl\b)\b/i,
      /\b(?:got|received|responding to)\b[^.?!]{0,15}\b(?:a )?crl\b/i,
    ],
    tactic:
      'Treat the CRL as a roadmap, not a rejection. Inventory every deficiency, classify each as approvability versus review issue, and request a Type A meeting to align on the resubmission scope before you build it.',
    why:
      'A CRL lists exactly what stands between you and approval. Aligning on scope before resubmitting prevents a second CRL on a misjudged fix.',
    watchOut:
      'Resubmitting on your own read of the CRL without a meeting risks solving the wrong problem and burning another cycle.',
    basis: '21 CFR 314.110 / 601.3; FDA Type A meeting practice.',
  },
  {
    id: 'a-rtf-rta-is-a-gate',
    segment: 'mdx',
    kind: 'response_strategy',
    situation: 'You received a refuse-to-accept or refuse-to-file.',
    triggers: [
      /\b(?:rta|refuse to accept|refuse to file|\brtf\b)\b/i,
    ],
    tactic:
      'Treat an RTA or RTF as a completeness gate, not a scientific judgment. Fix the specific completeness items cited and refile; do not re-argue the science that was never reviewed.',
    why:
      'The clock never started, so there is nothing to argue yet. The fastest path back in is to close the checklist items that triggered the hold.',
    watchOut:
      'Mounting a scientific defense against an RTA delays the only thing that helps — refiling a complete submission.',
    basis: 'FDA RTA policy for 510(k); RTF for NDA/BLA filing review.',
  },
  {
    id: 'a-major-amendment-resets-clock',
    segment: null,
    kind: 'response_strategy',
    situation: 'Deciding how much new data to add in a response.',
    triggers: [
      /\bmajor amendment\b/i,
      /\b(?:add|submit|include)\b[^.?!]{0,25}\bnew (?:data|analyses|study)\b[^.?!]{0,25}\bresponse/i,
    ],
    tactic:
      'Know when your response becomes a major amendment that resets the review clock, and decide that on purpose. Sometimes the clock reset is worth it; sometimes a leaner response that holds the clock is.',
    why:
      'A major amendment late in review can add months. Adding new data reflexively can cost more time than the data is worth.',
    watchOut:
      'Submitting new analyses without realizing they trigger a clock reset surprises your own timeline.',
    basis: 'FDA major-amendment review-clock practice (PDUFA goals).',
  },
];

// ─── Posture ─────────────────────────────────────────────────────────────────

const POSTURE: AgencyTactic[] = [
  {
    id: 'a-disagree-on-science-not-relationship',
    segment: null,
    kind: 'posture',
    situation: 'You disagree with the review division on a substantive point.',
    triggers: [
      /\b(?:formal dispute resolution|dispute resolution|escalate|appeal (?:the|our|a|this))\b/i,
      /\b(?:disagree|disagreement|dispute|push back)\b[^.?!]{0,30}\b(?:fda|ema|pmda|division|agency|reviewer)/i,
    ],
    tactic:
      'Disagree on the science, never on the relationship. Make the technical case crisply, and exhaust discussion with the review division before reaching for formal dispute resolution.',
    why:
      'You will face the same division on your next cycle and your next program. Escalation has a real relationship cost and rarely moves faster than a well-run division discussion.',
    watchOut:
      'A premature formal appeal signals you could not make your case at the working level and frames you as adversarial.',
    basis: 'FDA formal dispute resolution process; review-division relationship practice.',
  },
  {
    id: 'a-document-contemporaneously',
    segment: null,
    kind: 'posture',
    situation: 'Throughout any agency interaction.',
    triggers: [
      /\b(?:meeting minutes|official minutes|record of the meeting|document the (?:call|meeting|interaction))\b/i,
      /\b(?:what (?:did|do) (?:they|fda|ema) (?:say|agree))\b/i,
    ],
    tactic:
      'Document every interaction contemporaneously and reconcile your minutes against the agency\'s. The agreed record, not anyone\'s memory, is what binds both sides later.',
    why:
      'Memories drift and reviewers rotate. The written, agreed minutes are the only durable record of what was decided.',
    watchOut:
      'Relying on what you remember hearing, rather than the official minutes, leaves you with no footing when a later reviewer reads it differently.',
    basis: 'FDA official meeting minutes process; EMA scientific advice letters.',
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const AGENCY_TACTICS: AgencyTactic[] = [
  ...MEETING_PREP,
  ...RESPONSE_STRATEGY,
  ...POSTURE,
];

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect agency-interaction tactics relevant to the message, optionally
 * narrowed to a segment (cross-cutting tactics always remain eligible) and a
 * kind (meeting_prep / response_strategy / posture).
 */
export function detectRelevantTactics(
  message: string,
  opts: { segment?: ClientSegment | null; kind?: TacticKind } = {},
): AgencyTactic[] {
  return AGENCY_TACTICS.filter((t) => {
    const segOk = t.segment === null || !opts.segment || t.segment === opts.segment;
    const kindOk = !opts.kind || t.kind === opts.kind;
    if (!segOk || !kindOk) return false;
    return t.triggers.some((re) => re.test(message));
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a Markdown block giving AnA the relevant agency-interaction tactics.
 * Returns '' when nothing matches — unless forceGeneric is set, in which case
 * it emits a general "run this interaction well" instruction so an explicit
 * command always does work.
 */
export function buildAgencyTacticsBlock(opts: {
  message: string;
  segment?: ClientSegment | null;
  kind?: TacticKind;
  limit?: number;
  forceGeneric?: boolean;
}): string {
  const matched = detectRelevantTactics(opts.message, { segment: opts.segment, kind: opts.kind }).slice(
    0,
    opts.limit ?? 4,
  );

  if (matched.length === 0) {
    if (!opts.forceGeneric) return '';
    return (
      '\n\n## Agency interaction — run the conversation well\n' +
      'The user is preparing for or responding to an agency interaction. Help them run it like a veteran: ' +
      'bring proposals and ask for agreement rather than open questions, rank the few load-bearing points, answer exactly ' +
      'what is asked in the agency\'s own order, concede what cannot be defended, and hold the disagreement to the science. ' +
      'Anchor everything to the official minutes or letter, not to memory.'
    );
  }

  const kindLabel: Record<TacticKind, string> = {
    meeting_prep: 'Meeting preparation',
    response_strategy: 'Response strategy',
    posture: 'Posture',
  };

  const lines = matched.map((t) => {
    const scope = t.segment === null ? 'all segments' : SEGMENT_LABELS[t.segment];
    return (
      `### ${t.tactic}\n` +
      `_${kindLabel[t.kind]} · ${scope}_\n` +
      `- **When:** ${t.situation}\n` +
      `- **Why it works:** ${t.why}\n` +
      `- **Watch out for:** ${t.watchOut}\n` +
      `- **Basis:** ${t.basis}`
    );
  });

  return (
    '\n\n## Agency-interaction tactics\n' +
    'The user is preparing for or responding to a regulator. Apply the tactics below to their specifics — the move, why it ' +
    'works, and the failure mode it avoids. Be concrete and practical; this is execution help, not theory.\n\n' +
    lines.join('\n\n')
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getTactic(id: string): AgencyTactic | null {
  return AGENCY_TACTICS.find((t) => t.id === id) ?? null;
}

export function listTacticsByKind(kind: TacticKind): AgencyTactic[] {
  return AGENCY_TACTICS.filter((t) => t.kind === kind);
}
