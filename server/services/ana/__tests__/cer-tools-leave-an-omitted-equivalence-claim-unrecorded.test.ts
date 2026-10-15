/**
 * AnA's CER tools leave an omitted equivalence claim unrecorded (2026-10-15).
 *
 * assess_device_evidence_structure (document 'cer') and assess_stored_cer passed
 * `equivalenceClaimed: input.equivalence_claimed === true`, so an omitted claim
 * reached assessCerStructure as "not claimed": a CER with every other required
 * section and no Equivalence section came back ready, equivalenceAddressed true.
 * build_device_blueprint stopped doing this in 142a52bb4; these two did not.
 * A boolean is relayed; anything else is unstated, and the engine names it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stored = vi.hoisted(() => ({ assessStoredCer: vi.fn() }));
vi.mock('../../market-specs/stored-cer-assessment.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assessStoredCer: (...a: unknown[]) => stored.assessStoredCer(...a),
}));

// Importing the executor registers every handler as an import side effect.
import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { CER_SECTIONS } from '../../market-specs/cer-structure';

const ALWAYS_REQUIRED_CER = CER_SECTIONS.filter((s) => s.required && !s.equivalenceOnly).map((s) => s.id);

async function run(tool: string, input: Record<string, unknown>, ctx: Partial<ToolContext> = {}): Promise<Record<string, unknown>> {
  const handler = getToolHandler(tool);
  expect(handler, `${tool} has a handler`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, { humanConfirmed: true, ...ctx } as ToolContext)) as Record<string, unknown>;
}

describe('assess_device_evidence_structure, document cer', () => {
  it('does not read an omitted equivalence_claimed as "not claimed"', async () => {
    const out = await run('assess_device_evidence_structure', { document: 'cer', present_section_ids: ALWAYS_REQUIRED_CER });
    const assessment = out.assessment as Record<string, unknown>;
    expect(assessment.equivalenceAddressed, 'an omitted claim was read as "not claimed"').toBeNull();
    expect(assessment.ready).toBe(false);
    expect((assessment.missingFacts as string[]).join(' ')).toMatch(/^equivalenceClaimed/);
  });

  it('relays a stated answer, and leaves a non-boolean unstated', async () => {
    const stated = await run('assess_device_evidence_structure', { document: 'cer', present_section_ids: ALWAYS_REQUIRED_CER, equivalence_claimed: false });
    expect(stated.assessment).toMatchObject({ ready: true, equivalenceAddressed: true });
    const unreadable = await run('assess_device_evidence_structure', { document: 'cer', present_section_ids: ALWAYS_REQUIRED_CER, equivalence_claimed: 'no' });
    expect(unreadable.assessment).toMatchObject({ ready: false, equivalenceAddressed: null });
  });
});

describe('assess_stored_cer', () => {
  beforeEach(() => {
    stored.assessStoredCer.mockReset();
    stored.assessStoredCer.mockResolvedValue({ reportId: 'CER-1' });
  });

  it('passes an omitted equivalence_claimed on as unstated, not false', async () => {
    const out = await run('assess_stored_cer', { report_id: 'CER-1' }, { organizationId: 7 });
    expect(out.ok).toBe(true);
    const params = stored.assessStoredCer.mock.calls[0][0] as { equivalenceClaimed?: boolean };
    expect(params.equivalenceClaimed, 'an omitted claim was passed as "not claimed"').toBeUndefined();
  });

  it('relays a stated answer', async () => {
    for (const claimed of [true, false]) {
      stored.assessStoredCer.mockClear();
      await run('assess_stored_cer', { report_id: 'CER-1', equivalence_claimed: claimed }, { organizationId: 7 });
      expect(stored.assessStoredCer.mock.calls[0][0]).toMatchObject({ reportId: 'CER-1', organizationId: 7, equivalenceClaimed: claimed });
    }
  });
});
