/**
 * eTMF convergence E4 step 3 (2026-11-12; founder decision P-124 item 5): four of AnA's trial master file tools retire
 * with the second store they wrote, each onto what now answers it.
 *
 *   create_tmf                  a study's trial master file exists with the study (Protocol Development makes the study)
 *   seed_tmf                    a study's expected records are the reference model's; nothing is seeded
 *   update_tmf_artifact_status  a record changes by filing, removing, or declaring it not applicable, in the Vault's
 *                               trial master file; its state is its document's review stage, never a typed status
 *   review_tmf_completeness     completeness is part of get_tmf_view
 *
 * They wrote and read tmf_files and tmf_artifacts, which no deploy creates: on a deployed database each failed. This
 * pins the retirement as the earlier retirements do (assess-benefit-risk-retired-onto-the-balance.test.ts): no
 * definition, handler, authorization entry, launch-scope entry or stated-reason entry is left, and get_tmf_view, what
 * a person asks instead, is defined and registered. No tool is added.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, type Mock } from 'vitest';
import { mockPool } from '../../../../tests/setup';

(mockPool.connect as unknown as Mock).mockResolvedValue({
  query: () => Promise.resolve({ rows: [], rowCount: 0 }),
  release: () => undefined,
});
const { ALL_ANA_TOOLS } = await import('../AnaToolDefinitions.js');
const { getToolHandler } = await import('../AnaToolExecutor.js');
const { selectToolsForTurn } = await import('../tool-selection.js');

const RETIRED = ['create_tmf', 'seed_tmf', 'update_tmf_artifact_status', 'review_tmf_completeness'];
const names = ALL_ANA_TOOLS.map((t) => t.name);
const read = (rel: string): string => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('four trial master file tools retire with the store they wrote', () => {
  it.each(RETIRED)('%s is no longer defined, registered, authorised, in the launch scope or asked a stated reason', (tool) => {
    expect(names).not.toContain(tool);
    expect(getToolHandler(tool)).toBeUndefined();
    expect(Object.keys(JSON.parse(read('../tool-authorization.register.json')).tools)).not.toContain(tool);
    expect(read('../ana-launch-scope.inventory.json')).not.toMatch(new RegExp(`"${tool}"`));
    expect(read('../stated-reason-input.ts')).not.toMatch(new RegExp(`'${tool}'`));
    expect(read('../tool-authorization.ts')).not.toMatch(new RegExp(`\\b${tool}\\b`));
  });

  it('what a person asks instead is defined and registered: get_tmf_view, and the filing tool', () => {
    for (const tool of ['get_tmf_view', 'classify_tmf_artifact']) {
      expect(names).toContain(tool);
      expect(typeof getToolHandler(tool)).toBe('function');
    }
    const view = ALL_ANA_TOOLS.find((t) => t.name === 'get_tmf_view')!;
    expect(view.description).toMatch(/readiness/);
    expect(Object.keys((view.input_schema as { properties: Record<string, unknown> }).properties)).toEqual(['study_id', 'scope']);
  });

  it.each([
    'how complete is the trial master file for this study',
    'which TMF gaps would an inspector raise before the inspection',
    'review TMF completeness for the phase 2 study',
  ])('"%s" still offers get_tmf_view, and none of the retired tools', (prompt) => {
    const offered = selectToolsForTurn(ALL_ANA_TOOLS, prompt, { maxTools: 50 }).map((t) => t.name);
    expect(offered).toContain('get_tmf_view');
    for (const tool of RETIRED) expect(offered).not.toContain(tool);
  });

  /* 2026-11-12: the trial master file surface's catalog entry named `generate_inspection_package`, which no tool is.
     The surfaces catalog and the shell's search read it. Its tools are the two that stayed. */
  it('the trial master file surface names its AnA tools, each a defined tool', async () => {
    const { UI_SURFACES } = await import('../../../../shared/constants/ui-surface-registry.js');
    const etmf = UI_SURFACES.find((s) => s.id === 'etmf')!;
    expect(etmf.anaToolFamilies).toEqual(['get_tmf_view', 'classify_tmf_artifact']);
    for (const tool of etmf.anaToolFamilies) expect(names).toContain(tool);
  });
});
