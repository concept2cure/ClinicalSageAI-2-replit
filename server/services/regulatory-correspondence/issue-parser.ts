import crypto from 'node:crypto';
import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';

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
  };
}

const KEYWORD_TAXONOMY: Array<{
  pattern: RegExp;
  category: CorrespondenceIssue['category'];
  severity: CorrespondenceIssue['severity'];
  blocker: boolean;
}> = [
  { pattern: /refuse to file|rtf|reject/i, category: 'filing_acceptance_issue', severity: 'critical', blocker: true },
  { pattern: /deficiency|missing information|clarification/i, category: 'missing_information_clarification', severity: 'high', blocker: true },
  { pattern: /stability|specification|quality|cmc/i, category: 'cmc_quality_issue', severity: 'high', blocker: true },
  { pattern: /safety|adverse event|risk/i, category: 'clinical_safety_issue', severity: 'high', blocker: true },
  { pattern: /efficacy|endpoint|benefit/i, category: 'clinical_efficacy_issue', severity: 'medium', blocker: false },
  { pattern: /format|ectd|technical/i, category: 'ectd_technical_formatting', severity: 'medium', blocker: false },
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

export function runGovernedIssueParser(text: string, correspondenceId: string): IssueExtractionResult {
  const normalized = text || '';
  const sourceTextDigest = crypto.createHash('sha256').update(normalized).digest('hex');
  const matches = KEYWORD_TAXONOMY.filter(rule => rule.pattern.test(normalized));

  const issues = (!matches.length
    ? [{
        id: crypto.randomUUID(),
        correspondenceId,
        category: 'other_unclassified' as const,
        severity: 'low' as const,
        blocker: false,
        responseRequired: true,
        sourceExcerpt: normalized.slice(0, 280),
        confidence: 0.41,
        humanReviewStatus: 'pending' as const,
        mappedCtdSections: [],
        mappedArtifactIds: [],
        resolutionStatus: 'open' as const,
      }]
    : matches.map(match => ({
        id: crypto.randomUUID(),
        correspondenceId,
        category: match.category,
        severity: match.severity,
        blocker: match.blocker,
        responseRequired: true,
        sourceExcerpt: normalized.slice(0, 280),
        confidence: match.blocker ? 0.78 : 0.63,
        humanReviewStatus: 'pending' as const,
        mappedCtdSections: [],
        mappedArtifactIds: [],
        resolutionStatus: 'open' as const,
      }))) satisfies CorrespondenceIssue[];

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
    },
  };
}
