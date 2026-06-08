/**
 * Deterministic dispatch-readiness validator over the CANONICAL CORE.
 *
 * Computes the error count that feeds the dispatch gate (dispatch-gate.ts) from
 * a sequence's `submission_leaves` — server-side truth, never a client-supplied
 * number. The whole point of the hard gate is that it cannot be talked out of a
 * blocker; that only holds if the inputs are computed, not trusted.
 *
 * HARD ERRORS are limited to unambiguous, format-independent structural defects
 * that genuinely prevent a valid dispatch (a false-positive block in a hard gate
 * is as harmful as a missed one):
 *   - EMPTY_SEQUENCE      — nothing dispatchable
 *   - UNRESOLVED_DOCUMENT — a non-delete leaf with no document to assemble
 *   - INVALID_LIFECYCLE_OP — an operation outside new|replace|append|delete
 *
 * Required-section completeness is reported as a non-blocking WARNING (Module-1
 * numbering and leaf section codes don't align cleanly across regions, so it is
 * informative, not provable). Pathway/regional completeness is covered separately
 * by the pathway engines and the AI dispatch-qc advisory.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/ectd/dispatch-readiness
 */

export interface ReadinessLeaf {
  sectionCode: string;
  title: string;
  /** new | replace | append | delete */
  lifecycleOp: string;
  documentTable: string | null;
  documentId: number | null;
}

export interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
}

export interface DispatchReadinessReport {
  errors: number;
  warnings: number;
  infos: number;
  findings: ReadinessFinding[];
}

export interface ComputeReadinessOptions {
  /** Section codes the region marks required (e.g. region profile Module-1). */
  requiredSections?: string[];
}

const VALID_OPS = new Set(['new', 'replace', 'append', 'delete']);

/** Lowercase, drop a leading 'm' (module prefix), strip non-alphanumerics. */
function normalizeCode(code: string): string {
  return (code || '').toLowerCase().replace(/^m(?=\d)/, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Evaluate a sequence's canonical leaves for dispatch readiness. `errors` is the
 * authoritative count the dispatch gate must use; it is never inflated by the
 * informative warning/info findings.
 */
export function computeDispatchReadiness(
  leaves: ReadinessLeaf[],
  opts: ComputeReadinessOptions = {}
): DispatchReadinessReport {
  const findings: ReadinessFinding[] = [];

  const activeNonDelete = leaves.filter(l => l.lifecycleOp !== 'delete');

  // ERROR: nothing dispatchable.
  if (activeNonDelete.length === 0) {
    findings.push({
      severity: 'error',
      code: 'EMPTY_SEQUENCE',
      sectionCode: null,
      message: 'Sequence has no dispatchable leaves (every leaf is a delete or none exist).',
    });
  }

  for (const leaf of leaves) {
    // ERROR: invalid lifecycle operation.
    if (!VALID_OPS.has(leaf.lifecycleOp)) {
      findings.push({
        severity: 'error',
        code: 'INVALID_LIFECYCLE_OP',
        sectionCode: leaf.sectionCode,
        message: `Leaf "${leaf.title}" has invalid lifecycle operation "${leaf.lifecycleOp}" (expected new|replace|append|delete).`,
      });
    }

    // ERROR: a non-delete leaf with no document cannot be assembled.
    if (leaf.lifecycleOp !== 'delete' && (!leaf.documentTable || !leaf.documentId)) {
      findings.push({
        severity: 'error',
        code: 'UNRESOLVED_DOCUMENT',
        sectionCode: leaf.sectionCode,
        message: `Leaf "${leaf.title}" (${leaf.sectionCode}) has no resolvable document — it cannot be assembled into the package.`,
      });
    }
  }

  // WARNING: required sections not present (informative — prefix match).
  if (opts.requiredSections && opts.requiredSections.length) {
    const presentNorm = activeNonDelete.map(l => normalizeCode(l.sectionCode));
    for (const required of opts.requiredSections) {
      const reqNorm = normalizeCode(required);
      if (!reqNorm) continue;
      const present = presentNorm.some(p => p === reqNorm || p.startsWith(reqNorm));
      if (!present) {
        findings.push({
          severity: 'warning',
          code: 'MISSING_REQUIRED_SECTION',
          sectionCode: required,
          message: `Required section ${required} has no leaf in this sequence.`,
        });
      }
    }
  }

  // INFO: a section carries more than one active "new" leaf.
  const newBySection = new Map<string, number>();
  for (const leaf of activeNonDelete) {
    if (leaf.lifecycleOp === 'new') {
      newBySection.set(leaf.sectionCode, (newBySection.get(leaf.sectionCode) || 0) + 1);
    }
  }
  for (const [code, count] of newBySection) {
    if (count > 1) {
      findings.push({
        severity: 'info',
        code: 'DUPLICATE_NEW_SECTION',
        sectionCode: code,
        message: `Section ${code} has ${count} leaves with operation "new" — confirm the lifecycle is intended.`,
      });
    }
  }

  return {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    infos: findings.filter(f => f.severity === 'info').length,
    findings,
  };
}

export default { computeDispatchReadiness };
