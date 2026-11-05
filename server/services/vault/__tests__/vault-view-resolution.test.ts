/**
 * resolveVaultView degrades to the service view only when the programs table
 * does not exist (VR-04, row D4).
 *
 * It caught every error. A transient database failure on the ingest path
 * therefore filed a pharma program's document against the TMF (service)
 * folders, silently, with a rationale that read like a finding.
 */
import { describe, it, expect, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { resolveVaultView, resolveOrgVaultView, resolveVaultFilingContext } from '../vault-filing.service';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });


describe('resolveVaultView', () => {
  it("reads the program's product type", async () => {
    query.mockImplementation(async () => ({ rows: [{ product_type: 'drug' }] }));
    expect(await resolveVaultView(PROGRAM, 7)).toBe('pharma');
  });

  it('degrades to the service view when the table is missing (42P01), as before', async () => {
    query.mockImplementation(async () => {
      throw pgError('42P01', 'relation "regulatory_programs" does not exist');
    });
    expect(await resolveVaultView(PROGRAM, 7)).toBe('service');
    expect(await resolveOrgVaultView(7)).toBe('service');
  });

  it('lets any other failure through instead of filing against the wrong taxonomy', async () => {
    query.mockImplementation(async () => {
      throw pgError('57P01', 'terminating connection due to administrator command');
    });
    await expect(resolveVaultView(PROGRAM, 7)).rejects.toThrow(/terminating connection/);
    await expect(resolveOrgVaultView(7)).rejects.toThrow(/terminating connection/);
  });
});

/* S6 (2026-11-05): the project's settings select its Module 1. The same read that gives the view gives the
   region (primary_agency, through canonicalRegionOf) and the application kind (program_type). */
describe('resolveVaultFilingContext', () => {
  it("reads the program's agency and program type in the view's own query", async () => {
    query.mockReset();
    query.mockImplementation(async () => ({ rows: [{ product_type: 'drug', primary_agency: 'EMA', program_type: 'MAA' }] }));
    expect(await resolveVaultFilingContext(PROGRAM, 7)).toEqual({ view: 'pharma', jurisdiction: 'EU', applicationKind: 'maa' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0][0])).toMatch(/SELECT product_type, primary_agency, program_type FROM regulatory_programs/);
    expect(await resolveVaultView(PROGRAM, 7)).toBe('pharma');
  });

  it("resolves the wizard's agency values, and an agency that names no region as null", async () => {
    for (const [agency, jurisdiction] of [['FDA', 'US'], ['PMDA', 'JP'], ['HEALTH_CANADA', 'CA'], ['TGA', 'AU'], ['ICH', null], [null, null]] as const) {
      query.mockImplementation(async () => ({ rows: [{ product_type: 'drug', primary_agency: agency, program_type: 'nda' }] }));
      expect((await resolveVaultFilingContext(PROGRAM, 7)).jurisdiction, String(agency)).toBe(jurisdiction);
    }
  });

  it('a missing programs table degrades to the service view with no region', async () => {
    query.mockImplementation(async () => {
      throw pgError('42P01', 'relation "regulatory_programs" does not exist');
    });
    expect(await resolveVaultFilingContext(PROGRAM, 7)).toEqual({ view: 'service', jurisdiction: null, applicationKind: null });
  });
});
