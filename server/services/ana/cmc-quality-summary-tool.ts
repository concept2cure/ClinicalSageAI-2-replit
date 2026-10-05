/**
 * draft_quality_overall_summary_m2_3 — the Module 2.3 Quality Overall Summary
 * of the OPEN program, composed from that program's recorded CMC data.
 *
 * ── The defect this replaces (discovery map 2026-10-04,
 *    ana-qos-tool-model-supplied-cmc-data) ──────────────────────────────────────
 * The tool required the model to supply `cmcSources[]` — the specification,
 * stability and batch data — and composed the QOS from that JSON, then
 * labelled the result `engine: 'deterministic'`. Every figure in it was
 * model-authored, which CLAUDE.md Rule 2 forbids ("a tool that asks a model for
 * a figure is a defect"), and the label said the opposite.
 *
 * Now the tool takes NO CMC data. The program comes from the conversation
 * (resolveOpenProgram), never from input; the sources are the program's own
 * cmc_source_objects, composed by the same engine the Module 3 compile uses
 * (composeProjectModule3); the product names come from those records too. A
 * call that carries cmcSources is refused rather than silently ignored, so a
 * model that tries to supply figures is told why.
 *
 * @module server/services/ana/cmc-quality-summary-tool
 */

import type { ToolContext } from './AnaToolExecutor.js';
import type { RegisterFn } from './document-tools-shared.js';
import { resolveOpenProgram } from '../c2c/program-access';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('cmc-quality-summary-tool');

type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
type PoolSource = () => Promise<Pool>;

const appPool: PoolSource = async () => (await import('../../db')).getPool() as unknown as Pool;

export const MODEL_SUPPLIED_CMC_REFUSAL =
  'Refused: the Quality Overall Summary is composed from the open program’s recorded CMC data, never from data ' +
  'supplied in the call. Do not pass cmcSources; open the program and call the tool with no CMC data.';

/** The first recorded value of a field on sources of one type. */
function firstValue(sources: Array<{ sourceType: string; sourcePayload: unknown }>, type: string, keys: string[]): string | undefined {
  for (const s of sources) {
    if (s.sourceType !== type) continue;
    const p = (s.sourcePayload ?? {}) as Record<string, unknown>;
    for (const k of keys) {
      const v = p[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return undefined;
}

export async function draftQualityOverallSummary(
  poolOf: PoolSource,
  input: Record<string, unknown>,
  ctx?: ToolContext,
): Promise<string> {
  if (input && Object.prototype.hasOwnProperty.call(input, 'cmcSources')) {
    return JSON.stringify({ error: MODEL_SUPPLIED_CMC_REFUSAL });
  }
  if (!ctx?.organizationId) {
    return JSON.stringify({ error: 'No organization in context, so no program’s CMC data can be read.' });
  }
  try {
    const pool = await poolOf();
    const orgId = Number(ctx.organizationId);
    const programId = await resolveOpenProgram(pool, {
      organizationId: ctx.organizationId,
      projectId: ctx.projectId ?? null,
      projectRef: ctx.projectRef ?? null,
    });
    if (!programId) {
      return JSON.stringify({ needs_project: 'No program is open. Open the program whose Quality Overall Summary to draft.' });
    }
    const { composeProjectModule3 } = await import('../cmc/module3-compile.js');
    const { buildM23QualityOverallSummary } = await import('../m2-summary-builders.js');
    const { sources, sections } = await composeProjectModule3(pool as never, orgId, programId);
    if (sources.length === 0) {
      return JSON.stringify({
        no_cmc_data:
          'The open program has no recorded CMC data, so there is no Quality Overall Summary to compose. Record it ' +
          'in the CMC registers first; do not compose one from anything else.',
      });
    }
    const summary = buildM23QualityOverallSummary({
      module3Sections: sections,
      drugSubstanceName: firstValue(sources, 'drug_substance', ['name', 'substanceName', 'inn']),
      drugProductName: firstValue(sources, 'drug_product', ['productName', 'name', 'dosageFormDescription']),
    });
    return JSON.stringify({
      drafted: true,
      engine: 'deterministic',
      basis: `Composed from the ${sources.length} CMC source record(s) the open program holds, by the Module 3 compile engine.`,
      sectionKey: summary.sectionKey,
      title: summary.title,
      content: summary.narrative,
      tables: summary.tables,
      completeness: summary.completeness,
      gaps: summary.gaps,
      instruction:
        'This is a draft the author promotes through the governed authoring flow. State the completeness and the ' +
        'missing Module 3 sections (gaps) honestly, and do not add figures the record does not hold.',
    });
  } catch (err) {
    // The driver's message names tables; it goes to the log. The model is told the read failed.
    logger.error('draft_quality_overall_summary_m2_3 failed', { err: err instanceof Error ? err.message : String(err) });
    return JSON.stringify({ error: 'The program’s CMC data could not be read just now. Say so; do not compose a summary from anything else.' });
  }
}

/** Register the handler on the executor's registry (or a test's). */
export function registerCmcQualitySummaryHandler(register: RegisterFn, options: { pool?: PoolSource } = {}): void {
  const poolOf = options.pool ?? appPool;
  register('draft_quality_overall_summary_m2_3', async (input, ctx) => draftQualityOverallSummary(poolOf, input ?? {}, ctx));
}
