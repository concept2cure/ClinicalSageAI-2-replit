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
