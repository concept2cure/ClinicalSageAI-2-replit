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

import { resolveVaultView, resolveOrgVaultView } from '../vault-filing.service';

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
