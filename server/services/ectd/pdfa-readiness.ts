/**
 * PDF/A submission-grade readiness gate (audit gap P0-2: "fail closed").
 *
 * The `pdfa-pipeline.finalizePdfA` step degrades gracefully to a no-op when
 * Ghostscript/veraPDF are absent — by design, so dev/staging keep flowing. The
 * audit's concern is the OTHER side of that: a real agency submission must not
 * silently ship vanilla (non-PDF/A) PDF leaves. This module is the provable
 * gate that turns "silent degradation" into a hard, opt-in blocker.
 *
 * PURE + DETERMINISTIC: no DB, no filesystem, no network, no LLM — the same
 * shape as `dispatch-gate.ts`. The packager collects the per-leaf finalization
 * outcome and calls this; enforcement is opt-in via `ECTD_REQUIRE_PDFA=true`
 * (set in deployments where the PDF/A binaries are guaranteed present), so the
 * default behaviour is unchanged.
 *
 * @module server/services/ectd/pdfa-readiness
 */

/** The finalization outcome for a single leaf written to the package. */
export interface LeafGradeRecord {
  /** Output filename inside the package (e.g. 'cover-letter.pdf'). */
  fileName: string;
  /** True when the leaf is a PDF (only PDFs are subject to PDF/A). */
  isPdf: boolean;
  /** True when the bytes were actually converted to PDF/A by the pipeline. */
  converted: boolean;
  /**
   * True when the leaf carries an /Encrypt dictionary. The eCTD PDF spec
   * prohibits secured PDFs outright, independent of PDF/A; the packager
   * refuses to ship one rather than folding it into the PDF/A grade.
   */
  encrypted?: boolean;
}

/** Roll-up of submission-grade status across every leaf in a package. */
export interface SubmissionGradeSummary {
  /** Total leaves considered. */
  total: number;
  /** PDF leaves in the package. */
  pdfLeaves: number;
  /** PDF leaves actually converted to PDF/A. */
  pdfaConverted: number;
  /** PDF leaves that were NOT converted to PDF/A (the risk set). */
  notConverted: string[];
  /**
   * True when every PDF leaf is PDF/A-converted. False means at least one PDF
   * shipped as vanilla PDF (the pipeline degraded — typically a missing binary).
   */
  allPdfA: boolean;
}

export interface SubmissionGradeGateInput {
  leaves: LeafGradeRecord[];
  /** 'production' = real agency submission; 'staging' = dry-run/pre-prod. */
  environment: 'staging' | 'production';
  /**
   * Whether PDF/A is required for this package. Wire from `ECTD_REQUIRE_PDFA`.
   * When false the gate never blocks (it only reports), preserving the
   * graceful-degradation default.
   */
  requirePdfA: boolean;
}

export interface SubmissionGradeGateResult {
  summary: SubmissionGradeSummary;
  /** True only when no hard blocker is present. */
  cleared: boolean;
  blockers: string[];
}

/** Summarize the per-leaf finalization outcome. Pure, no policy. */
export function summarizeSubmissionGrade(leaves: LeafGradeRecord[]): SubmissionGradeSummary {
  const pdf = leaves.filter((l) => l.isPdf);
  const notConverted = pdf.filter((l) => !l.converted).map((l) => l.fileName).sort();
  return {
    total: leaves.length,
    pdfLeaves: pdf.length,
    pdfaConverted: pdf.length - notConverted.length,
    notConverted,
    allPdfA: notConverted.length === 0,
  };
}

/**
 * Evaluate the submission-grade gate. It blocks only when PDF/A is required AND
 * the submission is for production AND at least one PDF leaf was not converted —
 * the precise "do not silently ship a vanilla-PDF agency submission" rule.
 * Staging and `requirePdfA:false` never block (they report for visibility).
 */
export function evaluateSubmissionGrade(input: SubmissionGradeGateInput): SubmissionGradeGateResult {
  const summary = summarizeSubmissionGrade(input.leaves);
  const blockers: string[] = [];

  if (input.requirePdfA && input.environment === 'production' && !summary.allPdfA) {
    blockers.push(
      `${summary.notConverted.length} PDF leaf/leaves were not converted to PDF/A-1b ` +
        `(${summary.notConverted.join(', ')}). A production eCTD submission requires PDF/A. ` +
        'Ensure Ghostscript/veraPDF are present in the deployment image, or clear ECTD_REQUIRE_PDFA only for non-submission builds.'
    );
  }

  return { summary, cleared: blockers.length === 0, blockers };
}

/** Read the opt-in enforcement flag from the environment. */
export function pdfaRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ECTD_REQUIRE_PDFA ?? '').toLowerCase() === 'true';
}

export default { summarizeSubmissionGrade, evaluateSubmissionGrade, pdfaRequiredFromEnv };
