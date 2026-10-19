/**
 * What a commitment's fulfilment must carry, and the digest its signature binds
 * (rows D2 and D5, 2026-10-19; decision P-40). Pure, no DB, no model.
 *
 * Recording a PMR, PMC or REMS as fulfilled is a Part 11 signed act that names
 * the dispatched sequence the agency received or the Vault version that met it.
 * A meeting commitment or other is a governed write with a reason; what met it
 * may be named, and need not be. The digest is the one recipe the signature
 * binder and the list read both use, so "does the signature match the record"
 * cannot be answered two ways.
 */
import { describe, expect, it } from 'vitest';
import {
  COMMITMENT_FULFILMENT_DIGEST_RECIPE,
  SIGNED_FULFILMENT_TYPES,
  commitmentFulfilmentDigest,
  fulfilmentEvidenceRefusal,
  fulfilmentRecordState,
  fulfilmentRule,
  type CommitmentFulfilmentContent,
} from '../ha-logic';

const CONTENT: CommitmentFulfilmentContent = {
  commitmentId: 12,
  commitmentType: 'pmr',
  description: 'Pediatric study under PREA',
  regulatoryBasis: '21 CFR 314.55',
  dueDate: '2028-03-31',
  fulfilledDate: '2026-10-01',
  sequenceId: 5,
  sequenceNumber: '0042',
  submissionId: 3,
  vaultDocumentId: '11111111-1111-4111-8111-111111111111',
  vaultSha256: 'a'.repeat(64),
};

describe('which fulfilments are signed acts', () => {
  it('a PMR, PMC or REMS needs a signature, what met it, and its date', () => {
    for (const t of ['pmr', 'pmc', 'rems']) {
      expect(fulfilmentRule(t), t).toEqual({ signatureRequired: true, evidenceRequired: true, dateRequired: true });
    }
  });

  it('a meeting commitment or other is a governed write: no signature, what met it optional', () => {
    for (const t of ['meeting_commitment', 'other']) {
      expect(fulfilmentRule(t), t).toEqual({ signatureRequired: false, evidenceRequired: false, dateRequired: false });
    }
  });

  it('an unknown type is held to the signed rule, never the looser one', () => {
    expect(fulfilmentRule('something-new')).toEqual({ signatureRequired: true, evidenceRequired: true, dateRequired: true });
  });

  it('the signed list is the three postmarketing obligations', () => {
    expect([...SIGNED_FULFILMENT_TYPES]).toEqual(['pmr', 'pmc', 'rems']);
  });
});

describe('what met a commitment', () => {
  it('refuses a PMR that names neither a sequence nor a document, with the sentence', () => {
    const refused = fulfilmentEvidenceRefusal('pmr', {});
    expect(refused).toMatch(/A PMR is met by a submission or a document/);
    expect(refused).toMatch(/Nothing was recorded\.$/);
    expect(fulfilmentEvidenceRefusal('rems', { sequenceId: null, vaultDocumentId: null })).toMatch(/A REMS is met/);
  });

  it('accepts a sequence alone, a document alone, or both', () => {
    expect(fulfilmentEvidenceRefusal('pmc', { sequenceId: 5 })).toBeNull();
    expect(fulfilmentEvidenceRefusal('pmc', { vaultDocumentId: CONTENT.vaultDocumentId })).toBeNull();
    expect(fulfilmentEvidenceRefusal('pmc', { sequenceId: 5, vaultDocumentId: CONTENT.vaultDocumentId })).toBeNull();
  });

  it('a meeting commitment needs none', () => {
    expect(fulfilmentEvidenceRefusal('meeting_commitment', {})).toBeNull();
  });
});

describe('the fulfilment digest (recipe commitment-fulfilment/v1)', () => {
  it('is stable, hex sha256, and tagged with its recipe', () => {
    const d = commitmentFulfilmentDigest(CONTENT);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
    expect(commitmentFulfilmentDigest({ ...CONTENT })).toBe(d);
    expect(COMMITMENT_FULFILMENT_DIGEST_RECIPE).toBe('commitment-fulfilment/v1');
  });

  it('changes with every one of its eleven fields', () => {
    const base = commitmentFulfilmentDigest(CONTENT);
    const changed: Array<Partial<CommitmentFulfilmentContent>> = [
      { commitmentId: 13 },
      { commitmentType: 'pmc' },
      { description: 'Pediatric study under PREA.' },
      { regulatoryBasis: null },
      { dueDate: '2028-04-01' },
      { fulfilledDate: '2026-10-02' },
      { sequenceId: 6 },
      { sequenceNumber: '0043' },
      { submissionId: 4 },
      { vaultDocumentId: '22222222-2222-4222-8222-222222222222' },
      { vaultSha256: 'b'.repeat(64) },
    ];
    expect(changed).toHaveLength(11);
    for (const c of changed) expect(commitmentFulfilmentDigest({ ...CONTENT, ...c }), JSON.stringify(c)).not.toBe(base);
  });

  it('does not depend on the order the fields were given in', () => {
    const reversed = Object.fromEntries(Object.entries(CONTENT).reverse()) as CommitmentFulfilmentContent;
    expect(commitmentFulfilmentDigest(reversed)).toBe(commitmentFulfilmentDigest(CONTENT));
  });
});

describe('how a fulfilment reads', () => {
  const signed = { signatureRequired: true };
  it('a commitment not fulfilled has no fulfilment to read', () => {
    expect(fulfilmentRecordState({ status: 'open', ...signed, recorded: false, liveSignature: null, withdrawnSignature: false })).toBe('not-fulfilled');
  });
  it('fulfilled before fulfilments were recorded is legacy, keyed on the record, not on what is missing', () => {
    expect(fulfilmentRecordState({ status: 'fulfilled', ...signed, recorded: false, liveSignature: null, withdrawnSignature: false })).toBe('legacy');
  });
  it('a signed type with a live signature that binds the record is signed; one that does not, is a mismatch', () => {
    expect(fulfilmentRecordState({ status: 'fulfilled', ...signed, recorded: true, liveSignature: { bindsRecord: true }, withdrawnSignature: false })).toBe('signed');
    expect(fulfilmentRecordState({ status: 'fulfilled', ...signed, recorded: true, liveSignature: { bindsRecord: false }, withdrawnSignature: false })).toBe('signature-mismatch');
  });
  it('a recorded signed type whose signature was withdrawn says so, and one with none says that', () => {
    expect(fulfilmentRecordState({ status: 'fulfilled', ...signed, recorded: true, liveSignature: null, withdrawnSignature: true })).toBe('signature-withdrawn');
    expect(fulfilmentRecordState({ status: 'fulfilled', ...signed, recorded: true, liveSignature: null, withdrawnSignature: false })).toBe('signature-missing');
  });
  it('an unsigned type that was recorded is recorded', () => {
    expect(fulfilmentRecordState({ status: 'fulfilled', signatureRequired: false, recorded: true, liveSignature: null, withdrawnSignature: false })).toBe('recorded');
  });
});
