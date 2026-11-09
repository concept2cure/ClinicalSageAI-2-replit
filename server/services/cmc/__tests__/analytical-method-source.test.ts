/**
 * The analytical-method reader, and the two claims it refuses to make blind.
 *
 * The engines it feeds — ICH Q2, the QbD analyzer and the control-strategy
 * generator — all read `public.analytical_methods` for columns that table does
 * not have, so every read raised 42703 on every provisioned database. ICH Q2
 * has therefore never run. Moving the read to the canonical source-object
 * store makes it run, and that is exactly when two fabrications become
 * possible for the first time:
 *
 *   · a zero-row answer reported as "this project records no analytical
 *     methods" when in truth the project id addressed nothing;
 *   · a method with no recorded validation status reported as UNVALIDATED,
 *     which is a regulatory finding against the project for a fact nobody
 *     entered.
 *
 * Both are pinned here.
 */
import { describe, expect, it } from 'vitest';

import {
  loadProjectAnalyticalMethods,
  normalizeMethodPayload,
  specificationMethodVerdict,
  METHOD_SOURCE_TYPE,
} from '../analytical-method-source';

/** A pool whose single query answers with the given rows. */
const poolOf = (rows: unknown[]) =>
  ({ query: async () => ({ rows }) }) as never;

/** A pool whose query fails, the way a missing relation would. */
const failingPool = (message: string) =>
  ({
    query: async () => {
      throw new Error(message);
    },
  }) as never;

const methodRow = (payload: Record<string, unknown>, sourceKey = 'method:1') => ({
  sourceKey,
  sourcePayload: payload,
  isMethod: true,
});

const otherRow = () => ({ sourceKey: 'stability:1', sourcePayload: {}, isMethod: false });

describe('normalizeMethodPayload', () => {
  it('reads the write-through dialect the register actually stores', () => {
    // mapAnalyticalMethodPayload's own field names.
    expect(
      normalizeMethodPayload({
        methodName: 'HPLC assay',
        methodType: 'chromatographic',
        purpose: 'assay',
        validationStatus: 'validated',
        specificity_data: { ok: true },
      }),
    ).toMatchObject({
      methodName: 'HPLC assay',
      methodType: 'chromatographic',
      purpose: 'assay',
      validationStatus: 'validated',
      validationStatusRecorded: true,
      specificityData: { ok: true },
    });
  });

  it('accepts the snake_case dialect a caller may have supplied verbatim', () => {
    expect(
      normalizeMethodPayload({ method_name: 'KF water', validation_status: 'verified' }),
    ).toMatchObject({ methodName: 'KF water', validationStatus: 'verified' });
  });

  it('marks an ABSENT validation status as not recorded, not as unvalidated', () => {
    const m = normalizeMethodPayload({ methodName: 'HPLC assay', purpose: 'assay' });

    expect(m.validationStatus).toBe('');
    expect(m.validationStatusRecorded).toBe(false);
  });

  it('treats a blank status string as not recorded either', () => {
    expect(normalizeMethodPayload({ methodName: 'X', validationStatus: '   ' })
      .validationStatusRecorded).toBe(false);
  });

  it('does not invent a status from an unrelated field', () => {
    // 'status' is accepted as a last resort because the register carries it,
    // but nothing else may stand in for a validation status.
    expect(normalizeMethodPayload({ methodName: 'X', methodType: 'chromatographic' })
      .validationStatus).toBe('');
  });
});

describe('loadProjectAnalyticalMethods — availability is part of the answer', () => {
  it('returns the project’s methods when the store has them', async () => {
    const r = await loadProjectAnalyticalMethods(
      poolOf([methodRow({ methodName: 'HPLC assay', validationStatus: 'validated' })]),
      7,
      'a-project',
    );

    expect(r.available).toBe(true);
    expect(r.methods).toHaveLength(1);
    expect(r.methods[0].methodName).toBe('HPLC assay');
  });

  it('reports zero methods as a real answer when the project records OTHER sources', async () => {
    // This is what makes "no analytical methods" a fact about methods: the
    // project id demonstrably addresses recorded CMC data.
    const r = await loadProjectAnalyticalMethods(poolOf([otherRow()]), 7, 'a-project');

    expect(r.available).toBe(true);
    expect(r.methods).toEqual([]);
  });

  it('refuses to call an unaddressed project id "no methods"', async () => {
    // The whole point. With nothing recorded for this (org, project) pair, a
    // zero-method answer would be a fact about the id, not about methods — and
    // a regulated ICH Q2 report would have asserted the project has none.
    const r = await loadProjectAnalyticalMethods(poolOf([]), 7, 'not-this-orgs-project');

    expect(r.available).toBe(false);
    expect(r.methods).toEqual([]);
    expect(r.reason).toMatch(/addresses nothing here/);
  });

  it('keeps only the freshest row per source_key', async () => {
    // "Latest wins", mirroring cmc-write-through's upsert. The query orders by
    // version DESC, so the first row for a key is the current one.
    const r = await loadProjectAnalyticalMethods(
      poolOf([
        methodRow({ methodName: 'HPLC assay v2', validationStatus: 'validated' }, 'method:1'),
        methodRow({ methodName: 'HPLC assay v1', validationStatus: 'draft' }, 'method:1'),
      ]),
      7,
      'a-project',
    );

    expect(r.methods).toHaveLength(1);
    expect(r.methods[0].methodName).toBe('HPLC assay v2');
  });

  it('reports a failed read as not evaluable, never as an empty project', async () => {
    const r = await loadProjectAnalyticalMethods(failingPool('connection reset'), 7, 'a-project');

    expect(r.available).toBe(false);
    expect(r.methods).toEqual([]);
    expect(r.reason).toMatch(/connection reset/);
  });

  it('refuses an unscoped read rather than running one', async () => {
    // A tenant id that is not a positive integer is not a tenant scope. The
    // read must not happen at all.
    for (const badOrg of [0, -1, Number.NaN]) {
      const r = await loadProjectAnalyticalMethods(poolOf([methodRow({})]), badOrg, 'p');
      expect(r.available).toBe(false);
      expect(r.reason).toMatch(/positive integer/);
    }

    const noProject = await loadProjectAnalyticalMethods(poolOf([methodRow({})]), 7, '');
    expect(noProject.available).toBe(false);
    expect(noProject.reason).toMatch(/projectId is required/);
  });

  it('names the source type the write-through actually writes', () => {
    // A drift here reads every project as having no methods.
    expect(METHOD_SOURCE_TYPE).toBe('method');
  });
});

/**
 * The specification approval gate the screen had been promising.
 *
 * The Specifications tab said, in its banner and in its tab copy, that "a
 * limit whose method is not validated cannot be approved (ICH Q2)". The
 * approve route never looked at the method, and the screen's own check was
 * `!method` — "no name typed" — which a method still in `development` passes.
 * These cases pin BOTH halves: the refusals the promise requires, and the
 * three non-refusals that keep it from blocking legitimate work.
 */
describe('specificationMethodVerdict — a limit is approved only on a procedure shown fit', () => {
  const available = (methods: Array<Record<string, unknown>>) =>
    ({ available: true as const, methods: methods.map((m) => normalizeMethodPayload(m)) });

  it('refuses a limit that names no method at all', () => {
    const v = specificationMethodVerdict('', available([]));
    expect(v.approve).toBe(false);
    expect(v).toMatchObject({ code: 'METHOD_NOT_NAMED' });
    expect((v as { message: string }).message).toMatch(/no analytical method/i);
  });

  it('refuses a limit whose named method is recorded as still in development', () => {
    const v = specificationMethodVerdict('SE-HPLC', available([
      { methodName: 'SE-HPLC', validationStatus: 'development' },
    ]));
    expect(v.approve, 'a method in development supported an approved limit').toBe(false);
    expect(v).toMatchObject({ code: 'METHOD_NOT_FIT' });
    // The refusal names the method and the status, so the signer knows what to fix.
    expect((v as { message: string }).message).toMatch(/SE-HPLC/);
    expect((v as { message: string }).message).toMatch(/development/);
  });

  it('refuses a retired method the same way', () => {
    const v = specificationMethodVerdict('AM-014', available([{ methodName: 'AM-014', validationStatus: 'retired' }]));
    expect(v).toMatchObject({ approve: false, code: 'METHOD_NOT_FIT' });
  });

  it('approves when the named method is validated, and says so', () => {
    const v = specificationMethodVerdict('SE-HPLC', available([
      { methodName: 'SE-HPLC', validationStatus: 'validated' },
    ]));
    expect(v).toMatchObject({ approve: true });
    expect((v as { note: string }).note).toMatch(/validated/);
  });

  it('approves a VALIDATED vocabulary word with no further ceremony on the record', () => {
    /* `verified` and `transferred` are METHOD_VALIDATED, not suitability: a
       compendial procedure verified for this product, or one transferred from
       another site, is validated. These are reachable only through the signed
       Validate act, as `validated` is, so the gate reads the word. */
    for (const status of ['validated', 'verified', 'transferred']) {
      expect(specificationMethodVerdict('M', available([{ methodName: 'M', validationStatus: status }])), status)
        .toMatchObject({ approve: true });
    }
  });

  it('refuses a method the register does not hold, and says to record it', () => {
    /* A compendial procedure is NOT an exception: the register records and
       verifies one like any other, and `verified` / `transferred` are statuses
       this vocabulary already carries for exactly that. An approved
       specification is a filed commitment, so the bar is that the product can
       SHOW the procedure is fit — not merely that it has not been shown unfit. */
    const v = specificationMethodVerdict('USP <711> Dissolution', available([
      { methodName: 'SE-HPLC', validationStatus: 'validated' },
    ]));
    expect(v).toMatchObject({ approve: false, code: 'METHOD_NOT_IN_REGISTER' });
    expect((v as { message: string }).message).toMatch(/not recorded in this project/i);
    expect((v as { message: string }).message, 'the refusal does not say what to do').toMatch(/compendial/i);
  });

  it('refuses a method whose status was never recorded', () => {
    const v = specificationMethodVerdict('SE-HPLC', available([{ methodName: 'SE-HPLC' }]));
    expect(v).toMatchObject({ approve: false, code: 'METHOD_NOT_FIT' });
    expect((v as { message: string }).message).toMatch(/records no validation status/i);
  });

  it('refuses when the register could not be read, as an outage rather than a data fault', () => {
    /* A limit is not approved on a procedure nobody could verify. The words
       matter: this is not the signer's data being wrong, and the message says
       so and says to try again. */
    const v = specificationMethodVerdict('SE-HPLC', { available: false, methods: [], reason: 'connection reset' });
    expect(v).toMatchObject({ approve: false, code: 'METHOD_NOT_VERIFIABLE' });
    expect((v as { message: string }).message).toMatch(/could not be read/i);
    expect((v as { message: string }).message).toMatch(/connection reset/);
    expect((v as { message: string }).message).toMatch(/try again/i);
  });

  it('matches the name exactly, never by substring', () => {
    /* A refusal must name the method the user actually meant. "HPLC" is not
       "SE-HPLC", so it is refused as absent from the register — never as
       SE-HPLC's development status, which is a different fact about a
       different procedure. */
    const v = specificationMethodVerdict('HPLC', available([{ methodName: 'SE-HPLC', validationStatus: 'development' }]));
    expect(v).toMatchObject({ approve: false, code: 'METHOD_NOT_IN_REGISTER' });
    expect((v as { message: string }).message, 'the refusal reported another method’s status').not.toMatch(/development/);
  });

  it('compares the name and the status case-insensitively and trimmed', () => {
    const v = specificationMethodVerdict('  se-hplc ', available([{ methodName: 'SE-HPLC', validationStatus: ' Validated ' }]));
    expect(v).toMatchObject({ approve: true });
  });
});

/* ── P-110 item 1: suitability is a signed act (2026-11-09) ─────────────────
   Its own describe because the one above crossed the 100-line cap. */
describe('specificationMethodVerdict — suitability is read from the signature', () => {
  const available = (methods: Array<Record<string, unknown>>) =>
    ({ available: true as const, methods: methods.map((m) => normalizeMethodPayload(m)) });

  /* ── P-110 item 1 (2026-11-09) ─────────────────────────────────────────────
     The case below used to read "keeps SUITABLE passing on purpose", and said:
     "This case exists so that tightening the gate to validated only is a
     deliberate act with a red test, not a quiet edit." P-110 is that
     deliberate act, decided by the coordinating session under the founder's
     delegation of 2026-11-08, on this lane's own finding that the gate
     honoured a suitable status no form could record.

     The decision does not tighten to validated-only. It makes suitability a
     SIGNED outcome and refuses the unsigned word, including as an interim. */
  it('refuses a SUITABLE status that carries no signature — the unsigned word', () => {
    for (const status of ['qualified', 'suitable', 'phase-appropriate', 'fit for purpose']) {
      const v = specificationMethodVerdict('M', available([{ methodName: 'M', validationStatus: status }]));
      expect(v.approve, `an unsigned "${status}" supported an approved limit`).toBe(false);
      expect(v, status).toMatchObject({ code: 'METHOD_NOT_FIT' });
      /* The refusal says what is missing — who attested it, and when — not
         that the status is wrong. The status may well be right. */
      expect((v as { message: string }).message, status).toMatch(/not a signed act/i);
      expect((v as { message: string }).message, status).toMatch(/who attested/i);
    }
  });

  it('approves the same SUITABLE status once the register carries the signature', () => {
    const v = specificationMethodVerdict('M', available([
      { methodName: 'M', validationStatus: 'phase-appropriate', validatedBy: 7, validationDate: '2026-11-09T10:00:00Z' },
    ]));
    expect(v, 'a signed suitability was refused, which blocks legitimate early-phase work').toMatchObject({
      approve: true,
    });
    expect((v as { note: string }).note).toMatch(/under signature/);
  });

  it('needs BOTH halves of the signature, because one alone is not a signed act', () => {
    const signerOnly = specificationMethodVerdict('M', available([
      { methodName: 'M', validationStatus: 'qualified', validatedBy: 7 },
    ]));
    const dateOnly = specificationMethodVerdict('M', available([
      { methodName: 'M', validationStatus: 'qualified', validationDate: '2026-11-09T10:00:00Z' },
    ]));
    expect(signerOnly).toMatchObject({ approve: false, code: 'METHOD_NOT_FIT' });
    expect(dateOnly).toMatchObject({ approve: false, code: 'METHOD_NOT_FIT' });
  });

  it('reads the signature in both payload dialects', () => {
    /* The write-through stores camelCase; a caller may have supplied the
       snake_case column names verbatim. normalizeMethodPayload accepts both
       everywhere else, and must here too, or a signed method reads unsigned. */
    expect(
      specificationMethodVerdict('M', available([
        { methodName: 'M', validation_status: 'qualified', validated_by: 7, validation_date: '2026-11-09T10:00:00Z' },
      ])),
    ).toMatchObject({ approve: true });
  });

  it('still refuses a status outside the vocabulary, signed or not', () => {
    /* A signature does not make `development` fit. The signature answers
       "was this attested?", not "what was attested?". */
    const v = specificationMethodVerdict('M', available([
      { methodName: 'M', validationStatus: 'development', validatedBy: 7, validationDate: '2026-11-09T10:00:00Z' },
    ]));
    expect(v).toMatchObject({ approve: false, code: 'METHOD_NOT_FIT' });
    expect((v as { message: string }).message).toMatch(/neither validated nor shown suitable/i);
  });
});
