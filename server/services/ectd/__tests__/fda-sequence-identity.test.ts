/**
 * The identity an FDA sequence declares in us-regional.xml (sweep F04,
 * 2026-10-01): every follow-up on the package spine was declared the Original
 * of a new regulatory activity, and an IND could file a supplement.
 */
import { describe, it, expect } from 'vitest';
import { resolveFdaSequenceIdentity } from '../fda-sequence-identity';
import { SequenceLifecycleRefusal, type FiledSequence } from '../package-sequence-lifecycle';

const IND = 'fdaat4';
const NDA = 'fdaat1';
const filedEntry = (sequence: string, extra: Partial<FiledSequence> = {}): FiledSequence => ({
  sequence, submissionType: 'Original Application', sha256: 'a'.repeat(64), transmittalId: 1,
  filedAt: '2026-01-01T00:00:00.000Z', leaves: [], ...extra,
});
const refusal = (fn: () => unknown): SequenceLifecycleRefusal => {
  try { fn(); } catch (e) { if (e instanceof SequenceLifecycleRefusal) return e; throw e; }
  throw new Error('expected a refusal');
};

describe('resolveFdaSequenceIdentity', () => {
  it('0000 is the Original of its own activity when it says nothing', () => {
    expect(resolveFdaSequenceIdentity({ sequence: '0000', applicationTypeCode: IND, filed: [] })).toEqual({
      submissionTypeCode: 'fdast1', submissionType: 'Original Application',
      submissionSubTypeCode: 'fdasst1', submissionSubType: 'Original', submissionId: '0000',
    });
  });

  it('an IND amendment is Original Application / Amendment, continuing the activity 0000 opened', () => {
    const id = resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: IND, filed: [filedEntry('0000')],
      submissionType: 'Original Application', submissionSubType: 'amendment', submissionId: '0000',
    });
    expect(id).toMatchObject({ submissionTypeCode: 'fdast1', submissionSubTypeCode: 'fdasst4', submissionSubType: 'Amendment', submissionId: '0000' });
  });

  it('reads a 0000 recorded before codes were (its term the bare word "original") as the Original Application', () => {
    const id = resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: IND, filed: [filedEntry('0000', { submissionType: 'original' })],
      submissionType: 'Original Application', submissionSubType: 'Amendment', submissionId: '0000',
    });
    expect(id.submissionId).toBe('0000');
  });

  it('REFUSES a supplement on an IND, offering what an IND can file', () => {
    const e = refusal(() => resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: IND, filed: [filedEntry('0000')],
      submissionType: 'Efficacy Supplement', submissionSubType: 'Original',
    }));
    expect(e.code).toBe('SUBMISSION_TYPE_NOT_FOR_APPLICATION');
    expect(e.acceptedSubmissionTypes).toContain('Original Application');
    expect(e.acceptedSubmissionTypes).not.toContain('Efficacy Supplement');
  });

  it('REFUSES IND safety reports outside an IND, and allows a supplement on an NDA', () => {
    expect(refusal(() => resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: NDA, filed: [filedEntry('0000')], submissionType: 'IND Safety Reports', submissionSubType: 'Original',
    })).code).toBe('SUBMISSION_TYPE_NOT_FOR_APPLICATION');
    expect(resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: NDA, filed: [filedEntry('0000')], submissionType: 'Efficacy Supplement', submissionSubType: 'Original',
    })).toMatchObject({ submissionTypeCode: 'fdast2', submissionSubTypeCode: 'fdasst1', submissionId: '0001' });
  });

  it('REFUSES a word that only resembles a term — matched exactly, never guessed (sweep F08)', () => {
    for (const word of ['IND', 'report', 'supplement', 'labeling']) {
      expect(refusal(() => resolveFdaSequenceIdentity({
        sequence: '0001', applicationTypeCode: IND, filed: [filedEntry('0000')], submissionType: word, submissionSubType: 'Amendment', submissionId: '0000',
      })).code, word).toBe('SUBMISSION_TYPE_UNKNOWN');
    }
  });

  it('REFUSES a follow-up that does not say its sub-type, and a sub-type that is not one', () => {
    const missing = refusal(() => resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: IND, filed: [filedEntry('0000')], submissionType: 'Original Application',
    }));
    expect(missing.code).toBe('SUBMISSION_SUB_TYPE_REQUIRED');
    expect(missing.details?.acceptedSubmissionSubTypes).toContain('Amendment');
    expect(refusal(() => resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: IND, filed: [filedEntry('0000')], submissionType: 'Original Application', submissionSubType: 'amend',
    })).code).toBe('SUBMISSION_SUB_TYPE_UNKNOWN');
  });

  it('an Amendment must name the activity; the named sequence must be filed, earlier, and have opened an activity of this type', () => {
    const base = { sequence: '0002', applicationTypeCode: NDA, submissionType: 'Original Application', submissionSubType: 'Amendment' };
    const filed = [filedEntry('0000'), filedEntry('0001', { submissionType: 'Efficacy Supplement', submissionTypeCode: 'fdast2' })];
    expect(refusal(() => resolveFdaSequenceIdentity({ ...base, filed })).code).toBe('SUBMISSION_ID_REQUIRED');
    expect(refusal(() => resolveFdaSequenceIdentity({ ...base, filed, submissionId: '0007' })).code).toBe('SUBMISSION_ID_NOT_FILED');
    expect(refusal(() => resolveFdaSequenceIdentity({ ...base, filed, submissionId: '0002' })).code).toBe('SUBMISSION_ID_NOT_FILED');
    // 0001 opened an Efficacy Supplement activity, not an Original Application one.
    expect(refusal(() => resolveFdaSequenceIdentity({ ...base, filed, submissionId: '0001' })).code).toBe('SUBMISSION_ID_WRONG_ACTIVITY');
    expect(resolveFdaSequenceIdentity({ ...base, filed, submissionId: '0000' }).submissionId).toBe('0000');
    // An amendment to the supplement names the supplement's activity.
    expect(resolveFdaSequenceIdentity({ ...base, filed, submissionType: 'Efficacy Supplement', submissionId: '0001' }).submissionId).toBe('0001');
  });

  it('a sequence that continued an activity cannot itself be named as one', () => {
    const filed = [filedEntry('0000'), filedEntry('0001', { submissionTypeCode: 'fdast1', submissionSubTypeCode: 'fdasst4', submissionId: '0000' })];
    expect(refusal(() => resolveFdaSequenceIdentity({
      sequence: '0002', applicationTypeCode: IND, filed, submissionType: 'Original Application', submissionSubType: 'Amendment', submissionId: '0001',
    })).code).toBe('SUBMISSION_ID_WRONG_ACTIVITY');
  });

  it('REFUSES a second Original Application, and an Original that names another activity', () => {
    expect(refusal(() => resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: IND, filed: [filedEntry('0000')], submissionType: 'Original Application', submissionSubType: 'Original',
    })).code).toBe('ORIGINAL_APPLICATION_ALREADY_FILED');
    expect(refusal(() => resolveFdaSequenceIdentity({
      sequence: '0001', applicationTypeCode: NDA, filed: [filedEntry('0000')], submissionType: 'Efficacy Supplement', submissionSubType: 'Original', submissionId: '0000',
    })).code).toBe('SUBMISSION_ID_WRONG_ACTIVITY');
  });

  it('a Report or Correspondence opens its own activity unless it names one', () => {
    const id = resolveFdaSequenceIdentity({
      sequence: '0003', applicationTypeCode: NDA, filed: [filedEntry('0000')], submissionType: 'Annual Report', submissionSubType: 'Report',
    });
    expect(id).toMatchObject({ submissionTypeCode: 'fdast5', submissionSubTypeCode: 'fdasst6', submissionId: '0003' });
  });
});
