/**
 * transmitSequence refuses before touching the database when the caller has
 * not named the environment or the agency application number.
 *
 * Both refusals used to be defaults: environment fell back to 'production'
 * (the package went to the live agency endpoint) and an absent application
 * number was spelled UNASSIGNED-SEQ-<id> in the backbone and on the SFTP path
 * and sent anyway. Nothing here reaches getSequence, so the db mock only has
 * to satisfy the module import.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {}, pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import { transmitSequence, SubmissionError, resendRefusal } from '../submission-service';

const ctx = { organizationId: 7, userId: 11 };

describe('transmitSequence refusals (no database access)', () => {
  it('refuses when no environment is named — it never defaults to production', async () => {
    await expect(
      transmitSequence({ sequenceId: 1, ctx, signatureActionId: 'sig-1', applicationId: 'IND123456' } as any),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: /explicit environment/ });
  });

  it('refuses an environment outside staging|production', async () => {
    await expect(
      transmitSequence({ sequenceId: 1, ctx, signatureActionId: 'sig-1', applicationId: 'IND123456', environment: 'prod' } as any),
    ).rejects.toBeInstanceOf(SubmissionError);
  });

  it('refuses when no application number is recorded', async () => {
    await expect(
      transmitSequence({ sequenceId: 1, ctx, signatureActionId: 'sig-1', environment: 'staging' } as any),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: /application number/ });
  });

  it('refuses an UNASSIGNED placeholder application number', async () => {
    await expect(
      transmitSequence({ sequenceId: 1, ctx, signatureActionId: 'sig-1', environment: 'staging', applicationId: 'UNASSIGNED-SEQ-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION', message: /application number/ });
  });

  it('refuses a whitespace-only application number', async () => {
    await expect(
      transmitSequence({ sequenceId: 1, ctx, signatureActionId: 'sig-1', environment: 'production', applicationId: '   ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('resendRefusal — a transmitted sequence is not sent again', () => {
  it('refuses sent and acknowledged, allows pending and rejected', () => {
    // The only guard was status === 'dispatched', which transmit never
    // changes, so a second call produced a second real transmittal.
    expect(resendRefusal('sent')).toMatch(/already transmitted/);
    expect(resendRefusal('acknowledged')).toMatch(/already transmitted/);
    expect(resendRefusal('pending')).toBeNull();
    expect(resendRefusal('rejected')).toBeNull();
    expect(resendRefusal(null)).toBeNull();
  });
});

/**
 * The duplicate-send guard is claimed BEFORE the wire, not written after it.
 *
 * `dispatch_status` is the only thing preventing a second real transmission to
 * an agency. It was read at the top of transmitSequence and written only AFTER
 * gw.transmit, so everything in between — both gates, the readiness assessment,
 * package assembly and the AS2/SFTP transfer itself — was a window in which a
 * second caller read the same 'pending', passed the same guard, and sent the
 * same sequence again. The single-use signature check cannot catch it either:
 * it looks for an audit row written after the transfer.
 *
 * There is a sequential variant needing no concurrency at all:
 * applySequenceChangeWithAudit rolls its state change back when the §11.10(e)
 * row cannot be written — right for freeze, wrong once the package is at the
 * agency. dispatch_status stayed 'pending' with the bytes delivered, and the
 * operator's retry sent them again.
 */
import { TRANSMITTING_STATUS } from '../submission-service';
import fs from 'node:fs';
import path from 'node:path';

describe('transmit claim — in-flight is not re-sendable', () => {
  it('refuses a resend while a transmit is in flight', () => {
    const refusal = resendRefusal(TRANSMITTING_STATUS);
    expect(refusal).toMatch(/already in flight/i);
    expect(refusal).toMatch(/confirm at the agency/i);
  });

  it('still allows the states that were always re-sendable', () => {
    expect(resendRefusal('pending')).toBeNull();
    expect(resendRefusal('rejected')).toBeNull();
    expect(resendRefusal(null)).toBeNull();
  });

  it('still refuses the terminal states', () => {
    expect(resendRefusal('sent')).toMatch(/already transmitted/);
    expect(resendRefusal('acknowledged')).toMatch(/already transmitted/);
  });
});

describe('transmit claim — source contract', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'submission-service.ts'), 'utf8');
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('claims the slot with a compare-and-set on the value it read', () => {
    expect(CODE).toMatch(/dispatch_status IS NULL OR dispatch_status IN \('pending', 'rejected'\)/);
  });

  it('takes the claim BEFORE the package is assembled', () => {
    // Within transmitSequence: the governed freeze/dispatch also assemble
    // (assertSequencePackageable, 2026-09-23) and hold no transmit claim.
    const fn = CODE.indexOf('export async function transmitSequence');
    expect(fn).toBeGreaterThan(-1);
    const claim = CODE.indexOf('claimTransmitSlot(sequenceId', fn);
    const assemble = CODE.indexOf('await assembleSequence(', fn);
    expect(claim).toBeGreaterThan(-1);
    expect(assemble).toBeGreaterThan(-1);
    expect(claim).toBeLessThan(assemble);
  });

  it('resolves the attempt with a write predicated on that claim', () => {
    expect(CODE).toMatch(/SET dispatch_status = \$1[^`]*AND dispatch_status = \$4/);
  });

  it('never releases the claim after the bytes may have left', () => {
    // Delivery is ambiguous once gw.transmit is entered, so the claim is left
    // standing for a human. Every release must precede it — except one: a
    // refusal the gateway GUARD made before handing anything to the gateway
    // (refusedBeforeWire), which left a never-sent sequence stuck 'transmitting'
    // (2026-09-23, W5/D7; behaviour pinned in
    // transmit-guard-refusal-releases-claim.test.ts). That release must be
    // conditioned on refusedBeforeWire and nothing else.
    const transmit = CODE.indexOf('await gw.transmit(');
    expect(transmit).toBeGreaterThan(-1);
    const releases = [...CODE.matchAll(/releaseTransmitSlot\(sequenceId/g)].map((m) => m.index ?? -1);
    expect(releases.length).toBeGreaterThan(0);
    const after = releases.filter((at) => at > transmit);
    expect(after).toHaveLength(1);
    const line = CODE.slice(CODE.lastIndexOf('\n', after[0]) + 1, CODE.indexOf('\n', after[0]));
    expect(line).toMatch(/^\s*if \(refusedBeforeWire\(err\)\) await releaseTransmitSlot\(sequenceId/);
  });
});
