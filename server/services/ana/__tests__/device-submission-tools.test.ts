/**
 * Device/IVD submission + coding tools — registration + offline behavior.
 *
 * assemble_device_submission and score_predicate_adequacy are deterministic and
 * network-free, so their compute paths are exercised here (assemble's
 * hypothetical mode; its open-project mode reads the database and is covered in
 * assemble-device-submission.project-scope.test.ts). code_drug calls the
 * NLM RxNav API, so only its offline guards (registration + input validation)
 * are asserted — the network path is not exercised in unit tests.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);

describe('device-submission tools — registration', () => {
  it.each(['assemble_device_submission', 'score_predicate_adequacy', 'code_drug'])(
    '%s is defined and has a handler',
    (name) => {
      expect(names).toContain(name);
      expect(typeof getToolHandler(name)).toBe('function');
    },
  );
});

describe('assemble_device_submission', () => {
  it('validates pathway and variant', async () => {
    const bad = JSON.parse(await getToolHandler('assemble_device_submission')!({ pathway: 'mdr', variant: 'device', leaves: [] }));
    expect(bad.status).toBe('needs_parameters');
    const bad2 = JSON.parse(await getToolHandler('assemble_device_submission')!({ pathway: '510k', variant: 'nope', leaves: [] }));
    expect(bad2.status).toBe('needs_parameters');
  });

  // PMA_ASSEMBLY: the tool used to reject pathway 'pma' as a validation error,
  // so AnA could never state a PMA's assembly verdict. It now dispatches to the
  // PMA mapper (21 CFR 814 modules) through the same deterministic engine.
  // Model-typed leaves are accepted only as a hypothetical outline, and their
  // `substantive: true` is ignored: the model cannot declare a section finished
  // (g-assemble-device-project-scope; the open-project path is covered in
  // assemble-device-submission.project-scope.test.ts).
  it("maps a hypothetical PMA outline onto the PMA modules (pathway 'pma'), ignoring the model's substantive claim", async () => {
    const out = JSON.parse(
      await getToolHandler('assemble_device_submission')!({
        mode: 'hypothetical',
        pathway: 'pma',
        pmaSubmissionType: '30_day_notice',
        variant: 'device',
        leaves: [
          { sectionCode: 'A', title: 'A · Administrative information (21 CFR 814.20(b)(1)–(2))', substantive: true },
          { sectionCode: 'D', title: 'D · Manufacturing, processing, packing, storage and installation (814.20(b)(4)(v))', substantive: true },
        ],
        presentTemplates: [],
        environment: 'staging',
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.mode).toBe('hypothetical');
    expect(out.result.pathway).toBe('pma');
    expect(out.result.artifactKind).toBe('content-package-draft');
    expect(out.result.estar.submissionType).toBe('30_day_notice');
    // substantive:true from the model is ignored — the modules stay missing.
    expect(out.result.estar.summary.ready).toBe(false);
    expect(out.result.canProduceOfficialEstar).toBe(false);
    expect(out.result.provenance.modules).toContain('pathway-engines/pma/pma-mapper');
  });

  it("requires leaves[] in mode 'hypothetical'", async () => {
    const out = JSON.parse(await getToolHandler('assemble_device_submission')!({ mode: 'hypothetical', pathway: '510k', variant: 'device' }));
    expect(out.status).toBe('needs_parameters');
  });

  it('with no project open and no hypothetical mode, asks for a project', async () => {
    const out = JSON.parse(
      await getToolHandler('assemble_device_submission')!({
        pathway: '510k',
        variant: 'device',
        leaves: [{ sectionCode: 'DEVICE_DESCRIPTION', title: 'Device Description' }],
      }),
    );
    expect(out.status).toBe('needs_project');
    expect(out.result).toBeUndefined();
  });

  it('computes an honest hypothetical assembly state with blockers and artifactKind', async () => {
    const out = JSON.parse(
      await getToolHandler('assemble_device_submission')!({
        mode: 'hypothetical',
        pathway: '510k',
        variant: 'device',
        leaves: [{ sectionCode: 'DEVICE_DESCRIPTION', title: 'Device Description' }],
        presentTemplates: [],
        environment: 'staging',
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.engine).toBe('deterministic');
    expect(out.result).toHaveProperty('artifactKind');
    expect(out.result).toHaveProperty('canProduceOfficialEstar');
    expect(Array.isArray(out.result.blockers)).toBe(true);
  });
});

describe('score_predicate_adequacy', () => {
  it('requires non-empty candidates[]', async () => {
    const out = JSON.parse(await getToolHandler('score_predicate_adequacy')!({ candidates: [] }));
    expect(out.status).toBe('needs_parameters');
  });

  it('ranks candidates and recommends the strongest', async () => {
    const out = JSON.parse(
      await getToolHandler('score_predicate_adequacy')!({
        currentYear: 2026,
        candidates: [
          { identifier: 'K-weak', sameProductCode: false, intendedUseAlignment: 'different' },
          { identifier: 'K-strong', sameProductCode: true, intendedUseAlignment: 'same', technologyAlignment: 'same', decision: 'SE', clearanceYear: 2024, samePanel: true, adverseStatus: false },
        ],
      }),
    );
    expect(out.status).toBe('computed');
    expect(out.result.recommended).toBe('K-strong');
    expect(out.result.ranked[0].identifier).toBe('K-strong');
    expect(out.result.disclaimer).toMatch(/screening aid/i);
  });
});

describe('code_drug', () => {
  it('requires a name (offline guard)', async () => {
    const out = JSON.parse(await getToolHandler('code_drug')!({}));
    expect(out.status).toBe('needs_parameters');
  });
});
