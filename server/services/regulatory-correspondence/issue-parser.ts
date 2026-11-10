import crypto from 'node:crypto';
import type { CorrespondenceIssue, CorrespondenceEvidenceSpan, FeedbackCoding } from '@shared/types/regulatory-correspondence';
import {
  DEVICE_ISSUE_TAXONOMY,
  devicePathwayFor,
  isDeviceSubmissionType,
  type DeviceIssueRule,
} from './device-issue-taxonomy';

export const ISSUE_PARSER_RESPONSE_CONTRACT = 'governed_heuristic_mode_v1' as const;
export const ISSUE_PARSER_VERSION = 'governed-parser-pipeline-v1' as const;
export const ISSUE_EXTRACTION_VERSION = '2026-04-01' as const;

export type IssueParserMode = 'heuristic_v2' | 'disabled';

export interface IssueParserGovernanceConfig {
  mode: IssueParserMode;
  heuristicEnabled: boolean;
  available: boolean;
  reason?: string;
}

export interface IssueExtractionResult {
  issues: CorrespondenceIssue[];
  metadata: {
    parserMode: 'heuristic';
    responseContract: string;
    extractionMethod: string;
    confidenceMethod: string;
    humanReviewRequired: boolean;
    parserVersion: string;
    extractionVersion: string;
    sourceTextDigest: string;
    matchedRuleCount: number;
    deterministicSignals: string[];
    modelAssistedReasoningUsed: boolean;
  };
}

/**
 * EVERY PATTERN IS WORD-ANCHORED, and that is load-bearing rather than tidy.
 *
 * These are unanchored regexes tested against the whole letter, so a keyword
 * that happens to be a substring of an ordinary word fires on every letter
 * containing that word. Measured 2026-09-20 across the taxonomy, there were
 * four such accidents, and one of them fired on essentially every letter FDA
 * sends:
 *
 *   "information"  → /format/  (in-FORMAT-ion)   → ectd_technical_formatting
 *   "informational"→ /format/                    → ectd_technical_formatting
 *   "asterisk"     → /risk/    (aste-RISK)       → clinical_safety_issue
 *   "equality"     → /quality/ (e-QUALITY)       → cmc_quality_issue
 *
 * A Request for Additional Information therefore arrived carrying a fabricated
 * eCTD-formatting issue mapped to `module_index` — a deficiency the regulator
 * never raised, against a section they never mentioned, which then reaches the
 * response-package compiler and the reviewer's queue as a real ask.
 *
 * The suffix forms (`\w*`) are deliberate: "formatting", "deficiencies",
 * "rejected", "specifications" and "adverse events" are all real matches and
 * must keep matching. The boundary is what removes the accidents; the suffix is
 * what keeps the true positives. Both halves are pinned in
 * `__tests__/issue-parser-governed.test.ts`.
 */
const KEYWORD_TAXONOMY: Array<{
  pattern: RegExp;
  category: CorrespondenceIssue['category'];
  severity: CorrespondenceIssue['severity'];
  blocker: boolean;
  regulatorAskType: string;
  impactedSubmissionComponent: string;
  sectionCandidates: string[];
  ownerFunction: string;
  responsePackageType: string;
  evidenceNeeds: string[];
}> = [
  {
    pattern: /\brefuse to file\b|\brtf\b|\breject\w*/i,
    category: 'filing_acceptance_issue',
    severity: 'critical',
    blocker: true,
    regulatorAskType: 'filing_acceptance_remediation',
    impactedSubmissionComponent: 'cover_sequence',
    sectionCandidates: ['1.0', '1.2'],
    ownerFunction: 'regulatory_affairs',
    responsePackageType: 'filing_acceptance_response',
    evidenceNeeds: ['administrative check matrix', 'filing acceptance remediation narrative'],
  },
  {
    pattern: /\bdeficienc\w*|\bmissing information\b|\bclarification\w*/i,
    category: 'missing_information_clarification',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'deficiency_response',
    impactedSubmissionComponent: 'discipline_module',
    sectionCandidates: ['2.5', '2.7'],
    ownerFunction: 'regulatory_operations',
    responsePackageType: 'deficiency_response_package',
    evidenceNeeds: ['point-by-point response table', 'supporting evidence references'],
  },
  {
    pattern: /\bstabilit\w*|\bspecification\w*|\bquality\b|\bcmc\b/i,
    category: 'cmc_quality_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'cmc_data_request',
    impactedSubmissionComponent: 'module_3',
    sectionCandidates: ['3.2.S', '3.2.P'],
    ownerFunction: 'cmc',
    responsePackageType: 'cmc_amendment',
    evidenceNeeds: ['updated stability dataset', 'quality justification memo'],
  },
  {
    pattern: /\bsafety\b|\badverse event\w*|\brisks?\b/i,
    category: 'clinical_safety_issue',
    severity: 'high',
    blocker: true,
    regulatorAskType: 'safety_clarification',
    impactedSubmissionComponent: 'module_2_5_2_7',
    sectionCandidates: ['2.5', '2.7.4'],
    ownerFunction: 'clinical_safety',
    responsePackageType: 'clinical_safety_response',
    evidenceNeeds: ['integrated safety summary update', 'risk mitigation rationale'],
  },
  {
    pattern: /\befficacy\b|\bendpoints?\b|\bbenefits?\b/i,
    category: 'clinical_efficacy_issue',
    severity: 'medium',
    blocker: false,
    regulatorAskType: 'efficacy_follow_up',
    impactedSubmissionComponent: 'clinical_summary',
    sectionCandidates: ['2.5', '2.7.3'],
    ownerFunction: 'clinical_development',
    responsePackageType: 'efficacy_response',
    evidenceNeeds: ['endpoint sensitivity analysis', 'benefit-risk narrative'],
  },
  {
    pattern: /\bformat\w*|\bectd\b|\btechnical\w*/i,
    category: 'ectd_technical_formatting',
    severity: 'medium',
    blocker: false,
    regulatorAskType: 'technical_correction',
    impactedSubmissionComponent: 'ectd_sequence',
    sectionCandidates: ['module_index'],
    ownerFunction: 'publishing_operations',
    responsePackageType: 'technical_resequence',
    evidenceNeeds: ['validation report', 'publishing checklist'],
  },
];

export function resolveIssueParserGovernanceConfig(env: NodeJS.ProcessEnv): IssueParserGovernanceConfig {
  const heuristicEnabled = env.ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE !== 'false';
  const requestedMode = (env.REG_CORRESPONDENCE_ISSUE_PARSER_MODE || 'heuristic_v2').toLowerCase();

  if (requestedMode !== 'heuristic_v2' && requestedMode !== 'disabled') {
    return {
      mode: 'disabled',
      heuristicEnabled,
      available: false,
      reason: `Unsupported REG_CORRESPONDENCE_ISSUE_PARSER_MODE: ${requestedMode}`,
    };
  }

  if (requestedMode === 'disabled') {
    return {
      mode: 'disabled',
      heuristicEnabled,
      available: false,
      reason: 'Issue parser mode is explicitly disabled.',
    };
  }

  if (!heuristicEnabled) {
    return {
      mode: 'heuristic_v2',
      heuristicEnabled,
      available: false,
      reason: 'ENABLE_REG_CORRESPONDENCE_HEURISTIC_MODE is false.',
    };
  }

  return {
    mode: 'heuristic_v2',
    heuristicEnabled,
    available: true,
  };
}

/**
 * What the letter is ABOUT, so the right half of the taxonomy answers it.
 *
 * Optional, and omitting it reproduces the pre-2026-09-20 behaviour exactly:
 * the drug/CTD taxonomy, unchanged. Every existing caller therefore keeps its
 * results byte-for-byte until it opts in.
 */
export interface IssueParserContext {
  /** `c2c_submissions.submission_type` — '510k', 'de_novo', 'pma', 'nda' … */
  submissionType?: string | null;
}

/**
 * A device rule projected onto the shape the extractor already consumes, with
 * its section candidates resolved for THIS submission's pathway.
 *
 * A device pathway with no seeded rule pack (PMA, IDE, Q-Sub, 513(g)) resolves
 * to no candidates rather than borrowing 510(k)'s — the keys collide across
 * packs (510(k) D5 is shelf life; De Novo D5 is cybersecurity), so a borrowed
 * key is not an approximation, it is a different section.
 */
function deviceRuleToMatch(rule: DeviceIssueRule, pathway: ReturnType<typeof devicePathwayFor>) {
  return {
    pattern: rule.pattern,
    category: rule.category,
    severity: rule.severity,
    blocker: rule.blocker,
    regulatorAskType: rule.regulatorAskType,
    impactedSubmissionComponent: rule.impactedSubmissionComponent,
    sectionCandidates: (pathway && rule.sections[pathway]) || [],
    ownerFunction: rule.ownerFunction,
    responsePackageType: rule.responsePackageType,
    evidenceNeeds: rule.evidenceNeeds,
    subcategory: rule.topic,
  };
}

/** Offsets refer to the exact stored letter, never a normalized copy or its subject. */
function matchedEvidenceSpan(text: string, pattern?: RegExp): CorrespondenceEvidenceSpan {
  const matched = pattern?.exec(text);
  const at = matched?.index ?? 0;
  const matchEnd = at + (matched?.[0].length ?? 0);
  const lineStart = at > 0 ? text.lastIndexOf('\n', at - 1) + 1 : 0;
  const nextLine = text.indexOf('\n', matchEnd);
  const lineEnd = nextLine < 0 ? text.length : nextLine;
  const start = Math.max(lineStart, at - 100);
  const end = Math.min(lineEnd, Math.max(matchEnd, start + 280));
  return { start, end, text: text.slice(start, end) };
}

/** Narrow, auditable proposals. A topic word alone is not an objective failure. */
export function proposeFeedbackCoding(text: string, category: CorrespondenceIssue['category']): FeedbackCoding {
  const coding = (register: FeedbackCoding['register'], deficiencyClass: FeedbackCoding['deficiencyClass']): FeedbackCoding =>
    ({ register, deficiencyClass, basis: 'deterministic_proposal', humanConfirmed: false });
  if (/\b(?:risk|benefit)[ -]?(?:framing|presentation)\b|\bfram(?:e|ing)\b.{0,30}\brisks?\b/i.test(text)) {
    return coding('subjective', 'risk_framing_expectation');
  }
  if (/\bprecedent arguments?\b|\barguments?\b.{0,25}\bprecedent\b/i.test(text)) return coding('subjective', 'precedent_argument_expectation');
  if (/\b(?:clarity|clearer|tone|navigab\w*|document organi[sz]ation|data presentation)\b/i.test(text)) {
    return coding('subjective', 'presentation_expectation');
  }
  if (/\bno (?:missing|absent|unmet|failed)\b|\b(?:not missing|not absent|no deficiencies)\b/i.test(text)) return coding('unclassified', 'unclassified');
  const failure = /\b(?:missing|absent|incomplete|unmet|failed|fails?|out.of.specification|not (?:provided|addressed|met)|does not address|must (?:provide|submit))\b/i.test(text);
  if (!failure) return coding('unclassified', 'unclassified');
  if (category === 'ectd_technical_formatting') return coding('objective', 'format_validation_failure');
  if (/\bspecifications?\b/i.test(text) && /\b(?:failed|fails?|not met|unmet|out.of.specification)\b/i.test(text)) return coding('objective', 'specification_failure');
  if (/\b(?:missing|absent|not provided|incomplete)\b/i.test(text)) return coding('objective', 'missing_required_information');
  return coding('objective', 'unmet_explicit_requirement');
}

/** Re-check the exact evidence and supported proposal before a human can adopt it. */
function hasExactEvidenceSpan(issue: CorrespondenceIssue, sourceText: string): boolean {
  const span = issue.structuredExtraction?.evidenceSpan;
  if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start
      || span.end > sourceText.length || span.end - span.start > 280 || span.text !== sourceText.slice(span.start, span.end)
      || issue.sourceExcerpt !== span.text) return false;
  return true;
}
export function hasCurrentIssueSource(issue: CorrespondenceIssue, sourceText: string): boolean {
  const extraction = issue.structuredExtraction;
  if (!hasExactEvidenceSpan(issue, sourceText) || extraction?.sourceTextDigest !== crypto.createHash('sha256').update(sourceText).digest('hex')) return false;
  if (issue.category !== 'other_unclassified' && ![...KEYWORD_TAXONOMY, ...DEVICE_ISSUE_TAXONOMY]
      .some(rule => rule.category === issue.category && rule.pattern.test(extraction.evidenceSpan!.text))) return false;
  const expected = proposeFeedbackCoding(extraction.evidenceSpan!.text, issue.category);
  return extraction.feedbackCoding?.basis === expected.basis && extraction.feedbackCoding.register === expected.register
    && extraction.feedbackCoding.deficiencyClass === expected.deficiencyClass;
}

function hasConfirmedFeedbackDisposition(issue: CorrespondenceIssue): boolean {
  const extraction = issue.structuredExtraction;
  const review = extraction?.humanReview;
  return ['confirmed', 'edited'].includes(issue.humanReviewStatus) && extraction?.feedbackCoding?.humanConfirmed === true
    && !!review && review.status === issue.humanReviewStatus && Number.isSafeInteger(review.reviewedBy) && review.reviewedBy > 0
    && Number.isFinite(Date.parse(review.reviewedAt)) && review.sourceTextDigest === extraction.sourceTextDigest;
}
export function hasConfirmedObjectiveDisposition(issue: CorrespondenceIssue): boolean {
  return issue.blocker === true && ['open', 'in_progress'].includes(issue.resolutionStatus)
    && issue.structuredExtraction?.feedbackCoding?.register === 'objective' && hasConfirmedFeedbackDisposition(issue);
}
/** One live source/review authority for both derived blockers and the submission verdict. */
export function isCurrentConfirmedFeedbackIssue(issue: CorrespondenceIssue, sourceText: string, direction: string | null): boolean {
  return direction === 'inbound' && hasConfirmedFeedbackDisposition(issue) && hasCurrentIssueSource(issue, sourceText);
}
export function isCurrentConfirmedObjectiveBlocker(issue: CorrespondenceIssue, sourceText: string, direction: string | null): boolean {
  return hasConfirmedObjectiveDisposition(issue) && isCurrentConfirmedFeedbackIssue(issue, sourceText, direction);
}

function unclassifiedIssue(text: string, sourceTextDigest: string, correspondenceId: string): CorrespondenceIssue {
  const evidenceSpan = matchedEvidenceSpan(text);
  return { id: crypto.randomUUID(), correspondenceId, category: 'other_unclassified', severity: 'low', blocker: false,
    responseRequired: true, sourceExcerpt: evidenceSpan.text, confidence: 0.41, humanReviewStatus: 'pending',
    mappedCtdSections: [], mappedArtifactIds: [], resolutionStatus: 'open',
    structuredExtraction: { regulatorAskType: 'manual_triage_required', impactedSubmissionComponent: 'unknown', sectionCandidates: [],
      recommendedOwnerFunction: 'regulatory_affairs', recommendedResponsePackageType: 'manual_triage_response', evidenceNeeds: ['manual issue triage'],
      confidenceTrace: [{ signal: 'no_rule_match', score: 0.41, deterministic: true }], humanReviewRequired: true,
      sourceTextDigest, evidenceSpan, feedbackCoding: proposeFeedbackCoding(evidenceSpan.text, 'other_unclassified') } };
}

export function runGovernedIssueParser(
  text: string,
  correspondenceId: string,
  context: IssueParserContext = {},
): IssueExtractionResult {
  const normalized = text || '';
  const sourceTextDigest = crypto.createHash('sha256').update(normalized).digest('hex');
  /* ONE parser, two taxonomies, selected by what the letter is about — not two
     parsers. A device letter run through the CTD rules produced sections a
     510(k) does not have (measured: a CDRH AI letter returned CTD 2.5 / 2.7.4
     and nothing else), and a drug letter run through the device rules would do
     the mirror image. */
  const device = isDeviceSubmissionType(context.submissionType);
  const pathway = device ? devicePathwayFor(context.submissionType) : null;
  const taxonomy = device
    ? DEVICE_ISSUE_TAXONOMY.map(r => deviceRuleToMatch(r, pathway))
    : KEYWORD_TAXONOMY;
  const matches = taxonomy.filter(rule => rule.pattern.test(normalized));
  const deterministicSignals = matches.map(
    m => `${m.category}:${m.regulatorAskType}:${m.impactedSubmissionComponent}`
  );
  const issues: CorrespondenceIssue[] = (!matches.length
    ? [unclassifiedIssue(normalized, sourceTextDigest, correspondenceId)]
    : matches.map(match => {
        // `in`-narrowing across the union `taxonomy` resolves to after the
        // device/keyword ternary and `.filter` loses precision on
        // `match.subcategory`'s type (only DEVICE_ISSUE_TAXONOMY rows carry
        // one), so TS could not tell this spread's value apart from `{}`. A
        // `typeof` guard on an explicitly-typed local sidesteps that and
        // changes nothing at runtime — device rows still contribute their
        // topic, keyword rows still contribute nothing.
        const subcategory: string | undefined =
          'subcategory' in match && typeof match.subcategory === 'string'
            ? match.subcategory
            : undefined;
        const evidenceSpan = matchedEvidenceSpan(normalized, match.pattern);
        return {
          id: crypto.randomUUID(),
          correspondenceId,
          category: match.category,
          ...(subcategory !== undefined ? { subcategory } : {}),
          severity: match.severity,
          blocker: match.blocker,
          responseRequired: true,
          sourceExcerpt: evidenceSpan.text,
          confidence: match.blocker ? 0.78 : 0.63,
          humanReviewStatus: 'pending' as const,
          mappedCtdSections: match.sectionCandidates,
          mappedArtifactIds: [],
          resolutionStatus: 'open' as const,
          owner: match.ownerFunction,
          structuredExtraction: {
            regulatorAskType: match.regulatorAskType,
            impactedSubmissionComponent: match.impactedSubmissionComponent,
            sectionCandidates: match.sectionCandidates,
            recommendedOwnerFunction: match.ownerFunction,
            recommendedResponsePackageType: match.responsePackageType,
            evidenceNeeds: match.evidenceNeeds,
            confidenceTrace: [
              { signal: `rule_match:${match.category}`, score: 0.6, deterministic: true },
              { signal: `severity:${match.severity}`, score: 0.2, deterministic: true },
            ],
            humanReviewRequired: true,
            sourceTextDigest,
            evidenceSpan,
            feedbackCoding: proposeFeedbackCoding(evidenceSpan.text, match.category),
          },
        };
      }));

  return {
    issues,
    metadata: {
      parserMode: 'heuristic',
      responseContract: ISSUE_PARSER_RESPONSE_CONTRACT,
      extractionMethod: 'keyword_taxonomy_rule_parser_v2',
      confidenceMethod: 'rule_weighted_keyword_parser',
      humanReviewRequired: true,
      parserVersion: ISSUE_PARSER_VERSION,
      extractionVersion: ISSUE_EXTRACTION_VERSION,
      sourceTextDigest,
      matchedRuleCount: matches.length,
      deterministicSignals,
      modelAssistedReasoningUsed: false,
    },
  };
}
