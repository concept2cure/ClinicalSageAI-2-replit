/**
 * The signed act records WHICH outcome the signer attests (P-110 item 1).
 *
 * ## The finding, and the decision
 *
 * The specification approval gate honours a validated OR a suitable method
 * (`METHOD_SUITABLE`, which `q2Expectation` relies on before phase 3). But no
 * form could record suitability, so in practice every limit needed a fully
 * validated method (`docs/evidence/S7/2026-11-09-demo-cmc-methods/`).
 *
 * P-110, decided 2026-11-09 by the coordinating session under the founder's
 * delegation of 2026-11-08, chose option (b): the existing signed act
 * `POST /api/cmc/analytical-methods/:id/validate` takes an outcome —
 * `validated` as today, or suitable for its phase with the signer's reason and
 * the phase. The same ceremony, the same audit, the same route; no second
 * endpoint. Option (a), an unsigned `qualified` status, is refused including as
 * an interim: "a word typed into a GxP register must not unlock an approval
 * that validation reaches only by signature."
 *
 * ## What these cases hold
 *
 * `resolveSignedOutcome` is the descriptor's own decision, asked by the
 * ceremony in `server/api/cmc/routes.ts`. It is pure, so what it decides is
 * testable without a database or a signature.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SIGNED_REGISTERS,
  isSigned,
  resolveSignedOutcome,
  signedRegisterEditRefusal,
  signedStateNames,
  signedStateOf,
} from '../signed-record';
import { ungovernedQualificationRefusal, vocabFor } from '../register-writes';
import { METHOD_SUITABLE, METHOD_VALIDATED } from '../analytical-method-source';

const METHODS = SIGNED_REGISTERS.analyticalMethods;
/** A register that signs one outcome, as every register but methods does. */
const CLOSURES = SIGNED_REGISTERS.containerClosures;

describe('a register that records one outcome is unchanged', () => {
  it('answers its signed word when the request names no outcome', () => {
    expect(resolveSignedOutcome(CLOSURES, {}, 'development')).toEqual({
      value: 'qualified',
      attests: CLOSURES.verb,
      phase: null,
    });
  });

  it('refuses an outcome it cannot sign for, rather than ignoring it', () => {
    /* Silently signing `qualified` for a caller that asked for something else
       would record an attestation nobody made. */
    const out = resolveSignedOutcome(CLOSURES, { outcome: 'phase-appropriate' }, 'development');
    expect(out).toMatchObject({ refusal: expect.stringContaining('records one outcome') });
  });

  it('accepts its own word named explicitly', () => {
    expect(resolveSignedOutcome(CLOSURES, { outcome: 'qualified' }, 'development')).toMatchObject({
      value: 'qualified',
    });
  });
});

describe('the analytical-method act records two outcomes', () => {
  it('defaults to full validation, so every caller from before P-110 is unchanged', () => {
    expect(resolveSignedOutcome(METHODS, {}, 'development')).toEqual({
      value: 'validated',
      attests: 'full validation to ICH Q2(R2)',
      phase: null,
    });
  });

  it('records suitability for a stated phase', () => {
    expect(
      resolveSignedOutcome(METHODS, { outcome: 'phase-appropriate', phase: 'Phase 1' }, 'development'),
    ).toEqual({
      value: 'phase-appropriate',
      attests: 'suitability for the stated development phase, short of full validation',
      phase: 'Phase 1',
    });
  });

  it('refuses suitability with no phase — a procedure is suitable FOR something', () => {
    const out = resolveSignedOutcome(METHODS, { outcome: 'phase-appropriate' }, 'development');
    expect(out).toMatchObject({ refusal: expect.stringContaining('State the phase') });
    expect((out as { refusal: string }).refusal).toMatch(/suitable FOR something/);
  });

  it('refuses a blank phase the same way, so whitespace is not an attestation', () => {
    expect(
      resolveSignedOutcome(METHODS, { outcome: 'phase-appropriate', phase: '   ' }, 'development'),
    ).toMatchObject({ refusal: expect.stringContaining('State the phase') });
  });

  it('names the outcomes it does sign for when asked for one it does not', () => {
    const out = resolveSignedOutcome(METHODS, { outcome: 'probably fine' }, 'development');
    expect((out as { refusal: string }).refusal).toMatch(/"validated" or "phase-appropriate"/);
  });

  it('matches the outcome trimmed and case-insensitively, as every other comparison here does', () => {
    expect(resolveSignedOutcome(METHODS, { outcome: '  VALIDATED ' }, 'development')).toMatchObject({
      value: 'validated',
    });
  });
});

describe('a signed step down is refused', () => {
  it('refuses recording suitability over full validation', () => {
    /* The register would claim less than someone has already attested, with
       the first signature overwritten rather than retracted. */
    const out = resolveSignedOutcome(
      METHODS,
      { outcome: 'phase-appropriate', phase: 'Phase 1' },
      'validated',
    );
    expect(out).toMatchObject({ refusal: expect.stringContaining('already recorded as validated') });
    expect((out as { refusal: string }).refusal).toMatch(/overwriting the first rather than retracting it/);
  });

  it('ALLOWS the step up — full validation by the pivotal phase is the point', () => {
    expect(resolveSignedOutcome(METHODS, { outcome: 'validated' }, 'phase-appropriate')).toMatchObject({
      value: 'validated',
    });
  });

  it('is not confused by a status outside the outcomes', () => {
    /* `development`, `validation`, `retired` hold no rank, so neither branch
       of the comparison fires and the act proceeds on its own merits. */
    for (const stored of ['development', 'validation', 'retired', '', null, undefined]) {
      expect(
        resolveSignedOutcome(METHODS, { outcome: 'phase-appropriate', phase: 'Phase 1' }, stored),
        String(stored),
      ).toMatchObject({ value: 'phase-appropriate' });
    }
  });
});

describe('the unsigned word is refused on an ordinary edit, including as an interim', () => {
  /* P-110: "Option (a), the unsigned `qualified` status, is refused, including
     as an interim. A word typed into a GxP register must not unlock an
     approval that validation reaches only by signature." */
  it('refuses every word the approval gate would honour', () => {
    for (const word of [...METHOD_VALIDATED, ...METHOD_SUITABLE]) {
      const refusal = ungovernedQualificationRefusal(word, 'analytical-methods', 'development');
      expect(refusal, `an ordinary edit set the method status to "${word}"`).not.toBeNull();
      expect(refusal!, word).toMatch(/is a governed action and is recorded with a signature/);
      /* The refusal names the endpoint that does perform the act, so it can
         never point at one that does not exist. */
      expect(refusal!, word).toContain('/api/cmc/analytical-methods/:id/validate');
    }
  });

  it('lets a record round-trip its own status through an edit', () => {
    /* An edit that sends the record's current status back is not a transition,
       and refusing it would make a signed record uneditable. */
    for (const word of ['validated', 'phase-appropriate', 'qualified']) {
      expect(ungovernedQualificationRefusal(word, 'analytical-methods', word), word).toBeNull();
    }
  });

  it('still refuses an unsigned reversal out of any governed word, and allows retiring', () => {
    expect(ungovernedQualificationRefusal('development', 'analytical-methods', 'phase-appropriate'))
      .toMatch(/cannot be returned to "development" by an ordinary edit/);
    expect(ungovernedQualificationRefusal('retired', 'analytical-methods', 'phase-appropriate')).toBeNull();
  });

  it('leaves every other register at exactly one governed word', () => {
    /* The widening is the analytical-method register's, not every
       register's: a container closure that happens to be called `suitable`
       must still be an ordinary status elsewhere. */
    for (const path of ['container-closures', 'reference-standards', 'impurity-profiles',
      'characterization-studies', 'manufacturing-processes', 'process-validation', 'stability-studies']) {
      expect(vocabFor(path).governedValues, path).toHaveLength(1);
    }
    expect(vocabFor('analytical-methods').governedValues.length).toBeGreaterThan(1);
  });

  it('does not refuse an ordinary word that is not in the vocabulary', () => {
    for (const word of ['development', 'validation', 'draft', '']) {
      expect(ungovernedQualificationRefusal(word, 'analytical-methods', 'development'), word).toBeNull();
    }
  });
});

describe('a record signed as the second outcome is as signed as the first', () => {
  /* Introducing a second signed state and leaving it unprotected would have
     been the decision's own hole, one level down: a signature over a
     procedure's suitability sits on the same content, and is stranded by the
     same edit. */
  it('reads both outcomes as signed, and says which', () => {
    expect(signedStateOf(METHODS, 'validated')).toBe('validated');
    expect(signedStateOf(METHODS, 'phase-appropriate')).toBe('phase-appropriate');
    expect(signedStateOf(METHODS, 'PHASE-APPROPRIATE')).toBe('phase-appropriate');
    expect(signedStateOf(METHODS, 'development')).toBeNull();
    expect(signedStateOf(METHODS, '')).toBeNull();
    expect(signedStateOf(METHODS, null)).toBeNull();
  });

  it('refuses an ordinary content edit of a phase-appropriate method', () => {
    const refusal = signedRegisterEditRefusal(METHODS, 'phase-appropriate', { purpose: 'Assay, revised' });
    expect(refusal, 'a signed suitability was editable under its signature').not.toBeNull();
    /* The refusal names the state the record is actually in, not the
       register's default word — a signer reading "is validated" about a
       phase-appropriate method would not recognise their own record. */
    expect(refusal!).toContain('is phase-appropriate under a recorded signature');
  });

  it('still allows retiring it with a reason, which is a lifecycle end', () => {
    expect(signedRegisterEditRefusal(METHODS, 'phase-appropriate', { status: 'retired', reason: 'Superseded.' }))
      .toBeNull();
  });

  it('leaves a register with one outcome exactly where it was', () => {
    expect(isSigned(CLOSURES, 'qualified')).toBe(true);
    expect(isSigned(CLOSURES, 'phase-appropriate')).toBe(false);
    expect(signedStateOf(CLOSURES, 'qualified')).toBe('qualified');
  });
});

/**
 * P-110 left one way out of a signature closed.
 *
 * `retireSignedRecord` is the single change an ordinary edit of a signed record
 * is refused in favour of (`signedRegisterEditRefusal`: "Retire it with a
 * reason, then record and sign a new one"). It compared the stored status to
 * `register.signedValue` alone. For eight of the nine registers that is the
 * only signed state there is. For analytical methods, P-110 added a second —
 * `phase-appropriate` — so a method signed suitable for its phase was refused
 * retirement with "that method is not validated", while an ordinary edit of it
 * was refused because it IS signed. Both doors shut: the record could not be
 * changed, and could not be retired, ever.
 *
 * The real `retireSignedRecord` runs here against a fake transaction client.
 */
const RETIRE_SQL = { rows: [] as unknown[] };

const tx = vi.hoisted(() => {
  const state = { status: 'validated' as string, audit: null as Record<string, unknown> | null, updates: 0 };
  return { state };
});

vi.mock('../../../db.js', () => ({
  transaction: async (work: (c: unknown) => Promise<unknown>) =>
    work({
      query: async (sql: string) => {
        if (/^\s*SELECT/i.test(sql)) {
          return { rows: [{ id: 'm-1', project_id: 'p-1', status: tx.state.status }] };
        }
        if (/^\s*UPDATE/i.test(sql)) tx.state.updates += 1;
        return RETIRE_SQL;
      },
    }),
}));

vi.mock('../../auditService.js', () => ({
  writeChainedAuditRow: async (_c: unknown, row: Record<string, unknown>) => {
    tx.state.audit = row;
  },
}));

describe('retiring a signed record reads every signed outcome', () => {
  beforeEach(() => {
    tx.state.audit = null;
    tx.state.updates = 0;
  });

  const retire = async (status: string) => {
    tx.state.status = status;
    const { retireSignedRecord } = await import('../signed-record');
    return retireSignedRecord({
      register: METHODS,
      id: 'm-1',
      organizationId: 2,
      userId: 1,
      reason: 'Superseded by the validated method; retiring the phase-appropriate record.',
    });
  };

  it('retires a method signed `validated`, as it always did', async () => {
    expect(await retire('validated')).toEqual({ ok: true });
    expect(tx.state.updates).toBe(1);
  });

  // The defect. Before this fix: 409 NOT_SIGNED, "that method is not validated".
  it('retires a method signed `phase-appropriate` — P-110 made it a signature too', async () => {
    expect(await retire('phase-appropriate')).toEqual({ ok: true });
    expect(tx.state.updates).toBe(1);
  });

  it('records WHICH signed state was retired, not the register default', async () => {
    await retire('phase-appropriate');
    expect(tx.state.audit?.details).toMatchObject({ from: 'phase-appropriate', to: 'retired' });
  });

  it('still refuses an unsigned record, naming every signed state', async () => {
    const out = await retire('validation');
    expect(out).toMatchObject({ ok: false, status: 409, code: 'NOT_SIGNED' });
    expect((out as { message: string }).message).toContain('validated or phase-appropriate');
    expect(tx.state.updates).toBe(0);
  });

  it('names one state for a register that signs one', () => {
    expect(signedStateNames(CLOSURES)).toBe(CLOSURES.signedValue);
    expect(signedStateNames(METHODS)).toBe('validated or phase-appropriate');
  });
});
