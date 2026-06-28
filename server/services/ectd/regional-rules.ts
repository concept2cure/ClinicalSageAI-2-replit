/**
 * @fileoverview eCTD Regional Rule Packs (FDA / EMA / PMDA)
 * @module server/services/ectd/regional-rules
 *
 * @description
 * Module-1 regional content varies by health authority. This file ships a
 * single entry-point — applyRegionalRules — that returns the regional
 * findings for a leaf set, callable from validatePackage when a region is
 * specified.
 *
 * Each rule only fires when its region is selected. The findings are
 * returned without ids (validatePackage assigns the V-prefixed id during
 * integration so numbering stays sequential with structural findings).
 *
 * Path-matching note: filePath values are expected to be either
 * sequence-relative (e.g., "m1/us/us-regional.xml") or package-relative
 * (e.g., "0000/m1/us/us-regional.xml"). Regional path regexes therefore
 * match `m1/<region>/` at either the start of the string OR after a `/`,
 * not anchored to the package root.
 *
 * @compliance FDA ESG 21 CFR 312.23 / 314.50, EMA CESP, PMDA Gateway
 */

import type { ECTDLeaf, ValidationFinding } from './ectd4-validator';

/** Regional rule pack runner. */
export function applyRegionalRules(
  leaves: ECTDLeaf[],
  region: 'FDA' | 'EMA' | 'PMDA'
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];

  if (region === 'FDA') {
    const hasFDA = leaves.some(
      l =>
        (l.sectionCode || '').toLowerCase() === 'm1.1' ||
        /(^|\/)m1\/us\//i.test(l.filePath || '')
    );
    if (!hasFDA) {
      findings.push({
        id: '',
        severity: 'error',
        code: 'MISSING_REGIONAL_FDA',
        sectionCode: '',
        message: 'Submission has no FDA regional content (m1.1 or m1/us/* leaf)',
        fix: 'Add an FDA Module 1 regional leaf — for example a section m1.1 document or a file under m1/us/',
        rule: 'FDA ESG 21 CFR 312.23 / 314.50',
      });
    }
    return findings;
  }

  if (region === 'EMA') {
    const hasEMA = leaves.some(l => /(^|\/)m1\/eu\//i.test(l.filePath || ''));
    if (!hasEMA) {
      findings.push({
        id: '',
        severity: 'error',
        code: 'MISSING_REGIONAL_EMA',
        sectionCode: '',
        message: 'Submission has no EMA regional content (no leaf under m1/eu/)',
        fix: 'Add an EMA Module 1 regional leaf under the m1/eu/ path',
        rule: 'EMA CESP',
      });
    }
    return findings;
  }

  if (region === 'PMDA') {
    const hasPMDA = leaves.some(l => /(^|\/)m1\/jp\//i.test(l.filePath || ''));
    if (!hasPMDA) {
      findings.push({
        id: '',
        severity: 'error',
        code: 'MISSING_REGIONAL_PMDA',
        sectionCode: '',
        message: 'Submission has no PMDA regional content (no leaf under m1/jp/)',
        fix: 'Add a PMDA Module 1 regional leaf under the m1/jp/ path',
        rule: 'PMDA Gateway',
      });
    }
    return findings;
  }

  return findings;
}
