/**
 * E14 — assemble_crl_premortem_artifact tool wiring tests.
 *
 * Verifies registration, input validation, and the export-guard wiring without
 * a DB: with no submission_type the precedent corpus is empty, so the artifact
 * degrades to `not_assessed` and an export request is refused with a reason
 * (the honesty/exportability guard), proving the handler enforces it end-to-end.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('assemble_crl_premortem_artifact — registration + schema', () => {
  it('registers a handler', () => {
    const handler = getToolHandler('assemble_crl_premortem_artifact');
    expect(typeof handler).toBe('function');
  });

  it('is exported in the tool definitions with an export flag', () => {
    const def = ALL_ANA_TOOLS.find(t => t.name === 'assemble_crl_premortem_artifact');
    expect(def).toBeDefined();
    expect(def!.input_schema.properties).toHaveProperty('export');
    expect(def!.input_schema.required).toContain('text');
  });
});

describe('assemble_crl_premortem_artifact — validation + export guard', () => {
  it('rejects missing text', async () => {
    const handler = getToolHandler('assemble_crl_premortem_artifact')!;
    const out = JSON.parse(await handler({}, {}));
    expect(out.error).toMatch(/text/);
  });

  it('assembles an unsealed artifact and refuses export when not_assessed', async () => {
    const handler = getToolHandler('assemble_crl_premortem_artifact')!;
    // No submission_type → no precedent calibration → not_assessed.
    const out = JSON.parse(
      await handler({ text: 'The device is highly effective and completely safe.', export: true }, {}),
    );
    expect(out.error).toBeUndefined();
    expect(out.artifact).toBeDefined();
    expect(out.artifact.sealStatus).toBe('unsealed');
    expect(out.artifact.status).toBe('not_assessed');
    expect(out.artifact.exportable).toBe(false);
    // Probability framed as estimate, never a guarantee.
    expect(out.artifact.approvalProbability.framing).toMatch(/NOT ESTIMATED|ESTIMATE/);
    // Export refused with a reason.
    expect(out.export.exported).toBe(false);
    expect(out.export.reason).toMatch(/not exportable/i);
  });
});
