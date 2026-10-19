/**
 * What a signed fulfilment binds (rows D2 and D5, 2026-10-19; decision P-40).
 *
 * Recording a PMR, PMC or REMS as fulfilled is signed on the target
 * `regulatory-commitment:<id>`. Without a content binder that signature would
 * bind only the ledger's chain hash, so nothing would tie it to the commitment's
 * words, its date, or the sequence and Vault version named as what met it. The
 * binder digests exactly those, through the one reader the list read uses too
 * (readCommitmentFulfilmentContent), so "does the signature still match the
 * record" is computed from the same SQL statement on both paths.
 */
import { describe, expect, it } from 'vitest';
import { BINDING_BASIS } from '../signature-persistence';
import { CONTENT_BINDERS } from '../governed-target-binders';
import { commitmentFulfilmentDigest } from '../../ha-interactions/ha-logic';

const ROW = {
  id: 12,
  commitment_type: 'pmr',
  description: 'Pediatric study under PREA',
  regulatory_basis: null,
  due_date: '2028-03-31',
  fulfilled_date: '2026-10-01',
  status: 'fulfilled',
  recorded: true,
  fulfilment_sequence_id: 5,
  sequence_number: '0042',
  sequence_submission_id: 3,
  fulfilment_vault_document_id: '11111111-1111-4111-8111-111111111111',
  fulfilment_vault_sha256: 'c'.repeat(64),
};

function clientReturning(rows: unknown[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    client: { query: async (sql: string, params: unknown[] = []) => { calls.push({ sql, params }); return { rows }; } } as never,
  };
}
const noFallback = () => { throw new Error('should not fall back'); };

describe('the regulatory-commitment binder', () => {
  it('is registered, so a fulfilment signature never falls back to the ledger basis', () => {
    expect(CONTENT_BINDERS['regulatory-commitment']).toBeTypeOf('function');
  });

  it('digests the commitment, its date and what met it, with the shared recipe', async () => {
    const { client, calls } = clientReturning([ROW]);
    const binding = await CONTENT_BINDERS['regulatory-commitment'](client, '12', 7, noFallback);
    expect(binding.basis).toBe(BINDING_BASIS.COMMITMENT_FULFILMENT_CONTENT);
    expect(binding.basis).toBe('commitment-fulfilment-content-sha256');
    expect(binding.digest).toBe(commitmentFulfilmentDigest({
      commitmentId: 12, commitmentType: 'pmr', description: 'Pediatric study under PREA', regulatoryBasis: null,
      dueDate: '2028-03-31', fulfilledDate: '2026-10-01', sequenceId: 5, sequenceNumber: '0042', submissionId: 3,
      vaultDocumentId: ROW.fulfilment_vault_document_id, vaultSha256: ROW.fulfilment_vault_sha256,
    }));
    expect(binding.note).toMatch(/commitment-fulfilment\/v1/);
    // Organisation-scoped, and the dates read as their own text (no local-midnight Date).
    expect(calls[0].params).toEqual([7, [12]]);
    expect(calls[0].sql).toMatch(/to_char\(rc\.due_date/);
  });

  it('binds the Vault version’s sha256: a different pin is a different digest', async () => {
    const a = await CONTENT_BINDERS['regulatory-commitment'](clientReturning([ROW]).client, '12', 7, noFallback);
    const b = await CONTENT_BINDERS['regulatory-commitment'](clientReturning([{ ...ROW, fulfilment_vault_sha256: 'd'.repeat(64) }]).client, '12', 7, noFallback);
    expect(a.digest).not.toBe(b.digest);
  });

  it('falls back when the commitment is not readable, or carries no recorded fulfilment', async () => {
    for (const rows of [[], [{ ...ROW, recorded: false }], [{ ...ROW, status: 'open' }]]) {
      let why = '';
      await CONTENT_BINDERS['regulatory-commitment'](clientReturning(rows).client, '12', 7, (reason: string) => {
        why = reason;
        return { digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER, note: 'fallback' };
      });
      expect(why, JSON.stringify(rows)).toMatch(/not readable|no recorded fulfilment/);
    }
  });

  it('refuses a malformed pointer rather than querying for it', async () => {
    const client = { query: async () => { throw new Error('should not query'); } } as never;
    let why = '';
    await CONTENT_BINDERS['regulatory-commitment'](client, '12; drop', 7, (reason: string) => {
      why = reason;
      return { digest: null, basis: BINDING_BASIS.GOVERNED_ACTION_LEDGER, note: 'fallback' };
    });
    expect(why).toMatch(/malformed/);
  });
});
