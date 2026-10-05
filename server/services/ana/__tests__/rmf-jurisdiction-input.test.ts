/**
 * g-rmf-jurisdiction-input (2026-10-05): assess_device_evidence_structure, for
 * `document: 'rmf'`, takes an optional `jurisdiction` and returns that
 * jurisdiction's risk-acceptability policy beside the RMF structure or
 * assessment. The policy is the one in
 * server/services/market-specs/risk-management-structure.ts
 * (`riskAcceptabilityPolicy`), returned as is and never restated here.
 *
 * Before this step the input was not declared and was ignored, so AnA reviewing
 * an EU risk management file had no tool route to the EU AFAP rule.
 */

import { describe, it, expect, vi } from 'vitest';

const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';
import { ASSESS_DEVICE_EVIDENCE_STRUCTURE } from '../submission-center-tool-defs.js';
import { riskAcceptabilityPolicy, type RmfJurisdiction } from '../../market-specs/risk-management-structure.js';

const ctx = { humanConfirmed: true } as ToolContext;
const JURISDICTIONS: RmfJurisdiction[] = ['EU_MDR', 'EU_IVDR', 'FDA', 'OTHER'];

async function run(input: Record<string, unknown>) {
  const handler = getToolHandler('assess_device_evidence_structure');
  expect(handler).toBeTypeOf('function');
  return JSON.parse(await handler!(input, ctx));
}

describe('assess_device_evidence_structure: RMF jurisdiction input', () => {
  it('declares an optional jurisdiction input whose values are exactly the RMF jurisdictions', () => {
    const props = ASSESS_DEVICE_EVIDENCE_STRUCTURE.input_schema.properties as Record<string, { type?: string; enum?: string[]; description?: string }>;
    expect(props.jurisdiction).toBeDefined();
    expect(props.jurisdiction.type).toBe('string');
    expect([...(props.jurisdiction.enum ?? [])].sort()).toEqual([...JURISDICTIONS].sort());
    expect(props.jurisdiction.description).toMatch(/rmf/i);
    expect(ASSESS_DEVICE_EVIDENCE_STRUCTURE.input_schema.required).toEqual(['document']);
    expect(ASSESS_DEVICE_EVIDENCE_STRUCTURE.description).toMatch(/jurisdiction/);
  });

  it('returns the EU AFAP policy beside the RMF structure for an EU MDR file', async () => {
    const out = await run({ document: 'rmf', jurisdiction: 'EU_MDR' });
    expect(out.ok).toBe(true);
    expect(Array.isArray(out.sections)).toBe(true);
    expect(out.acceptabilityPolicy).toBeDefined();
    expect(out.acceptabilityPolicy.principle).toBe('AFAP');
    expect(out.acceptabilityPolicy.economicJustificationPermitted).toBe(false);
    expect(out.acceptabilityPolicy.basis.map((b: { ref: string }) => b.ref).join(' | ')).toMatch(/Annex I §2/);
  });

  it('returns the policy beside the assessment when sections are given (EU IVDR)', async () => {
    const out = await run({ document: 'rmf', present_section_ids: ['plan'], jurisdiction: 'EU_IVDR' });
    expect(out.ok).toBe(true);
    expect(out.assessment.missingRequiredSections).toContain('control');
    expect(out.acceptabilityPolicy.jurisdiction).toBe('EU_IVDR');
    expect(out.acceptabilityPolicy.principle).toBe('AFAP');
  });

  it.each(JURISDICTIONS)('returns riskAcceptabilityPolicy(%s) unchanged, with no restated copy', async (j) => {
    const out = await run({ document: 'rmf', jurisdiction: j });
    expect(out.acceptabilityPolicy).toEqual(JSON.parse(JSON.stringify(riskAcceptabilityPolicy(j))));
  });

  it('states the FDA policy as manufacturer-defined, not AFAP', async () => {
    const out = await run({ document: 'rmf', jurisdiction: 'FDA' });
    expect(out.acceptabilityPolicy.principle).toBe('manufacturer-defined');
  });

  it('returns no policy when no jurisdiction is given, rather than assuming one', async () => {
    const out = await run({ document: 'rmf' });
    expect(out.ok).toBe(true);
    expect(out.acceptabilityPolicy).toBeUndefined();
  });

  it('refuses an unknown jurisdiction instead of ignoring it', async () => {
    const out = await run({ document: 'rmf', jurisdiction: 'EU' });
    expect(out.ok).toBeUndefined();
    expect(out.error).toMatch(/jurisdiction must be one of: EU_MDR, EU_IVDR, FDA, OTHER/);
  });

  it('refuses a jurisdiction for a CER or PER, where no acceptability policy is modelled', async () => {
    for (const document of ['cer', 'per']) {
      const out = await run({ document, jurisdiction: 'EU_MDR' });
      expect(out.ok).toBeUndefined();
      expect(out.error).toMatch(/jurisdiction applies to document 'rmf' only/);
    }
  });
});
