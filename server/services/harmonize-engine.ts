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
import { normalizeCtdCode } from '../../shared/regulatory/section-code';
import { classifyInTextReferences, type ClassifiedReference } from './ana/in-text-references';

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
  /**
   * The document type of a section, by section key, when the caller knows it
   * (medical-writing.ts DOCUMENT_TYPES id or alias, e.g. 'csr'). A CSR's
   * Section/Table/Figure/Listing numbers are checked against ICH E3; with no
   * type they are checked only against the section keys.
   */
  documentTypes?: Record<string, string>;
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
  /** Dimensions that could not run on this input, and why. Never in checkedDimensions. */
  skippedDimensions: Array<{ dimension: string; reason: string }>;
}

// ─── Summary/body pairs ──────────────────────────────────────────────────────

/** A Module 2 summary and the module whose reports it summarises (ICH M4). */
const CTD_SUMMARY_BODY_PAIRS: ReadonlyArray<{ summary: string; detail: string; label: string }> = [
  { summary: '2.5', detail: '5', label: 'Clinical Overview vs Clinical Study Reports' },
  { summary: '2.4', detail: '4', label: 'Nonclinical Overview vs Nonclinical Reports' },
  { summary: '2.3', detail: '3', label: 'Quality Overall Summary vs Quality Data' },
  { summary: '2.7', detail: '5', label: 'Clinical Summary vs Clinical Reports' },
];

/** Pairs a caller of POST /api/harmonize/check may key by document name. */
const NAMED_SUMMARY_BODY_PAIRS: ReadonlyArray<{ summary: string; detail: string; label: string }> = [
  { summary: 'clinical-overview', detail: 'clinical-study-report', label: 'Clinical Overview vs CSR' },
  { summary: 'executive-summary', detail: 'body', label: 'Executive Summary vs Document Body' },
];

/** The CTD code a section key names ('2.5', 'm2.5', 'module-2.5' → '2.5'), or null. */
function ctdCodeOfKey(key: string): string | null {
  return normalizeCtdCode(key.trim().replace(/^module[\s_-]*/i, ''));
}

/** True when `code` is the CTD heading `heading` or a section below it. */
function isAtOrBelow(code: string, heading: string): boolean {
  return code === heading || code.startsWith(`${heading}.`);
}

// ─── Reference integrity ─────────────────────────────────────────────────────

/** An unresolved reference is an error; one this input cannot decide is a notice. */
function referenceIssue(ref: ClassifiedReference, sectionId: string, id: string): HarmonizeIssue {
  const unresolved = ref.status === 'unresolved';
  const where = ref.qualifier ? ` (${ref.qualifier})` : '';
  return {
    id,
    type: 'reference',
    severity: unresolved ? 'error' : 'info',
    sectionA: sectionId,
    description: unresolved
      ? `${ref.label} does not resolve: ${ref.reason}`
      : `${ref.label}${where} cannot be checked from these sections: ${ref.reason}`,
    valueA: ref.raw,
    recommendation: unresolved
      ? `Correct the reference to an existing ${ref.kind.toLowerCase()}, or remove it.`
      : 'Confirm the target when the referenced document or captions are assembled.',
    autoFixable: false,
  };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class HarmonizeEngine {

  async check(input: HarmonizeInput): Promise<HarmonizeResult> {
    log.info(`HARMONIZE check: ${Object.keys(input.sections).length} sections, type=${input.submissionType}`);

    const issues: HarmonizeIssue[] = [];
    const checkedDimensions: string[] = [];
    const skippedDimensions: HarmonizeResult['skippedDimensions'] = [];

    // 1. Terminology consistency
    checkedDimensions.push('terminology');
    issues.push(...this.checkTerminology(input));

    // 2. Numeric consistency
    checkedDimensions.push('numerics');
    issues.push(...this.checkNumerics(input));

    // 3. Summary/body consistency — only when a summary and its reports are both
    // here. 2026-10-15: this was listed as checked on every input, though its
    // pairs were keyed 'module-2.5' … and every caller keys by CTD code, so it
    // never ran.
    const summaryBody = this.checkSummaryBody(input);
    if (summaryBody.pairsCompared > 0) {
      checkedDimensions.push('summary_body');
      issues.push(...summaryBody.issues);
    } else {
      const withContent = Object.keys(input.sections).filter((key) => input.sections[key]?.trim());
      skippedDimensions.push({
        dimension: 'summary_body',
        reason:
          'No summary with the reports it summarises is among the sections with content (CTD 2.3 with ' +
          `Module 3, 2.4 with Module 4, 2.5 or 2.7 with Module 5): ${withContent.join(', ') || 'none'}.`,
      });
    }

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
      skippedDimensions,
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

  /**
   * Each summary section against the text of every report section it
   * summarises, matched by CTD code (shared normalizeCtdCode: '2.5', 'm2.5' and
   * '2.5.4' are Clinical Overview; '5.3.5.1' is Module 5). A claim is
   * unsupported only when none of those reports carries its key terms.
   * `pairsCompared` is 0 when the input holds no summary with its reports.
   */
  private checkSummaryBody(input: HarmonizeInput): { issues: HarmonizeIssue[]; pairsCompared: number } {
    const issues: HarmonizeIssue[] = [];
    let issueIdx = 0;
    let pairsCompared = 0;

    const withContent = Object.keys(input.sections).filter((key) => input.sections[key]?.trim());
    const coded = withContent.map((key) => ({ key, code: ctdCodeOfKey(key) }));
    const keysAtOrBelow = (heading: string) =>
      coded.filter((s) => s.code !== null && isAtOrBelow(s.code, heading)).map((s) => s.key);

    const pairs = [
      ...CTD_SUMMARY_BODY_PAIRS.map((p) => ({
        label: p.label,
        summaries: keysAtOrBelow(p.summary),
        details: keysAtOrBelow(p.detail),
      })),
      ...NAMED_SUMMARY_BODY_PAIRS.map((p) => ({
        label: p.label,
        summaries: withContent.includes(p.summary) ? [p.summary] : [],
        details: withContent.includes(p.detail) ? [p.detail] : [],
      })),
    ];

    for (const pair of pairs) {
      if (pair.summaries.length === 0 || pair.details.length === 0) continue;
      const detailNames = pair.details.join(', ');
      const detailContent = pair.details.map((key) => input.sections[key]).join('\n').toLowerCase();

      for (const summaryKey of pair.summaries) {
        pairsCompared += 1;
        // Check for key conclusion statements in summary that may not be supported in detail
        const conclusionPatterns = /(?:demonstrates?|shows?|confirms?|establishes?|proves?)\s+([^.]+)/gi;
        const summaryConclusions = Array.from(input.sections[summaryKey].matchAll(conclusionPatterns));

        for (const conclusion of summaryConclusions) {
          const claim = conclusion[1].trim().toLowerCase();
          // Check if key terms from conclusion exist in detail section
          const keyTerms = claim.split(/\s+/).filter(t => t.length > 4);
          const termsFound = keyTerms.filter(t => detailContent.includes(t));
          const coverage = keyTerms.length > 0 ? termsFound.length / keyTerms.length : 1;

          if (coverage < 0.4) {
            issues.push({
              id: `SB-${++issueIdx}`,
              type: 'summary_body',
              severity: 'error',
              sectionA: summaryKey,
              sectionB: detailNames,
              description: `Summary claim "${conclusion[0].substring(0, 100)}..." lacks supporting detail in ${detailNames}`,
              recommendation: `Ensure ${pair.label} alignment — verify claim is substantiated in detail section`,
              autoFixable: false,
            });
          }
        }
      }
    }

    return { issues, pairsCompared };
  }

  /**
   * Reference integrity, on the one in-text reference detector
   * (server/services/ana/in-text-references.ts) since 2026-10-05
   * (g-cross-reference-extractor-migrations). This method held its own three
   * regexes until then and resolved nothing: every dotted number not found in a
   * section key became "verify target exists" — an invented Table 14.9.99 in a
   * CSR, a CTD code the CTD does not have, a protocol section, and "per 1.5 kg"
   * alike.
   *
   * Each reference is now classified against what this input can see: the
   * section keys (as headings: "Section 2.7.4" resolves when 2.7.4 is checked
   * here), the section's document type when the caller passes it (a CSR walks
   * ICH E3), and the CTD registry for Module codes.
   *   unresolved                 → error: the target does not exist;
   *   not-resolvable-from-input  → info: an honest notice, no score deduction;
   *   resolved                   → nothing.
   */
  private checkReferences(input: HarmonizeInput): HarmonizeIssue[] {
    const issues: HarmonizeIssue[] = [];
    let issueIdx = 0;

    const knownHeadings = Object.keys(input.sections).flatMap((key) => {
      const code = /\d+(?:\.\d+)*/.exec(key)?.[0];
      return code ? [`Section ${code}`] : [];
    });

    for (const [sectionId, content] of Object.entries(input.sections)) {
      const refs = classifyInTextReferences(content, {
        documentType: input.documentTypes?.[sectionId],
        knownHeadings,
      });

      const reported = new Set<string>();
      for (const ref of refs) {
        const key = `${ref.label}|${ref.qualifier ?? ''}`;
        if (ref.status === 'resolved' || reported.has(key)) continue;
        reported.add(key);
        issues.push(referenceIssue(ref, sectionId, `REF-${++issueIdx}`));
      }

      // A table cited more than once in a section: note it, so every citation
      // is checked against the same table content.
      const tableCounts = new Map<string, number>();
      for (const ref of refs) {
        if (ref.kind !== 'Table') continue;
        const key = ref.qualifier ? `${ref.label} (${ref.qualifier})` : ref.label;
        tableCounts.set(key, (tableCounts.get(key) ?? 0) + 1);
      }
      for (const [label, count] of tableCounts) {
        if (count < 2) continue;
        issues.push({
          id: `REF-${++issueIdx}`,
          type: 'reference',
          severity: 'info',
          sectionA: sectionId,
          description: `${label} referenced multiple times — verify consistency of table content`,
          recommendation: 'Ensure all references to this table point to the same data',
          autoFixable: false,
        });
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
