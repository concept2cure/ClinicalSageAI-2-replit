/**
 * ectdReadiness — pure aggregation logic for the E10 "assemble Module 2/5 +
 * readiness verification gate" action.
 *
 * A single audited action assembles an eCTD module from project artifacts
 * (`assemble_ectd_module_from_artifacts`) and then runs two readiness checks
 * over the assembled output:
 *
 *   1. STRUCTURAL  — `validate_docx`: the assembled .docx is OOXML-valid
 *      (required parts present, every XML/rels part well-formed, relationships
 *      resolve, python-docx re-opens it cleanly).
 *   2. CONSISTENCY — `check_dossier_consistency`: the module's content does not
 *      contradict the rest of the dossier (sample sizes, p-values, doses,
 *      NOAEL, shelf life, endpoint definitions, CTD cross-references).
 *
 * This module turns those two tool results into a single READINESS GATE
 * verdict. The gate is the honesty contract enforced in the UI:
 *
 *   - `gate === 'ready'`  ONLY when BOTH checks are clean. Export / seal /
 *     PDUFA-clock submission are unlocked.
 *   - any blocker, or a structural failure, or a non-"clean" consistency
 *     verdict → `gate === 'blocked'`, with the blocking items enumerated (each
 *     with a deep link the reviewer can jump to). Export / seal are disabled.
 *   - sample / not-assessed inputs → `gate === 'not_assessed'`. NEVER sealable
 *     or exportable — a gate that was never run cannot certify readiness.
 *
 * This file contains NO React and NO side effects — it is the testable kernel
 * the gate panel renders. It does NOT call, modify, or reimplement the eCTD /
 * CSR builder or validator; it only AGGREGATES the already-built tool results.
 *
 * @module client/src/concept2cure/components/ana/ectdReadiness
 */

/**
 * Result of `assemble_ectd_module_from_artifacts`, mapped to the client. Mirrors
 * the executor's JSON envelope (server/services/ana/AnaToolExecutor.ts).
 */
export interface AssembledModuleResult {
  /** CTD module prefix that was assembled, e.g. "2.5", "5.3.5". */
  moduleNumber: string;
  /** Number of artifact sections folded into the assembled module. */
  sectionsAssembled: number;
  /** Section index (number + title), ordered, for deep-linking. */
  sectionsIndex: { number: string; title: string }[];
  /** Assembled output descriptor. `path` is the .docx the readiness checks ran on. */
  output: { path: string; format: string; sizeBytes?: number };
  /**
   * True when the assembled module is sample / placeholder data, not a live
   * artifact-store assembly. A sample assembly can never seal or export.
   */
  sample?: boolean;
}

/** Structural readiness — the client shape of a `validate_docx` result. */
export interface StructuralReadiness {
  ok: boolean;
  partsChecked?: number;
  paragraphCount?: number | null;
  missingParts?: string[];
  malformedParts?: { part: string; error: string }[];
  danglingRels?: { rels: string; target: string }[];
  errors?: string[];
}

/** Consistency verdict — the client shape of a `check_dossier_consistency` result. */
export type ConsistencyVerdict = 'clean' | 'minor_issues' | 'needs_review' | 'blocker';

export interface ConsistencyReadiness {
  verdict: ConsistencyVerdict;
  artifactsCompared?: number;
  divergences: {
    kind: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    draftValue?: string;
    existingValue?: string;
    existingArtifact?: string;
    existingCtdSection?: string;
  }[];
}

/** A single thing standing between the module and a sealable submission. */
export interface BlockingItem {
  /** Stable id for keys + test assertions. */
  id: string;
  /** Which check raised it. */
  source: 'structural' | 'consistency';
  /** Highest first — drives ordering and severity styling. */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Reviewer-grade, factual one-liner. No emoji, no exclamations. */
  label: string;
  /**
   * Deep link the reviewer follows to resolve the item — a CTD section anchor
   * (consistency) or the assembled output path (structural). Surfaced as the
   * item's action so the gate is navigable, not just a list.
   */
  deepLink?: { kind: 'ctd_section' | 'output_path'; target: string; label: string };
}

export type GateStatus = 'ready' | 'blocked' | 'not_assessed';

export interface ReadinessGate {
  /** The honesty verdict. Only `ready` unlocks export / seal / submission. */
  gate: GateStatus;
  /** Structural sub-verdict for the two-line gate summary. */
  structuralOk: boolean;
  /** Consistency sub-verdict. */
  consistencyVerdict: ConsistencyVerdict | 'not_assessed';
  /** Everything blocking the gate, highest-severity first. Empty when ready. */
  blockingItems: BlockingItem[];
  /**
   * True only when the gate is `ready` AND the assembly is not a sample. The UI
   * binds export / seal `disabled` to the negation of this. This is the single
   * source of truth for the Part 11 honesty contract — a non-clean verdict, or
   * a sample, can never be true here.
   */
  sealable: boolean;
  /** Module that was assessed, for the gate header. */
  moduleNumber: string;
  /** Factual one-line summary for the live region. */
  summary: string;
}

const SEVERITY_RANK: Record<BlockingItem['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Aggregate the assembled module + structural + consistency results into a
 * single readiness gate. Pure; the honesty contract is enforced here so the
 * UI cannot accidentally seal a non-clean module.
 *
 * Honesty rules:
 *   - A sample assembly is `not_assessed` and never sealable, regardless of the
 *     check results (sample data must not certify a real submission).
 *   - Missing structural OR consistency input → `not_assessed`, never sealable.
 *   - Structural failure → blocked, with the structural defects listed.
 *   - Consistency verdict other than `clean` → blocked, with its divergences
 *     listed (critical/high promoted to blocking severity verbatim).
 *   - `ready` (and sealable) ONLY when not-sample, structural ok, and
 *     consistency clean.
 */
export function aggregateReadiness(args: {
  assembled: AssembledModuleResult | null | undefined;
  structural: StructuralReadiness | null | undefined;
  consistency: ConsistencyReadiness | null | undefined;
}): ReadinessGate {
  const { assembled, structural, consistency } = args;
  const moduleNumber = assembled?.moduleNumber ?? '';

  // not_assessed: the gate was never (fully) run, or it ran over sample data.
  // Either way it can NEVER certify readiness — the contract is explicit.
  if (!assembled || !structural || !consistency) {
    return {
      gate: 'not_assessed',
      structuralOk: false,
      consistencyVerdict: 'not_assessed',
      blockingItems: [],
      sealable: false,
      moduleNumber,
      summary: 'Readiness not assessed — assemble the module and run the checks.',
    };
  }
  if (assembled.sample) {
    return {
      gate: 'not_assessed',
      structuralOk: structural.ok,
      consistencyVerdict: consistency.verdict,
      blockingItems: [],
      sealable: false,
      moduleNumber,
      summary:
        'Sample module — readiness gate not certifiable. Assemble from live artifacts to seal.',
    };
  }

  const blockingItems: BlockingItem[] = [];

  // ── Structural blockers (validate_docx) ──────────────────────────────────
  if (!structural.ok) {
    for (const m of structural.missingParts ?? []) {
      blockingItems.push({
        id: `structural-missing-${m}`,
        source: 'structural',
        severity: 'critical',
        label: `Missing required document part: ${m}`,
        deepLink: { kind: 'output_path', target: assembled.output.path, label: 'Open assembled module' },
      });
    }
    for (const mp of structural.malformedParts ?? []) {
      blockingItems.push({
        id: `structural-malformed-${mp.part}`,
        source: 'structural',
        severity: 'critical',
        label: `Malformed XML part ${mp.part}: ${mp.error}`,
        deepLink: { kind: 'output_path', target: assembled.output.path, label: 'Open assembled module' },
      });
    }
    for (const dr of structural.danglingRels ?? []) {
      blockingItems.push({
        id: `structural-dangling-${dr.rels}-${dr.target}`,
        source: 'structural',
        severity: 'high',
        label: `Relationship in ${dr.rels} points to a missing target: ${dr.target}`,
        deepLink: { kind: 'output_path', target: assembled.output.path, label: 'Open assembled module' },
      });
    }
    for (const e of structural.errors ?? []) {
      blockingItems.push({
        id: `structural-error-${e.slice(0, 40)}`,
        source: 'structural',
        severity: 'high',
        label: `Structural validation error: ${e}`,
        deepLink: { kind: 'output_path', target: assembled.output.path, label: 'Open assembled module' },
      });
    }
    // Defensive: validate_docx reported not-ok but enumerated no specifics.
    if (blockingItems.every(b => b.source !== 'structural')) {
      blockingItems.push({
        id: 'structural-invalid',
        source: 'structural',
        severity: 'critical',
        label: 'Assembled module failed structural validation.',
        deepLink: { kind: 'output_path', target: assembled.output.path, label: 'Open assembled module' },
      });
    }
  }

  // ── Consistency blockers (check_dossier_consistency) ─────────────────────
  // Any verdict other than "clean" blocks the gate. We surface the concrete
  // divergences (each with a CTD-section deep link) so the reviewer can resolve
  // or justify them before the PDUFA-clock submission step.
  if (consistency.verdict !== 'clean') {
    if (consistency.divergences.length === 0) {
      blockingItems.push({
        id: `consistency-${consistency.verdict}`,
        source: 'consistency',
        severity: consistency.verdict === 'blocker' ? 'critical' : 'high',
        label: `Cross-document consistency verdict: ${consistency.verdict.replace(/_/g, ' ')}.`,
      });
    } else {
      for (let i = 0; i < consistency.divergences.length; i++) {
        const d = consistency.divergences[i];
        const where = d.existingCtdSection ? ` (vs §${d.existingCtdSection})` : '';
        const values =
          d.draftValue && d.existingValue ? `: "${d.draftValue}" vs "${d.existingValue}"` : '';
        blockingItems.push({
          id: `consistency-${i}-${d.kind}`,
          source: 'consistency',
          severity: d.severity,
          label: `${d.description}${values}${where}`,
          deepLink: d.existingCtdSection
            ? {
                kind: 'ctd_section',
                target: d.existingCtdSection,
                label: `Go to §${d.existingCtdSection}`,
              }
            : undefined,
        });
      }
    }
  }

  blockingItems.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const structuralOk = structural.ok;
  const consistencyClean = consistency.verdict === 'clean';
  const ready = structuralOk && consistencyClean && blockingItems.length === 0;

  return {
    gate: ready ? 'ready' : 'blocked',
    structuralOk,
    consistencyVerdict: consistency.verdict,
    blockingItems,
    // The single honesty switch: sealable iff ready AND not sample (sample was
    // already short-circuited above, but we keep the guard explicit).
    sealable: ready && !assembled.sample,
    moduleNumber,
    summary: ready
      ? `Module ${moduleNumber} is ready: structurally valid and consistent with the dossier.`
      : `Module ${moduleNumber} is blocked: ${blockingItems.length} ${
          blockingItems.length === 1 ? 'item' : 'items'
        } must be resolved before submission.`,
  };
}
