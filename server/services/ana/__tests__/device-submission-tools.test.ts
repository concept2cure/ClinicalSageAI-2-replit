/**
 * Device/IVD submission + coding tools — registration + offline behavior.
 *
 * assemble_device_submission and score_predicate_adequacy are deterministic and
 * network-free, so their compute paths are exercised here. code_drug calls the
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
    const bad = JSON.parse(await getToolHandler('assemble_device_submission')!({ pathway: 'pma', variant: 'device', leaves: [] }));
    expect(bad.status).toBe('needs_parameters');
    const bad2 = JSON.parse(await getToolHandler('assemble_device_submission')!({ pathway: '510k', variant: 'nope', leaves: [] }));
    expect(bad2.status).toBe('needs_parameters');
  });

  it('requires leaves[]', async () => {
    const out = JSON.parse(await getToolHandler('assemble_device_submission')!({ pathway: '510k', variant: 'device' }));
    expect(out.status).toBe('needs_parameters');
  });

  it('computes an honest assembly state with blockers and artifactKind', async () => {
    const out = JSON.parse(
      await getToolHandler('assemble_device_submission')!({
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
