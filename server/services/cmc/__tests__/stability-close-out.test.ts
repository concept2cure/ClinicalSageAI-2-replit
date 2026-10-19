/**
 * The stability close-out: the register's own vocabulary, and the comparisons
 * that read it.
 *
 * ## The defect
 *
 * The shelf life §3.2.S.7.1 / §3.2.P.8.1 prints as the dossier's proposed
 * storage period — and the value the ICH Q1E rule judges a programme against —
 * was set by an ordinary PUT together with the terminal status:
 * `{"shelfLife":"36 months at 25C/60%RH","status":"COMPLETED"}` answered 200,
 * wrote no signature row, recorded no reason and asked for no
 * re-authentication. It was the last ungoverned signed state in the CMC
 * registers after the 2026-10-18 ceremony generalisation
 * (docs/evidence/CMC-M3-GA/2026-10-19/11-stability-close-out/).
 *
 * ## Why this file is about CASE
 *
 * Every other register's signed word is lower-case (`qualified`, `validated`,
 * `approved`). The stability register's vocabulary is upper-case — DRAFT,
 * ACTIVE, PAUSED, COMPLETED — and 301 rows already hold it, the status chip
 * compares it exactly, and writing `completed` into that column would leave one
 * row disagreeing with the rest.
 *
 * So the descriptor keeps each register's own casing and every comparison
 * lowercases BOTH sides. Four comparisons read the signed word, and three of
 * them were written against lower-case input. Each one that still compared
 * raw would fail silently in a different direction, which is what these cases
 * are: the guard that never fires, the ceremony that signs twice, the
 * retirement that is refused on a record that plainly is signed.
 */
import { describe, expect, it } from 'vitest';
import { SIGNED_REGISTERS, isSigned, isRetirement, signedRegisterEditRefusal, signedRegisterByPath } from '../signed-record';
import { ungovernedQualificationRefusal, vocabFor } from '../register-writes';

const STABILITY = SIGNED_REGISTERS.stabilityStudies;

describe('the stability register keeps its own vocabulary', () => {
  it('signs with the word the register already holds, in the register’s casing', () => {
    /* 301 rows hold ACTIVE / PAUSED, and CmcModule's status chip compares the
       word exactly. A lower-case `completed` would be a row disagreeing with
       its own register. */
    expect(STABILITY.signedValue).toBe('COMPLETED');
    expect(STABILITY.statusColumn).toBe('status');
  });

  it('is reachable by its path, like every other signed register', () => {
    expect(signedRegisterByPath('stability-studies')).toBe(STABILITY);
    expect(vocabFor('stability-studies')).toEqual({
      signedValue: 'COMPLETED',
      verb: 'Closing out a stability study with its shelf life',
      path: 'close-out',
    });
  });

  it('names the signature columns the migration added, not a sibling register’s', () => {
    expect(STABILITY.signedByColumn).toBe('shelf_life_signed_by');
    expect(STABILITY.signedAtColumn).toBe('shelf_life_signed_at');
    expect(STABILITY.signedByField).toBe('shelfLifeSignedBy');
    expect(STABILITY.signedAtField).toBe('shelfLifeSignedAt');
  });
});

describe('isSigned reads the stored word whatever its case', () => {
  it('recognises the register’s own upper-case word', () => {
    /* Compared raw against the descriptor, this returned false for a study
       that IS closed out — and `isSigned` is what closes a signed record to
       ordinary edits. */
    expect(isSigned(STABILITY, 'COMPLETED')).toBe(true);
  });

  it('recognises it however it is stored or sent', () => {
    for (const word of ['completed', 'Completed', ' COMPLETED ', 'cOmPlEtEd']) {
      expect(isSigned(STABILITY, word), word).toBe(true);
    }
  });

  it('does not recognise a different state as signed', () => {
    for (const word of ['ACTIVE', 'PAUSED', 'DRAFT', 'CANCELLED', '', null, undefined]) {
      expect(isSigned(STABILITY, word), String(word)).toBe(false);
    }
  });

  it('still reads every lower-case register correctly', () => {
    expect(isSigned(SIGNED_REGISTERS.analyticalMethods, 'validated')).toBe(true);
    expect(isSigned(SIGNED_REGISTERS.analyticalMethods, 'VALIDATED')).toBe(true);
    expect(isSigned(SIGNED_REGISTERS.containerClosures, 'qualified')).toBe(true);
  });
});

describe('an ordinary edit cannot reach the close-out', () => {
  it('refuses the transition into COMPLETED, naming the governed path', () => {
    const refusal = ungovernedQualificationRefusal('COMPLETED', 'stability-studies', 'ACTIVE');
    expect(refusal).toMatch(/governed action/i);
    expect(refusal).toContain('POST /api/cmc/stability-studies/:id/close-out');
  });

  it('refuses it whatever case the body sends', () => {
    for (const word of ['completed', 'Completed', 'COMPLETED']) {
      expect(ungovernedQualificationRefusal(word, 'stability-studies', 'ACTIVE'), word).not.toBeNull();
    }
  });

  it('leaves an ordinary status change alone', () => {
    expect(ungovernedQualificationRefusal('PAUSED', 'stability-studies', 'ACTIVE')).toBeNull();
    expect(ungovernedQualificationRefusal('ACTIVE', 'stability-studies', 'DRAFT')).toBeNull();
  });

  it('refuses returning a closed-out study to a running state', () => {
    /* An unsigned reopening would strand the signature on a study that no
       longer claims the shelf life it signed for. */
    const refusal = ungovernedQualificationRefusal('ACTIVE', 'stability-studies', 'COMPLETED');
    expect(refusal).toMatch(/cannot be returned/i);
  });

  it('admits retiring a closed-out study, which is a lifecycle end', () => {
    expect(ungovernedQualificationRefusal('retired', 'stability-studies', 'COMPLETED')).toBeNull();
    expect(isRetirement(STABILITY, { status: 'retired' })).toBe(true);
    expect(isRetirement(STABILITY, { status: 'retired', shelfLife: '36 months' })).toBe(false);
  });
});

describe('a closed-out study is closed to content edits', () => {
  it('refuses a new shelf life, naming the state and the way out', () => {
    const refusal = signedRegisterEditRefusal(STABILITY, 'COMPLETED', { shelfLife: '36 months at 25C/60%RH' });
    expect(refusal).toMatch(/COMPLETED under a recorded signature/);
  });

  it('refuses a correction to the recorded series it signed over', () => {
    expect(signedRegisterEditRefusal(STABILITY, 'COMPLETED', { stabilityData: [] })).not.toBeNull();
  });

  it('leaves a running study editable, which is most of a study’s life', () => {
    expect(signedRegisterEditRefusal(STABILITY, 'ACTIVE', { shelfLife: '24 months' })).toBeNull();
    expect(signedRegisterEditRefusal(STABILITY, 'PAUSED', { stabilityData: [] })).toBeNull();
  });
});
