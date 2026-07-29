import type { DocumentQualityIssue } from '../../documentIntelligence/contracts';

export type RegulatoryDocumentClass = '510k' | 'cer' | 'pma' | 'clinical' | 'general';

const CLAIM_PHRASES = [/\bbreakthrough\b/i, /\bguaranteed\b/i, /\b100% safe\b/i, /\bzero risk\b/i];
const HEDGE_PHRASES = [/\bdata on file\b/i, /\bseems to\b/i];
const ABBREVIATION_PATTERN = /\b([A-Z]{2,8})\b/g;

export function runConcept2CureMedicalWritingRules(
  text: string,
  documentClass: RegulatoryDocumentClass = 'general'
): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[] = [];

  for (const pattern of CLAIM_PHRASES) {
    const match = pattern.exec(text);
    if (match?.index !== undefined) {
      issues.push({
        checker: 'concept2cure',
        severity: 'error',
        message: `Promotional or non-regulatory phrasing detected: "${match[0]}"`,
        offsetStart: match.index,
        offsetEnd: match.index + match[0].length,
        ruleId: 'C2C_CLAIM_001',
      });
    }
  }

  for (const pattern of HEDGE_PHRASES) {
    const match = pattern.exec(text);
    if (match?.index !== undefined) {
      issues.push({
        checker: 'concept2cure',
        severity: 'warning',
        message: `Ambiguous phrasing detected: "${match[0]}". Prefer explicit evidence framing.`,
        offsetStart: match.index,
        offsetEnd: match.index + match[0].length,
        ruleId: 'C2C_HEDGE_001',
      });
    }
  }

  const abbreviationMatches = [...text.matchAll(ABBREVIATION_PATTERN)];
  const seen = new Set<string>();
  for (const match of abbreviationMatches) {
    const token = match[1];
    if (seen.has(token)) continue;
    seen.add(token);

    const hasExpansion =
      new RegExp(`\\b${token}\\b\\s*\\(`).test(text) || new RegExp(`\\([^)]*${token}[^)]*\\)`).test(text);
    if (!hasExpansion) {
      issues.push({
        checker: 'concept2cure',
        severity: 'info',
        message: `Abbreviation "${token}" may require first-use expansion for reviewer clarity.`,
        offsetStart: match.index,
        offsetEnd: match.index ? match.index + token.length : undefined,
        ruleId: 'C2C_ABBR_001',
      });
    }
  }

  issues.push(...runDocumentClassChecks(text, documentClass));
  issues.push(...runStatisticalClaimChecks(text));
  return issues;
}

function runDocumentClassChecks(text: string, documentClass: RegulatoryDocumentClass): DocumentQualityIssue[] {
  if (documentClass === '510k') {
    const hasPredicateMention = /predicate device/i.test(text);
    return hasPredicateMention
      ? []
      : [
          {
            checker: 'concept2cure',
            severity: 'warning',
            message: '510(k) draft should explicitly reference a predicate device comparison section.',
            ruleId: 'C2C_510K_PREDICATE_001',
          },
        ];
  }


  if (documentClass === 'clinical') {
    const hasEndpoint = /primary endpoint|secondary endpoint/i.test(text);
    const hasPopulation = /intention-to-treat|per-protocol|safety population/i.test(text);
    const issues: DocumentQualityIssue[] = [];
    if (!hasEndpoint) {
      issues.push({
        checker: 'concept2cure',
        severity: 'warning',
        message: 'Clinical draft should identify primary/secondary endpoint language.',
        ruleId: 'C2C_CLIN_ENDPOINT_001',
      });
    }
    if (!hasPopulation) {
      issues.push({
        checker: 'concept2cure',
        severity: 'info',
        message: 'Clinical draft should identify analysis population (e.g., ITT/per-protocol).',
        ruleId: 'C2C_CLIN_POPULATION_001',
      });
    }
    return issues;
  }

  if (documentClass === 'cer') {
    const hasClinicalBenefitRisk = /benefit[-\s]?risk/i.test(text);
    return hasClinicalBenefitRisk
      ? []
      : [
          {
            checker: 'concept2cure',
            severity: 'warning',
            message: 'CER draft should include explicit benefit-risk characterization language.',
            ruleId: 'C2C_CER_BENEFIT_RISK_001',
          },
        ];
  }

  return [];
}


function runStatisticalClaimChecks(text: string): DocumentQualityIssue[] {
  // `\b` at the end won't match after `%` because % is a non-word char —
  // there's no word↔non-word transition between `%` and the trailing
  // whitespace. Dropping the trailing `\b` lets the regex catch "95%".
  const hasPercentageClaim = /\b\d{1,3}(?:\.\d+)?%/.test(text);
  const hasCiMention = /confidence interval|\bCI\b/i.test(text);
  if (hasPercentageClaim && !hasCiMention) {
    return [{
      checker: 'concept2cure',
      severity: 'warning',
      message: 'Percentage efficacy/safety claims should include CI or statistical uncertainty context.',
      ruleId: 'C2C_STATS_CI_001',
    }];
  }
  return [];
}
