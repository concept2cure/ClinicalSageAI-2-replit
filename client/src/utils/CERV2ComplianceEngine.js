/**
 * CERV2 Compliance Engine — Phase 9 P2
 *
 * Rules-based validation engine separate from AI content generation.
 * Checks structural and regulatory requirements that don't need AI:
 *
 * 1. Required sections present & populated
 * 2. Placeholder tokens resolved ([DEVICE NAME], etc.)
 * 3. Minimum word counts per section
 * 4. Required elements mentioned (standards, predicate, etc.)
 * 5. Required regulatory references cited
 * 6. Cross-section consistency (device name matches across sections)
 *
 * Returns structured validation results per section with severity levels.
 */

import { getSectionTarget } from './cerv2-section-targets.js';

/** Unresolved placeholder pattern: [ALL CAPS WITH SPACES] */
const PLACEHOLDER_REGEX = /\[[A-Z][A-Z _/()-]{2,}\]/g;

/**
 * Regulatory standard patterns to check for by doc type.
 */
const REQUIRED_STANDARDS = {
  cerv2_510k: [
    { pattern: /IEC 60601/i, label: 'IEC 60601 (Electrical Safety)', sections: ['testing'] },
    { pattern: /ISO 10993/i, label: 'ISO 10993 (Biocompatibility)', sections: ['testing'] },
    { pattern: /IEC 62304/i, label: 'IEC 62304 (Software)', sections: ['testing'], optional: true },
    { pattern: /21\s*CFR/i, label: '21 CFR Reference', sections: ['admin', 'summary', 'labeling'] },
  ],
  cerv2_pma: [
    { pattern: /21\s*CFR\s*Part\s*820/i, label: '21 CFR Part 820 (QSR)', sections: ['mfgqa'] },
    { pattern: /ISO 13485/i, label: 'ISO 13485 (QMS)', sections: ['mfgqa'] },
    { pattern: /IEC 60601/i, label: 'IEC 60601 (Electrical Safety)', sections: ['nonclin'] },
    { pattern: /ISO 10993/i, label: 'ISO 10993 (Biocompatibility)', sections: ['nonclin'] },
    {
      pattern: /ISO 14155/i,
      label: 'ISO 14155 (Clinical Investigation)',
      sections: ['clin'],
      optional: true,
    },
  ],
  cerv2_cer: [
    {
      pattern: /MDR\s*2017\/745/i,
      label: 'MDR 2017/745',
      sections: ['sota', 'benefitrisk', 'gspr', 'concl'],
    },
    {
      pattern: /MEDDEV\s*2\.7\/1/i,
      label: 'MEDDEV 2.7/1 rev. 4',
      sections: ['sota', 'dataset', 'appraisal'],
    },
    { pattern: /ISO 14971/i, label: 'ISO 14971 (Risk Management)', sections: ['benefitrisk'] },
    { pattern: /Annex\s*(I|XIV)/i, label: 'MDR Annex I/XIV', sections: ['gspr', 'concl'] },
    {
      pattern: /Article\s*(61|83|84|85|86)/i,
      label: 'MDR Article Reference',
      sections: ['sota', 'pms'],
    },
  ],
};

function wordCount(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Validate a single section.
 *
 * @param {string} docType
 * @param {string} sectionId
 * @param {string} content — combined user content + AI content
 * @param {Object} deviceContext — { deviceName, predicateDevice, etc. }
 * @returns {{ severity: 'error'|'warning'|'pass', issues: string[], score: number }}
 */
export function validateSection(docType, sectionId, content, deviceContext = {}) {
  const issues = [];
  const target = getSectionTarget(docType, sectionId);
  const words = wordCount(content);

  // ── Check 1: Section empty ──────────────────────────────────────────
  if (!content || words === 0) {
    return {
      severity: 'error',
      issues: ['Section is empty — add content before export.'],
      score: 0,
    };
  }

  // ── Check 2: Minimum word count ─────────────────────────────────────
  if (words < target.min) {
    issues.push(`Section has ${words} words — minimum ${target.min} recommended.`);
  }

  // ── Check 3: Unresolved placeholders ────────────────────────────────
  const placeholders = content.match(PLACEHOLDER_REGEX);
  if (placeholders && placeholders.length > 0) {
    const unique = [...new Set(placeholders)];
    issues.push(
      `${unique.length} unresolved placeholder${unique.length > 1 ? 's' : ''}: ${unique.slice(0, 3).join(', ')}${unique.length > 3 ? ` (+${unique.length - 3} more)` : ''}`
    );
  }

  // ── Check 4: Required elements ──────────────────────────────────────
  const lower = content.toLowerCase();
  const missingElements = target.requiredElements.filter(el => !lower.includes(el.toLowerCase()));
  if (missingElements.length > 0) {
    issues.push(
      `Missing required elements: ${missingElements.slice(0, 3).join(', ')}${missingElements.length > 3 ? ` (+${missingElements.length - 3} more)` : ''}`
    );
  }

  // ── Check 5: Required standards ─────────────────────────────────────
  const standards = REQUIRED_STANDARDS[docType] || [];
  const applicableStandards = standards.filter(s => s.sections.includes(sectionId) && !s.optional);
  const missingStandards = applicableStandards.filter(s => !s.pattern.test(content));
  if (missingStandards.length > 0) {
    issues.push(`Missing regulatory references: ${missingStandards.map(s => s.label).join(', ')}`);
  }

  // ── Check 6: Device name consistency ────────────────────────────────
  if (deviceContext.deviceName && content.includes('[DEVICE NAME]')) {
    issues.push(`Device name placeholder still present — should be "${deviceContext.deviceName}".`);
  }

  // ── Scoring ─────────────────────────────────────────────────────────
  const hasError = issues.some(
    i => i.includes('empty') || i.includes('placeholder') || i.includes('Missing required')
  );

  let score = 100;
  if (words < target.min) score -= 30;
  else if (words < target.target) score -= 10;
  if (placeholders?.length) score -= Math.min(40, placeholders.length * 10);
  if (missingElements.length) score -= Math.min(30, missingElements.length * 10);
  if (missingStandards.length) score -= Math.min(20, missingStandards.length * 10);
  score = Math.max(0, Math.min(100, score));

  return {
    severity: hasError ? 'error' : issues.length > 0 ? 'warning' : 'pass',
    issues,
    score,
  };
}

/**
 * Validate all sections for a document.
 */
export function validateDocument(docType, outline, sectionContents, deviceContext = {}) {
  const sections = {};
  let totalScore = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (const section of outline) {
    const content = sectionContents[section.id] || '';
    const result = validateSection(docType, section.id, content, deviceContext);
    sections[section.id] = result;
    totalScore += result.score;
    if (result.severity === 'error') errorCount++;
    if (result.severity === 'warning') warningCount++;
  }

  const overallScore = outline.length > 0 ? Math.round(totalScore / outline.length) : 0;

  return { sections, overallScore, errorCount, warningCount };
}
