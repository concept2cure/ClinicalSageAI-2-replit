import { describe, expect, it, vi } from 'vitest';
// This focused boundary supplies a known owned program to the registry's
// existing tenant guard; its SQL/isolation is qualified in the scope suites.
vi.mock('../../c2c/program-access', async original => ({
  ...await original<typeof import('../../c2c/program-access')>(),
  programInOrganization: async (_pool: unknown, programId: string, organizationId: number) =>
    organizationId === 1 && programId === '9a7f0b10-0000-4000-8000-0000000000aa',
}));
import { getToolHandler } from '../AnaToolExecutor';
import { ASSESS_ANALYTICAL_SIMILARITY, ASSESS_COMPARABILITY, ASSESS_IMMUNOGENICITY, ASSESS_BLA_FILING_RISK } from '../bla-biologics-tool-defs';
const tools = [ASSESS_ANALYTICAL_SIMILARITY, ASSESS_COMPARABILITY, ASSESS_IMMUNOGENICITY, ASSESS_BLA_FILING_RISK];
describe('deterministic BLA computation versus governed persisted assessment', () => {
  for (const tool of tools) {
    for (const key of ['programId', 'program_id', 'persist', 'save']) {
      it(`${tool.name} refuses an explicit ${key} persistence request instead of silently ignoring it`, async () => {
        const result = JSON.parse(await getToolHandler(tool.name)!({ [key]: key.startsWith('program') ? '9a7f0b10-0000-4000-8000-0000000000aa' : true }, { organizationId: 1, userId: 1 }));
        expect(result).toMatchObject({ error: 'BLA_PERSIST_REQUIRES_GOVERNED_UI', persisted: false });
        expect(result.status).not.toBe('computed');
      });
    }
  }
  it('a pure filing-risk calculation explicitly reports that it is unsaved', async () => {
    const result = JSON.parse(await getToolHandler('assess_bla_filing_risk')!({}, {}));
    expect(result).toMatchObject({ status: 'computed', engine: 'deterministic', persisted: false });
    expect(result.instruction).toContain('unsaved');
  });
  it('the advertised input schemas do not promise an ignored optional save', () => {
    for (const tool of tools) {
      expect(tool.input_schema.properties).not.toHaveProperty('programId');
      expect(tool.description).toContain('does not save or sign');
    }
  });
});
