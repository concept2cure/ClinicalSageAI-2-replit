/**
 * Briefing-book core — E8 Pre-IND / EOP2 briefing-book builder + reviewer-
 * challenge pre-mortem.
 *
 * Pure, dependency-free assembly logic for a regulatory-agency meeting briefing
 * book. It takes a `RegAgencyMeeting` (the same shape declared in
 * client/src/concept2cure/types/workspace.ts) and produces:
 *
 *   1. the mandatory briefing-book section headers,
 *   2. the markdown body to hand to `author_docx_native`,
 *   3. the `required_strings` array to hand to `verify_docx_against_source`
 *      (mandatory section headers + the sponsor's enumerated questions), and
 *   4. an honest pre-mortem verdict that folds together the anticipated FDA
 *      pushback from `simulate_reviewer_challenges` and `run_submission_premortem`
 *      — framed ALWAYS as ANTICIPATED, never as an actual agency position.
 *
 * Honesty contract (21 CFR Part 11): a briefing book assembled from FIXTURE /
 * sample meeting data is `not_assessed` and is never marked sealable/exportable.
 * Anticipated FDA pushback is labelled "anticipated", never "actual".
 *
 * No LLM, no I/O — this module is unit-testable in isolation. The tool handler
 * in AnaToolExecutor wires it to author_docx_native / simulate_reviewer_challenges
 * / run_submission_premortem / verify_docx_against_source.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shapes — kept structurally identical to the client RegAgencyMeeting so the
// two can be joined once live meeting data is available (// INTEGRATION).
// ─────────────────────────────────────────────────────────────────────────────

export type RegAgencyMeetingType =
  | 'pre_ind'
  | 'eop1'
  | 'eop2'
  | 'pre_nda'
  | 'pre_bla'
  | 'type_a'
  | 'type_b'
  | 'type_c'
  | 'type_d';

export interface RegAgencyMeetingInput {
  id: string;
  type: RegAgencyMeetingType;
  date?: string;
  status?: 'requested' | 'scheduled' | 'completed' | 'cancelled';
  division?: string;
  briefingDocDue?: string;
  /** The sponsor's enumerated questions for the agency. */
  keyQuestions?: string[];
  outcomes?: string[];
}

/** Free-context that sharpens the briefing book (product, indication, etc.). */
export interface BriefingBookContext {
  productName?: string;
  indication?: string;
  sponsor?: string;
  /** Background narrative paragraphs. */
  background?: string[];
  /** Development objectives for the meeting. */
  objectives?: string[];
  /** Supporting-data summary bullet points. */
  supportingData?: string[];
}

/** Provenance of the meeting data the book was built from. */
export type BriefingBookDataSource = 'live' | 'fixture';

// ─────────────────────────────────────────────────────────────────────────────
// Mandatory section headers — the FDA briefing-book skeleton. These are the
// section headers a Pre-IND / EOP2 briefing package MUST contain; every one of
// them becomes a required_string the rebuilt .docx is verified against.
// ─────────────────────────────────────────────────────────────────────────────

export const MANDATORY_SECTION_HEADERS = [
  'Background',
  'Product Development Objectives',
  'Questions for the Agency',
  'Supporting-Data Summary',
] as const;

export type MandatorySectionHeader = (typeof MANDATORY_SECTION_HEADERS)[number];

const MEETING_LABELS: Record<RegAgencyMeetingType, string> = {
  pre_ind: 'Pre-IND',
  eop1: 'End-of-Phase 1',
  eop2: 'End-of-Phase 2',
  pre_nda: 'Pre-NDA',
  pre_bla: 'Pre-BLA',
  type_a: 'Type A',
  type_b: 'Type B',
  type_c: 'Type C',
  type_d: 'Type D',
};

export function meetingTypeLabel(type: RegAgencyMeetingType): string {
  return MEETING_LABELS[type] ?? 'Regulatory';
}

// ─────────────────────────────────────────────────────────────────────────────
// required_strings derivation — mandatory section headers + the sponsor's
// enumerated questions. This is the contract the verifier enforces: the
// rebuilt .docx must contain every section header verbatim AND every sponsor
// question verbatim, or verification fails.
// ─────────────────────────────────────────────────────────────────────────────

/** The numbered label a sponsor question carries in the book (1-based). */
export function sponsorQuestionLabel(index: number): string {
  return `Question ${index + 1}.`;
}

/**
 * Derive the required_strings for verify_docx_against_source: every mandatory
 * section header, then every sponsor question (verbatim, deduped, blank-pruned).
 * Order is deterministic: headers first, then questions in sponsor order.
 */
export function deriveRequiredStrings(
  meeting: Pick<RegAgencyMeetingInput, 'keyQuestions'>,
): string[] {
  const out: string[] = [...MANDATORY_SECTION_HEADERS];
  const seen = new Set(out.map(s => s.toLowerCase()));
  const questions = Array.isArray(meeting.keyQuestions) ? meeting.keyQuestions : [];
  for (const raw of questions) {
    const q = typeof raw === 'string' ? raw.trim() : '';
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown assembly — produces the body for author_docx_native. The four
// mandatory headers appear as `##` headings so they survive docx extraction as
// verbatim substrings; sponsor questions are enumerated verbatim under
// "Questions for the Agency".
// ─────────────────────────────────────────────────────────────────────────────

function renderParas(paras: string[] | undefined, fallback: string): string {
  const cleaned = (paras ?? []).map(p => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  return cleaned.length ? cleaned.join('\n\n') : fallback;
}

function renderBullets(items: string[] | undefined, fallback: string): string {
  const cleaned = (items ?? []).map(p => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  if (!cleaned.length) return fallback;
  return cleaned.map(i => `- ${i}`).join('\n');
}

export interface AssembledBriefingBook {
  title: string;
  /** Markdown body for author_docx_native. */
  content: string;
  /** Mandatory section headers + sponsor questions, verbatim. */
  requiredStrings: string[];
  /** Number of enumerated sponsor questions included. */
  questionCount: number;
}

/**
 * Assemble the briefing-book markdown + required_strings from meeting + context.
 * Pure: no I/O. The returned `content` is fed to author_docx_native and the
 * `requiredStrings` to verify_docx_against_source.
 */
export function assembleBriefingBook(
  meeting: RegAgencyMeetingInput,
  context: BriefingBookContext = {},
): AssembledBriefingBook {
  const label = meetingTypeLabel(meeting.type);
  const product = context.productName?.trim() || 'the investigational product';
  const indication = context.indication?.trim();
  const titleSubject = indication ? `${product} — ${indication}` : product;
  const title = `${label} Meeting Briefing Book: ${titleSubject}`;

  const questions = (meeting.keyQuestions ?? [])
    .map(q => (typeof q === 'string' ? q.trim() : ''))
    .filter(Boolean);

  const lines: string[] = [];
  lines.push(`# ${title}`);
  if (context.sponsor?.trim()) lines.push(`Sponsor: ${context.sponsor.trim()}`);
  if (meeting.division?.trim()) lines.push(`Division: ${meeting.division.trim()}`);
  if (meeting.date?.trim()) lines.push(`Requested meeting date: ${meeting.date.trim()}`);

  lines.push('## Background');
  lines.push(
    renderParas(
      context.background,
      `This ${label} meeting concerns ${titleSubject}. The background section summarizes the nonclinical and clinical development to date that supports the questions posed below.`,
    ),
  );

  lines.push('## Product Development Objectives');
  lines.push(
    renderBullets(
      context.objectives,
      `- Align with the Agency on the development objectives for ${titleSubject}.`,
    ),
  );

  lines.push('## Questions for the Agency');
  if (questions.length) {
    questions.forEach((q, i) => {
      // The numbered label and the verbatim question both appear, so each
      // question is verifiable verbatim against the rebuilt .docx.
      lines.push(`${sponsorQuestionLabel(i)} ${q}`);
    });
  } else {
    lines.push('No sponsor questions have been enumerated for this meeting yet.');
  }

  lines.push('## Supporting-Data Summary');
  lines.push(
    renderBullets(
      context.supportingData,
      '- Supporting nonclinical and clinical data summaries are compiled in the appendices.',
    ),
  );

  return {
    title,
    content: lines.join('\n\n'),
    requiredStrings: deriveRequiredStrings(meeting),
    questionCount: questions.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reviewer-challenge / pre-mortem verdict — honesty-by-construction.
//
// Folds the anticipated pushback surfaced by simulate_reviewer_challenges and
// run_submission_premortem into a per-sponsor-question view. Everything here is
// ANTICIPATED FDA pushback — never an actual agency position.
// ─────────────────────────────────────────────────────────────────────────────

export type ChallengeSeverity = 'critical' | 'high' | 'medium' | 'low';

/** One anticipated reviewer challenge (from a reviewer lens or a pattern scan). */
export interface AnticipatedChallenge {
  /** The reviewer lens or pattern that raised it (e.g. "biostatistics_skeptic"). */
  lens?: string;
  severity: ChallengeSeverity;
  /** The anticipated reviewer question. */
  question: string;
  /** Regulatory basis, when available. */
  regulatoryBasis?: string;
  /** Suggested sponsor response / remediation. */
  suggestedResponse?: string;
}

/** Anticipated pushback grouped under one of the sponsor's enumerated questions. */
export interface SponsorQuestionPremortem {
  /** 1-based number matching the briefing book. */
  number: number;
  question: string;
  challenges: AnticipatedChallenge[];
}

export interface BriefingBookPremortem {
  /** ALWAYS true — this is anticipated pushback, never an actual FDA position. */
  anticipated: true;
  /** Per-question anticipated pushback. */
  perQuestion: SponsorQuestionPremortem[];
  /** Challenges not tied to a specific sponsor question. */
  unmappedChallenges: AnticipatedChallenge[];
  /** Honest overall risk read. */
  overallRisk: ChallengeSeverity | 'insufficient_data';
  /** Number of precedents behind the read (denominator); 0 ⇒ pattern-only. */
  precedentCount: number;
  /** Provenance of the underlying meeting data. */
  dataSource: BriefingBookDataSource;
  /**
   * Whether this book may be sealed/exported. FALSE for fixture/sample data —
   * sample/not_assessed is never sealable/exportable (21 CFR Part 11).
   */
  sealable: boolean;
  /** not_assessed for fixture data; assessed for live data. */
  assessment: 'assessed' | 'not_assessed';
  /** One-line factual summary. */
  summary: string;
}

const SEVERITY_RANK: Record<ChallengeSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function maxSeverity(challenges: AnticipatedChallenge[]): ChallengeSeverity | null {
  let best: ChallengeSeverity | null = null;
  for (const c of challenges) {
    if (!best || SEVERITY_RANK[c.severity] > SEVERITY_RANK[best]) best = c.severity;
  }
  return best;
}

/**
 * Map each anticipated challenge to a sponsor question. A challenge is attached
 * to a question when the challenge text references the question's text (case-
 * insensitive substring either direction) — otherwise it falls into
 * `unmappedChallenges`. Deterministic, no LLM.
 */
function mapChallengesToQuestions(
  questions: string[],
  challenges: AnticipatedChallenge[],
): { perQuestion: SponsorQuestionPremortem[]; unmapped: AnticipatedChallenge[] } {
  const perQuestion: SponsorQuestionPremortem[] = questions.map((q, i) => ({
    number: i + 1,
    question: q,
    challenges: [],
  }));
  const unmapped: AnticipatedChallenge[] = [];

  for (const ch of challenges) {
    const chLower = ch.question.toLowerCase();
    let matched: SponsorQuestionPremortem | undefined;
    for (const pq of perQuestion) {
      const qLower = pq.question.toLowerCase();
      if (!qLower) continue;
      if (chLower.includes(qLower) || qLower.includes(chLower)) {
        matched = pq;
        break;
      }
    }
    if (matched) matched.challenges.push(ch);
    else unmapped.push(ch);
  }

  return { perQuestion, unmapped };
}

export interface ComposePremortemArgs {
  meeting: Pick<RegAgencyMeetingInput, 'keyQuestions'>;
  /** From simulate_reviewer_challenges + run_submission_premortem, normalized. */
  challenges: AnticipatedChallenge[];
  /** Precedent denominator from run_submission_premortem (0 ⇒ pattern-only). */
  precedentCount?: number;
  /** Provenance of the meeting data; fixture ⇒ not sealable/exportable. */
  dataSource: BriefingBookDataSource;
}

/**
 * Compose the honest briefing-book pre-mortem verdict. Honesty guards:
 *   - everything is framed as ANTICIPATED pushback;
 *   - fixture data is not_assessed and not sealable/exportable;
 *   - thin precedent corpus (count 0) ⇒ overallRisk 'insufficient_data',
 *     never a fabricated severity.
 */
export function composeBriefingBookPremortem(
  args: ComposePremortemArgs,
): BriefingBookPremortem {
  const questions = (args.meeting.keyQuestions ?? [])
    .map(q => (typeof q === 'string' ? q.trim() : ''))
    .filter(Boolean);
  const challenges = Array.isArray(args.challenges) ? args.challenges : [];
  const precedentCount = Math.max(0, Math.floor(args.precedentCount ?? 0));
  const dataSource: BriefingBookDataSource = args.dataSource;

  const { perQuestion, unmapped } = mapChallengesToQuestions(questions, challenges);

  // Honest overall risk: with no precedent corpus we report insufficient_data
  // rather than inflate a pattern match into a calibrated risk level.
  const top = maxSeverity(challenges);
  const overallRisk: ChallengeSeverity | 'insufficient_data' =
    precedentCount === 0 ? 'insufficient_data' : (top ?? 'low');

  // Fixture/sample data is never sealable/exportable and is marked not_assessed.
  const isFixture = dataSource === 'fixture';
  const sealable = !isFixture;
  const assessment = isFixture ? 'not_assessed' : 'assessed';

  const riskWord =
    overallRisk === 'insufficient_data'
      ? 'pattern-only (insufficient precedent data, confidence: low)'
      : `${overallRisk} anticipated risk`;
  const summary = isFixture
    ? `Anticipated reviewer pushback across ${challenges.length} challenge(s) over ${questions.length} sponsor question(s); ${riskWord}. Built from sample meeting data — not assessed, not sealable or exportable.`
    : `Anticipated reviewer pushback across ${challenges.length} challenge(s) over ${questions.length} sponsor question(s); ${riskWord}.`;

  return {
    anticipated: true,
    perQuestion,
    unmappedChallenges: unmapped,
    overallRisk,
    precedentCount,
    dataSource,
    sealable,
    assessment,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers — fold the raw simulate_reviewer_challenges and
// run_submission_premortem tool outputs into AnticipatedChallenge[]. Defensive
// against partial/odd shapes; everything is treated as ANTICIPATED.
// ─────────────────────────────────────────────────────────────────────────────

function coerceSeverity(v: unknown): ChallengeSeverity {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (s === 'critical' || s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}

/** Normalize simulate_reviewer_challenges output → AnticipatedChallenge[]. */
export function normalizeReviewerChallenges(raw: unknown): AnticipatedChallenge[] {
  const list = Array.isArray((raw as any)?.challenges)
    ? (raw as any).challenges
    : Array.isArray(raw)
      ? raw
      : [];
  return list
    .map((c: any): AnticipatedChallenge | null => {
      const question =
        typeof c?.question === 'string'
          ? c.question
          : typeof c?.challenge === 'string'
            ? c.challenge
            : '';
      if (!question.trim()) return null;
      return {
        lens: typeof c?.lens === 'string' ? c.lens : undefined,
        severity: coerceSeverity(c?.severity),
        question: question.trim(),
        regulatoryBasis: typeof c?.regulatoryBasis === 'string' ? c.regulatoryBasis : undefined,
        suggestedResponse:
          typeof c?.suggestedResponse === 'string'
            ? c.suggestedResponse
            : typeof c?.suggested_response === 'string'
              ? c.suggested_response
              : undefined,
      };
    })
    .filter((c: AnticipatedChallenge | null): c is AnticipatedChallenge => c !== null);
}

/** Normalize run_submission_premortem findings → AnticipatedChallenge[]. */
export function normalizePremortemFindings(raw: unknown): AnticipatedChallenge[] {
  const list = Array.isArray((raw as any)?.findings) ? (raw as any).findings : [];
  return list
    .map((f: any): AnticipatedChallenge | null => {
      const question =
        typeof f?.reviewerQuestion === 'string'
          ? f.reviewerQuestion
          : typeof f?.title === 'string'
            ? f.title
            : '';
      if (!question.trim()) return null;
      return {
        lens: typeof f?.category === 'string' ? f.category : 'premortem',
        severity: coerceSeverity(f?.severity),
        question: question.trim(),
        regulatoryBasis: typeof f?.regulatoryBasis === 'string' ? f.regulatoryBasis : undefined,
        suggestedResponse: typeof f?.remediation === 'string' ? f.remediation : undefined,
      };
    })
    .filter((c: AnticipatedChallenge | null): c is AnticipatedChallenge => c !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — used where live RegAgencyMeeting data is not present. Marked so the
// honesty guard flags the resulting book as fixture-sourced (not_assessed, not
// sealable/exportable).
//
// INTEGRATION: replace with the live RegAgencyMeeting row from the product's
//   strategy.meetings[] (client/src/concept2cure/types/workspace.ts), joined by
//   meeting id + organization scope.
// ─────────────────────────────────────────────────────────────────────────────

export const FIXTURE_EOP2_MEETING: RegAgencyMeetingInput = {
  id: 'fixture-eop2-001',
  type: 'eop2',
  date: '2026-09-15',
  status: 'requested',
  division: 'DHRR — Division of Hematology Rare Diseases',
  briefingDocDue: '2026-08-15',
  keyQuestions: [
    'Does the Agency concur that the proposed Phase 3 primary endpoint is acceptable to support a marketing application?',
    'Does the Agency agree that the safety database size is adequate for the proposed indication?',
    'Does the Agency concur with the proposed patient population and key inclusion/exclusion criteria?',
  ],
};

export const FIXTURE_EOP2_CONTEXT: BriefingBookContext = {
  productName: 'Compound C2C-117',
  indication: 'Relapsed/Refractory AML',
  sponsor: 'Concept2Cure Therapeutics',
  background: [
    'Compound C2C-117 is a small-molecule inhibitor under development for relapsed/refractory acute myeloid leukemia.',
    'Phase 1 dose-escalation established the recommended Phase 2 dose; Phase 2 demonstrated a composite complete-remission signal in the target population.',
  ],
  objectives: [
    'Confirm the registrational Phase 3 design and primary endpoint.',
    'Agree the safety database and exposure required for the marketing application.',
  ],
  supportingData: [
    'Phase 1: dose-escalation safety and PK across N=36 patients.',
    'Phase 2: composite complete remission rate with duration-of-response follow-up.',
  ],
};
