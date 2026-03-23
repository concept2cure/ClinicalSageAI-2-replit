/**
 * HARMONIZE Engine — Cross-Module Consistency Enforcement
 *
 * Detects and reports inconsistencies across submission modules:
 * - Terminology mismatches (drug name variants, endpoint naming)
 * - Numeric discrepancies (sample sizes, p-values, confidence intervals)
 * - Summary/body contradictions (Module 2 overview vs Module 5 details)
 * - Reference integrity (broken cross-references, citation mismatches)
 *
 * @module server/services/harmonize-engine
 */

import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('harmonize-engine');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HarmonizeInput {
  /** Map of section ID → section content text */
  sections: Record<string, string>;
  /** Submission type for domain-specific rules */
  submissionType: string;
  /** Product/drug name for terminology checks */
  productName?: string;
  /** Active ingredient name */
  activeIngredient?: string;
}

export interface HarmonizeIssue {
  id: string;
  type: 'terminology' | 'numeric' | 'summary_body' | 'reference' | 'cross_section';
  severity: 'info' | 'warning' | 'error' | 'critical';
  sectionA: string;
  sectionB?: string;
  description: string;
  valueA?: string;
  valueB?: string;
  recommendation: string;
  autoFixable: boolean;
}

export interface HarmonizeResult {
  totalIssues: number;
  criticalCount: number;
  errorCount: number;
  warningCount: number;
  issues: HarmonizeIssue[];
  consistencyScore: number;
  checkedDimensions: string[];
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class HarmonizeEngine {

  async check(input: HarmonizeInput): Promise<HarmonizeResult> {
    log.info(`HARMONIZE check: ${Object.keys(input.sections).length} sections, type=${input.submissionType}`);

    const issues: HarmonizeIssue[] = [];
    const checkedDimensions: string[] = [];

    // 1. Terminology consistency
    checkedDimensions.push('terminology');
    issues.push(...this.checkTerminology(input));

    // 2. Numeric consistency
    checkedDimensions.push('numerics');
    issues.push(...this.checkNumerics(input));

    // 3. Summary/body consistency
    checkedDimensions.push('summary_body');
    issues.push(...this.checkSummaryBody(input));

    // 4. Reference integrity
    checkedDimensions.push('references');
    issues.push(...this.checkReferences(input));

    // 5. Cross-section consistency
    checkedDimensions.push('cross_section');
    issues.push(...this.checkCrossSectionConsistency(input));

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    // Consistency score: 100 = perfect, deduct for issues
    const deductions = criticalCount * 15 + errorCount * 8 + warningCount * 3;
    const consistencyScore = Math.max(0, Math.min(100, 100 - deductions));

    return {
      totalIssues: issues.length,
      criticalCount,
      errorCount,
      warningCount,
      issues,
      consistencyScore,
      checkedDimensions,
    };
  }

  private checkTerminology(input: HarmonizeInput): HarmonizeIssue[] {
    const issues: HarmonizeIssue[] = [];
    const sections = Object.entries(input.sections);
    let issueIdx = 0;

    // Check product name consistency
    if (input.productName) {
      const nameVariants = new Map<string, string[]>();
      const namePatterns = [
        input.productName,
        input.productName.toLowerCase(),
        input.productName.toUpperCase(),
        input.productName.replace(/\s+/g, '-'),
        input.productName.replace(/\s+/g, ''),
      ];

      for (const [sectionId, content] of sections) {
        for (const variant of namePatterns) {
          if (content.includes(variant) && variant !== input.productName) {
            const existing = nameVariants.get(variant) || [];
            existing.push(sectionId);
            nameVariants.set(variant, existing);
          }
        }
      }

      for (const [variant, sectionIds] of nameVariants) {
        if (variant !== input.productName) {
          issues.push({
            id: `TERM-${++issueIdx}`,
            type: 'terminology',
            severity: 'warning',
            sectionA: sectionIds[0],
            description: `Product name variant "${variant}" found — should be "${input.productName}"`,
            valueA: variant,
            valueB: input.productName,
            recommendation: `Standardize to "${input.productName}" across all sections`,
            autoFixable: true,
          });
        }
      }
    }

    // Check endpoint terminology consistency across sections
    const endpointTerms = new Map<string, Set<string>>();
    const endpointPatterns = [
      /(?:primary|secondary|key secondary)\s+endpoint[s]?\s*(?:is|was|were|:)\s*([^.;]+)/gi,
      /(?:overall survival|progression[- ]free survival|objective response rate|complete response|partial response|disease[- ]free survival|event[- ]free survival|duration of response)/gi,
    ];

    for (const [sectionId, content] of sections) {
      for (const pattern of endpointPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const term = match[0].toLowerCase().trim();
          const existing = endpointTerms.get(term) || new Set<string>();
          existing.add(sectionId);
          endpointTerms.set(term, existing);
        }
      }
    }

    // Check for abbreviation inconsistencies
    const abbreviations = new Map<string, { full: string; abbr: string; sections: string[] }>();
    const abbrPattern = /(\b[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*)\s*\(([A-Z]{2,6})\)/g;

    for (const [sectionId, content] of sections) {
      const matches = content.matchAll(abbrPattern);
      for (const match of matches) {
        const full = match[1].trim();
        const abbr = match[2].trim();
        const existing = abbreviations.get(abbr);
        if (existing && existing.full.toLowerCase() !== full.toLowerCase()) {
          issues.push({
            id: `TERM-${++issueIdx}`,
            type: 'terminology',
            severity: 'error',
            sectionA: existing.sections[0],
            sectionB: sectionId,
            description: `Abbreviation "${abbr}" defined differently: "${existing.full}" vs "${full}"`,
            valueA: `${existing.full} (${abbr})`,
            valueB: `${full} (${abbr})`,
            recommendation: `Standardize definition of ${abbr} across all sections`,
            autoFixable: false,
          });
        } else if (!existing) {
          abbreviations.set(abbr, { full, abbr, sections: [sectionId] });
        } else {
          existing.sections.push(sectionId);
        }
      }
    }

    return issues;
  }

  private checkNumerics(input: HarmonizeInput): HarmonizeIssue[] {
    const issues: HarmonizeIssue[] = [];
    const sections = Object.entries(input.sections);
    let issueIdx = 0;

    // Extract numeric claims per section
    const numericClaims = new Map<string, Map<string, string>>();

    const numericPatterns: Array<{ label: string; pattern: RegExp }> = [
      { label: 'sample_size', pattern: /(?:N\s*=\s*|n\s*=\s*|sample size[^.]*?)\s*(\d{1,5})/gi },
      { label: 'p_value', pattern: /p\s*[<>=]\s*(0\.\d+|<\s*0\.\d+)/gi },
      { label: 'confidence_interval', pattern: /(\d+(?:\.\d+)?)\s*%\s*(?:CI|confidence interval)/gi },
      { label: 'hazard_ratio', pattern: /(?:HR|hazard ratio)\s*[=:]\s*(\d+\.\d+)/gi },
      { label: 'odds_ratio', pattern: /(?:OR|odds ratio)\s*[=:]\s*(\d+\.\d+)/gi },
      { label: 'response_rate', pattern: /(?:ORR|response rate|CR rate)\s*(?:of|was|=|:)\s*(\d+(?:\.\d+)?)\s*%/gi },
    ];

    for (const [sectionId, content] of sections) {
      const sectionNums = new Map<string, string>();
      for (const { label, pattern } of numericPatterns) {
        const matches = content.matchAll(pattern);
        for (const match of matches) {
          const key = `${label}:${match[0].substring(0, 30)}`;
          sectionNums.set(key, match[1] || match[0]);
        }
      }
      numericClaims.set(sectionId, sectionNums);
    }

    // Cross-check numerics between sections
    const sectionIds = Array.from(numericClaims.keys());
    for (let i = 0; i < sectionIds.length; i++) {
      for (let j = i + 1; j < sectionIds.length; j++) {
        const numsA = numericClaims.get(sectionIds[i])!;
        const numsB = numericClaims.get(sectionIds[j])!;

        for (const [key, valA] of numsA) {
          const label = key.split(':')[0];
          // Find matching keys in other section
          for (const [keyB, valB] of numsB) {
            if (keyB.split(':')[0] === label && valA !== valB) {
              issues.push({
                id: `NUM-${++issueIdx}`,
                type: 'numeric',
                severity: label === 'sample_size' || label === 'p_value' ? 'critical' : 'error',
                sectionA: sectionIds[i],
                sectionB: sectionIds[j],
                description: `${label.replace(/_/g, ' ')} discrepancy: "${valA}" vs "${valB}"`,
                valueA: valA,
                valueB: valB,
                recommendation: `Verify the correct ${label.replace(/_/g, ' ')} and reconcile across both sections`,
                autoFixable: false,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  private checkSummaryBody(input: HarmonizeInput): HarmonizeIssue[] {
    const issues: HarmonizeIssue[] = [];
    let issueIdx = 0;

    // Define known summary → detail section pairs
    const summaryPairs: Array<{ summary: string; detail: string; label: string }> = [
      { summary: 'module-2.5', detail: 'module-5', label: 'Clinical Overview vs Clinical Study Reports' },
      { summary: 'module-2.4', detail: 'module-4', label: 'Nonclinical Overview vs Nonclinical Reports' },
      { summary: 'module-2.3', detail: 'module-3', label: 'Quality Overall Summary vs Quality Data' },
      { summary: 'module-2.7', detail: 'module-5', label: 'Clinical Summary vs Clinical Reports' },
      { summary: 'clinical-overview', detail: 'clinical-study-report', label: 'Clinical Overview vs CSR' },
      { summary: 'executive-summary', detail: 'body', label: 'Executive Summary vs Document Body' },
    ];

    for (const pair of summaryPairs) {
      const summaryContent = input.sections[pair.summary];
      const detailContent = input.sections[pair.detail];

      if (summaryContent && detailContent) {
        // Check for key conclusion statements in summary that may not be supported in detail
        const conclusionPatterns = /(?:demonstrates?|shows?|confirms?|establishes?|proves?)\s+([^.]+)/gi;
        const summaryConclusions = Array.from(summaryContent.matchAll(conclusionPatterns));

        for (const conclusion of summaryConclusions) {
          const claim = conclusion[1].trim().toLowerCase();
          // Check if key terms from conclusion exist in detail section
          const keyTerms = claim.split(/\s+/).filter(t => t.length > 4);
          const termsFound = keyTerms.filter(t => detailContent.toLowerCase().includes(t));
          const coverage = keyTerms.length > 0 ? termsFound.length / keyTerms.length : 1;

          if (coverage < 0.4) {
            issues.push({
              id: `SB-${++issueIdx}`,
              type: 'summary_body',
              severity: 'error',
              sectionA: pair.summary,
              sectionB: pair.detail,
              description: `Summary claim "${conclusion[0].substring(0, 100)}..." lacks supporting detail in ${pair.detail}`,
              recommendation: `Ensure ${pair.label} alignment — verify claim is substantiated in detail section`,
              autoFixable: false,
            });
          }
        }
      }
    }

    return issues;
  }

  private checkReferences(input: HarmonizeInput): HarmonizeIssue[] {
    const issues: HarmonizeIssue[] = [];
    let issueIdx = 0;

    // Collect all cross-references
    const crossRefPattern = /(?:see|refer to|as described in|per|Section|Module|Table|Figure)\s+(\d+(?:\.\d+)*(?:\.\d+)?)/gi;
    const tableRefPattern = /Table\s+(\d+(?:\.\d+)?(?:-\d+)?)/gi;
    const figureRefPattern = /Figure\s+(\d+(?:\.\d+)?(?:-\d+)?)/gi;

    for (const [sectionId, content] of Object.entries(input.sections)) {
      // Check for dangling section references
      const sectionRefs = Array.from(content.matchAll(crossRefPattern));
      for (const ref of sectionRefs) {
        const refTarget = ref[1];
        // Check if referenced section exists in input
        const targetExists = Object.keys(input.sections).some(
          s => s.includes(refTarget) || s.includes(`module-${refTarget}`)
        );
        if (!targetExists && refTarget.includes('.')) {
          issues.push({
            id: `REF-${++issueIdx}`,
            type: 'reference',
            severity: 'warning',
            sectionA: sectionId,
            description: `Cross-reference to Section ${refTarget} — verify target exists in final submission`,
            recommendation: 'Confirm all cross-references resolve to valid sections in the assembled eCTD',
            autoFixable: false,
          });
        }
      }

      // Check for duplicate table/figure numbers across sections
      const tableRefs = Array.from(content.matchAll(tableRefPattern));
      const figureRefs = Array.from(content.matchAll(figureRefPattern));

      if (tableRefs.length > 0) {
        const tableNums = tableRefs.map(m => m[1]);
        const duplicates = tableNums.filter((v, i) => tableNums.indexOf(v) !== i);
        for (const dup of new Set(duplicates)) {
          issues.push({
            id: `REF-${++issueIdx}`,
            type: 'reference',
            severity: 'info',
            sectionA: sectionId,
            description: `Table ${dup} referenced multiple times — verify consistency of table content`,
            recommendation: 'Ensure all references to this table point to the same data',
            autoFixable: false,
          });
        }
      }
    }

    return issues;
  }

  private checkCrossSectionConsistency(input: HarmonizeInput): HarmonizeIssue[] {
    const issues: HarmonizeIssue[] = [];
    let issueIdx = 0;

    // Check for safety framing consistency
    const safetyClaims = new Map<string, string[]>();
    const safetyPatterns = [
      /(?:well[- ]tolerated|favorable safety|acceptable safety|manageable safety)/gi,
      /(?:serious adverse event|SAE|SUSAR|treatment-related death|discontinuation due to AE)/gi,
      /(?:black box warning|boxed warning|contraindication)/gi,
    ];

    for (const [sectionId, content] of Object.entries(input.sections)) {
      for (const pattern of safetyPatterns) {
        const matches = Array.from(content.matchAll(pattern));
        for (const match of matches) {
          const claim = match[0].toLowerCase();
          const existing = safetyClaims.get(claim) || [];
          existing.push(sectionId);
          safetyClaims.set(claim, existing);
        }
      }
    }

    // Check for contradictory safety claims
    const positiveSafety = ['well-tolerated', 'favorable safety', 'acceptable safety', 'manageable safety'];
    const negativeSafety = ['serious adverse event', 'sae', 'susar', 'treatment-related death', 'discontinuation due to ae'];

    const sectionsWithPositive = new Set<string>();
    const sectionsWithNegative = new Set<string>();

    for (const [claim, sectionIds] of safetyClaims) {
      if (positiveSafety.some(p => claim.includes(p))) {
        sectionIds.forEach(s => sectionsWithPositive.add(s));
      }
      if (negativeSafety.some(n => claim.includes(n))) {
        sectionIds.forEach(s => sectionsWithNegative.add(s));
      }
    }

    // Sections that have both positive AND negative safety claims
    for (const section of sectionsWithPositive) {
      if (sectionsWithNegative.has(section)) {
        issues.push({
          id: `XS-${++issueIdx}`,
          type: 'cross_section',
          severity: 'warning',
          sectionA: section,
          description: 'Section contains both positive safety framing and serious AE references — ensure narrative is balanced and consistent',
          recommendation: 'Review safety narrative for balanced framing that acknowledges AEs while presenting overall benefit-risk',
          autoFixable: false,
        });
      }
    }

    return issues;
  }
}

export const harmonizeEngine = new HarmonizeEngine();
