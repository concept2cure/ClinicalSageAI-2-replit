/**
 * E6 orchestrator — drives the EXISTING server tools to produce, then PROVE, a
 * 510(k) Substantial Equivalence document from an analyzed SE matrix.
 *
 * Flow (no new authoring/verification logic — pure reuse):
 *   1. buildSEDocumentPlan(matrix) → title + body (narrative + comparison
 *      table) + required_strings + honesty verdict.   [se-discussion-builder]
 *   2. author_docx_native(title, content)             [existing server tool]
 *   3. verify_docx_against_source(docxPath, required_strings)  [existing tool]
 *      → VerificationPanel proves every predicate fact + equivalence verdict
 *        was reproduced verbatim, and no verdict was altered or invented.
 *
 * Honesty contract: a non-analyzed (sample / not_assessed) matrix is generated
 * for PREVIEW only — it is never sealed or exported, and the result is flagged
 * `sealable: false`. The flag gate (ENABLE_ANA_DOCUMENT_STUDIO) means the whole
 * affordance is dark by default.
 */

import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import {
  buildSEDocumentPlan,
  type SEDiscussionInput,
  type SEDocumentPlan,
} from './se-discussion-builder';

/** Server-side gate. Mirrors the client ENABLE_ANA_DOCUMENT_STUDIO flag. */
export function isSeDiscussionAuthoringEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ENABLE_ANA_DOCUMENT_STUDIO === 'true' || env.ENABLE_ANA_DOCUMENT_STUDIO === '1';
}

export interface AuthorSEDiscussionResult {
  /** False when the flag is off or the matrix is unusable — nothing was built. */
  generated: boolean;
  /** The plan that drove generation (title, body, required_strings, honesty). */
  plan: SEDocumentPlan | null;
  /** Path to the authored .docx, when generation succeeded. */
  docxPath: string | null;
  /** Raw verify_docx_against_source result JSON, when verification ran. */
  verification: unknown | null;
  /**
   * Whether this document may be sealed/exported. Mirrors plan.honesty.sealable
   * — a sample/not_assessed matrix is preview-only and stays false even when
   * generation + verification both pass.
   */
  sealable: boolean;
  /** Why nothing was generated / why it is not sealable. */
  notes: string[];
}

/**
 * Generate + verify the SE discussion document. Returns a structured result the
 * Document Studio surface renders (the authored draft + the VerificationPanel).
 *
 * Reuses the registered author_docx_native and verify_docx_against_source
 * handlers verbatim — this orchestrator adds NO authoring or verification logic
 * of its own, only the matrix→document derivation and the honesty gate.
 */
export async function authorSEDiscussion(
  input: SEDiscussionInput,
  ctx: ToolContext,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<AuthorSEDiscussionResult> {
  const notes: string[] = [];

  if (!isSeDiscussionAuthoringEnabled(opts.env)) {
    return {
      generated: false,
      plan: null,
      docxPath: null,
      verification: null,
      sealable: false,
      notes: ['ENABLE_ANA_DOCUMENT_STUDIO is off — SE discussion authoring is gated.'],
    };
  }

  const plan = buildSEDocumentPlan(input);

  if ((input.matrix?.comparison_rows ?? []).length === 0) {
    return {
      generated: false,
      plan,
      docxPath: null,
      verification: null,
      sealable: false,
      notes: ['Matrix has no comparison rows — nothing to author.'],
    };
  }

  // ── Step 2: author the .docx via the existing tool ──
  const authorHandler = getToolHandler('author_docx_native');
  if (!authorHandler) {
    return { generated: false, plan, docxPath: null, verification: null, sealable: false, notes: ['author_docx_native handler unavailable.'] };
  }
  const authorRaw = await authorHandler(
    { title: plan.title, content: plan.content, output_format: 'docx' },
    ctx,
  );
  const authorResult = safeParse(authorRaw);
  const docxPath = pickDocxPath(authorResult);
  if (!docxPath) {
    return {
      generated: false,
      plan,
      docxPath: null,
      verification: authorResult,
      sealable: false,
      notes: ['author_docx_native did not return a docx path.', ...(authorResult?.error ? [String(authorResult.error)] : [])],
    };
  }

  // ── Step 3: verify the .docx reproduced every matrix fact + verdict ──
  const verifyHandler = getToolHandler('verify_docx_against_source');
  let verification: unknown = null;
  if (verifyHandler) {
    const verifyRaw = await verifyHandler(
      { input_docx_path: docxPath, required_strings: plan.requiredStrings },
      ctx,
    );
    verification = safeParse(verifyRaw);
  } else {
    notes.push('verify_docx_against_source handler unavailable — document not verified.');
  }

  if (!plan.honesty.sealable) {
    notes.push(...plan.honesty.blockingReasons);
  }

  // BUILD-1 INTEGRATION: once Build 1 (version persistence) lands, persist this
  // generated SE document as a version row here — { docxPath, plan.title,
  // plan.requiredStrings, verification, provenance } keyed to the program — so
  // the Document Studio version picker and the Part 11 audit trail can cite it.
  // Until then, the result is returned to the caller without a persisted row.
  // Only sealable (analyzed) documents should ever be persisted as exportable
  // versions; sample/not_assessed documents stay preview-only.

  return {
    generated: true,
    plan,
    docxPath,
    verification,
    sealable: plan.honesty.sealable,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeParse(raw: unknown): any {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

/**
 * author_docx_native returns the produced path under one of a few keys across
 * versions (docxPath / outputPath / path). Pick the first present string.
 */
function pickDocxPath(result: any): string | null {
  if (!result || typeof result !== 'object') return null;
  for (const key of ['docxPath', 'outputPath', 'path', 'docx_path']) {
    const v = result[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}
