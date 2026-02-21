/**
 * CERV2 Shared Validation Utilities
 *
 * Extracted from CERV2ValidationPanel / CERV2ExportPreviewPanel /
 * CERV2FullExportSimulation for DRY maintenance.
 *
 * classifyHint — phrase-level severity classification for AI validation hints.
 * Avoids false positives on standard regulatory language (e.g., "should be
 * cleared" is legitimate SE language, not a warning).
 */

/**
 * Classify an AI validation hint into a severity level.
 *
 * @param {string|null|undefined} hint – raw hint text from the AI backend
 * @returns {'error'|'warning'|'pass'|'none'}
 */
export function classifyHint(hint) {
  if (!hint || typeof hint !== 'string') return 'none';
  const lower = hint.toLowerCase();

  // Error: explicit failure or missing-required language
  if (
    lower.includes('error validating') ||
    lower.includes('missing required') ||
    lower.includes('must include') ||
    lower.includes('does not comply') ||
    lower.includes('non-compliant')
  )
    return 'error';

  // Warning: unfilled placeholder tokens like [DEVICE NAME]
  if (/\[[A-Z][A-Z _/()-]{2,}\]/.test(hint)) return 'warning';

  // Warning: explicit advisory phrases
  if (
    lower.includes('consider adding') ||
    lower.includes('recommend including') ||
    lower.includes('no enhanced content available') ||
    lower.includes('no compliance data')
  )
    return 'warning';

  return 'pass';
}

// ── Shared constants ────────────────────────────────────────────────────────

/** Human-readable labels for CERV2 document types */
export const DOC_TYPE_LABELS = {
  cerv2_510k: 'FDA 510(k)',
  cerv2_pma: 'FDA PMA',
  cerv2_cer: 'EU MDR CER',
};

/** Short labels for compact UI (e.g., readiness bar header) */
export const DOC_TYPE_SHORT_LABELS = {
  cerv2_510k: '510(k)',
  cerv2_pma: 'PMA',
  cerv2_cer: 'CER',
};

/**
 * Phase 9 P2: Merge AI hint classification with rules-based compliance result.
 * Returns the worst severity and combined issues list.
 *
 * @param {string} aiHint – raw hint string from AI backend
 * @param {{ severity: string, issues: string[], score: number }|null} complianceResult
 * @returns {{ severity: 'error'|'warning'|'pass'|'none', issues: string[], score: number }}
 */
export function mergeValidation(aiHint, complianceResult) {
  const aiSeverity = classifyHint(aiHint);
  const aiIssues =
    aiHint && aiSeverity !== 'pass' && aiSeverity !== 'none' ? [`AI: ${aiHint}`] : [];

  if (!complianceResult) {
    return {
      severity: aiSeverity,
      issues: aiIssues,
      score: aiSeverity === 'error' ? 40 : aiSeverity === 'warning' ? 70 : 100,
    };
  }

  const allIssues = [...complianceResult.issues, ...aiIssues];
  const severityRank = { error: 3, warning: 2, pass: 1, none: 0 };
  const worstSeverity =
    (severityRank[complianceResult.severity] || 0) >= (severityRank[aiSeverity] || 0)
      ? complianceResult.severity
      : aiSeverity;

  return {
    severity: worstSeverity,
    issues: allIssues,
    score: complianceResult.score,
  };
}
