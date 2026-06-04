import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../../../server/services/ana/AnaToolDefinitions';

// Definitions-only test (no executor side effects): proves the three BLA
// biologics tools are registered in the model's master tool list with the
// required input-schema fields, so AnA can call them in a BLA context.
describe('biologics AnA tool definitions', () => {
  const names = ['assess_analytical_similarity', 'assess_comparability', 'assess_immunogenicity', 'assess_bla_filing_risk'];

  it('are present in ALL_ANA_TOOLS', () => {
    const toolNames = ALL_ANA_TOOLS.map((t) => t.name);
    for (const n of names) expect(toolNames).toContain(n);
  });

  it('declare a JSON-schema object with a required[] array', () => {
    for (const n of names) {
      const tool = ALL_ANA_TOOLS.find((t) => t.name === n)!;
      expect(tool.input_schema.type).toBe('object');
      expect(Array.isArray(tool.input_schema.required)).toBe(true);
    }
  });

  it('the three data-driven tools require their core input', () => {
    // filing_risk runs on any subset of signals, so it has no required field.
    for (const n of ['assess_analytical_similarity', 'assess_comparability', 'assess_immunogenicity']) {
      const tool = ALL_ANA_TOOLS.find((t) => t.name === n)!;
      expect(tool.input_schema.required!.length).toBeGreaterThan(0);
    }
  });

  it('similarity/comparability take attributes[], immunogenicity takes arms[]', () => {
    const sim = ALL_ANA_TOOLS.find((t) => t.name === 'assess_analytical_similarity')!;
    const comp = ALL_ANA_TOOLS.find((t) => t.name === 'assess_comparability')!;
    const imm = ALL_ANA_TOOLS.find((t) => t.name === 'assess_immunogenicity')!;
    expect((sim.input_schema.properties as any).attributes).toBeDefined();
    expect((comp.input_schema.properties as any).attributes).toBeDefined();
    expect((imm.input_schema.properties as any).arms).toBeDefined();
  });
});
