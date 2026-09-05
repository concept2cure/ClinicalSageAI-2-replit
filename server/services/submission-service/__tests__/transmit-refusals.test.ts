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
