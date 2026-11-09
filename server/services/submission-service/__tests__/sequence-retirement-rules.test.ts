/**
 * P-86's rules, as pure functions (filed-sequence-baseline.ts): what keeps a
 * sequence, in which order, and in which words; the statement the signer
 * makes; the signature's meaning and payload. And the audit writer's sealed
 * instant: an unreadable one is refused before anything is written.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {}, pool: { query: vi.fn() } }));

import {
  retirementRefusal, retirementStatement, retirementPayloadRefusal, retirementMeaningRefusal, retirementSignerRefusal, type RetirementFacts,
} from '../filed-sequence-baseline';
import { writeChainedAuditRow } from '../../auditService';

const CLEAR: RetirementFacts = {
  sequenceNumber: '0000', dispatchStatus: 'pending', productionSend: null, packageSend: false,
  filedIndRecords: { safetyReports: 0, amendments: 0, annualReports: 0 },
  later: [], compileReadTwin: false, stagingTransmittalIds: [], stagingSends: [], numberFreed: true,
};

describe('retirementRefusal: what keeps a sequence, first reason first', () => {
  it('lets a sequence go when nothing keeps it', () => {
    expect(retirementRefusal(CLEAR)).toBeNull();
  });

  it('judges its own record before the sequences after it, and those before a twin read from compiles', () => {
    const all: RetirementFacts = {
      ...CLEAR, dispatchStatus: 'sent', productionSend: { at: '2026-10-01T00:00:00Z', environmentNamed: true }, packageSend: true,
      filedIndRecords: { safetyReports: 1, amendments: 0, annualReports: 0 },
      later: [{ sequenceNumber: '0001', kept: null }], compileReadTwin: true,
    };
    expect(retirementRefusal(all)).toMatch(/^Sequence 0000 is on file with the agency/);
    expect(retirementRefusal({ ...all, dispatchStatus: 'transmitting' })).toMatch(/^A send of sequence 0000 is in flight/);
    expect(retirementRefusal({ ...all, dispatchStatus: 'pending' })).toBe(
      "A send of sequence 0000 to the agency's production environment is recorded on 2026-10-01 UTC, so it cannot be retired. A correction is a new sequence numbered after it.");
    expect(retirementRefusal({ ...all, dispatchStatus: 'pending', productionSend: null })).toMatch(/^Sequence 0000 was sent to the agency's production gateway in a package/);
    expect(retirementRefusal({ ...all, dispatchStatus: 'pending', productionSend: null, packageSend: false })).toBe(
      '1 IND record is recorded as filed in sequence 0000 (a safety report). Retiring it would leave them filed in a sequence the agency never received, so it is not offered. Returning them to draft is not available yet.');
    const own = { ...CLEAR, later: all.later, compileReadTwin: true };
    expect(retirementRefusal(own)).toMatch(/^Sequence 0001, numbered after 0000 in this submission, is still in use\. Retire 0001 first/);
    expect(retirementRefusal({ ...CLEAR, compileReadTwin: true })).toMatch(/^Another sequence 0000 of this submission is on file with the agency/);
  });

  it('names a later sequence that is kept, and why, never telling anyone to retire what cannot be', () => {
    const r = retirementRefusal({ ...CLEAR, later: [{ sequenceNumber: '0002', kept: null }, { sequenceNumber: '0001', kept: 'it is on file with the agency' }] });
    expect(r).toBe("Sequence 0001, numbered after 0000, is kept (it is on file with the agency), so 0000's number cannot be freed. Place the corrected content in a new sequence after 0001.");
  });

  it('dates every send it names as a UTC day, and treats a send with no environment as a production one', () => {
    const r = retirementRefusal({ ...CLEAR, productionSend: { at: '2026-10-31T23:30:00-05:00', environmentNamed: false } });
    expect(r).toBe('A send of sequence 0000 to the agency is recorded on 2026-11-01 UTC with no environment named, so it is treated as a production send and it cannot be retired. A correction is a new sequence numbered after it.');
  });

  it('counts IND records by kind', () => {
    expect(retirementRefusal({ ...CLEAR, filedIndRecords: { safetyReports: 2, amendments: 1, annualReports: 0 } }))
      .toMatch(/^3 IND records are recorded as filed in sequence 0000 \(2 safety reports and an amendment\)\./);
  });
});

describe('what the signer states, and what the signature must carry', () => {
  it('the statement names every route, the platform\'s own package route among them', () => {
    const s = retirementStatement('0000');
    expect(s).toBe('Sequence 0000 has not been filed with the agency by any route: not by a send from this sequence, not as a package sent from this platform, not from an export, and not by courier or any other route.');
    expect(s).not.toContain('outside this platform');
  });

  it('the payload carries notFiledElsewhere and the statement, word for word', () => {
    const refuse = retirementPayloadRefusal('0000');
    const statement = retirementStatement('0000');
    expect(refuse({ notFiledElsewhere: true, statement })).toBeNull();
    for (const p of [null, {}, { notFiledElsewhere: true }, { statement }, { notFiledElsewhere: 'true', statement },
      { notFiledElsewhere: true, statement: statement.slice(0, -1) }, { notFiledElsewhere: true, statement: retirementStatement('0001') }]) {
      expect(refuse(p as Record<string, unknown> | null), JSON.stringify(p)).toMatch(/^the signature does not carry the statement for sequence 0000, word for word: "/);
    }
  });

  it('the meaning is responsibility, and only it', () => {
    expect(retirementMeaningRefusal('responsibility')).toBeNull();
    for (const m of ['approval', 'release', 'review', 'retirement', undefined, null]) {
      expect(retirementMeaningRefusal(m)).toBe('retiring a sequence is signed with the meaning responsibility');
    }
  });
});

describe('who may sign the retirement, as the precheck tells it (C2)', () => {
  it('the creator is told another person signs it; an independent signer is not stopped', () => {
    expect(retirementSignerRefusal('0003', 'independent')).toBeNull();
    expect(retirementSignerRefusal('0003', 'author')).toBe(
      'You created sequence 0003, so you cannot sign its retirement. Another person with signing authority signs it.');
  });

  it('a creator who cannot be resolved, or a check that failed, is said so, never taken as independence or as authorship', () => {
    expect(retirementSignerRefusal('0003', 'unresolved')).toBe(
      "Who created sequence 0003 cannot be resolved from its record, so no one can be shown to be independent of its creator, and its retirement cannot be signed.");
    expect(retirementSignerRefusal('0003', 'unverified')).toBe(
      'Whether you created sequence 0003 could not be checked, so its retirement cannot be signed now. Try again.');
  });
});

describe('the audit row\'s sealed instant', () => {
  it('an unreadable instant is refused before anything is read or written', async () => {
    const client = { query: vi.fn(async () => ({ rows: [] })) };
    await expect(writeChainedAuditRow(client, { organizationId: 7, userId: 3, action: 'X', resourceType: 'ectd_sequence', resourceId: 1, occurredAt: 'not a time' }))
      .rejects.toThrow('Audit row not written: its time "not a time" is not an instant.');
    expect(client.query).not.toHaveBeenCalled();
  });
});
