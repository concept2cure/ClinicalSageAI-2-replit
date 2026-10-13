/**
 * What Module 3 this platform composes, and what it refuses.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The CMC module composes small-molecule Module 3 for a US IND — the scope the
 * launch decision ships (P-28, 2026-10-05) and the scope the composer was
 * built and verified against. Everything outside it was composed anyway, with
 * content that is wrong rather than merely incomplete:
 *
 *   • a biologic or ATMP substance got ICH Q3A impurity reasoning, with no Q6B
 *     specification model, no Q5A(R2) viral safety, no Q5C stability and no
 *     cell-bank section;
 *   • an NDA / ANDA / BLA got 3.2.R location statements that are false for a
 *     marketing application, no §3.2.S.4.5 / §3.2.P.5.6 justification of
 *     specification, and 3-level granularity where 4 is required;
 *   • an EU or Health Canada CTA got CTD Module 3, which is not an IMPD
 *     Quality part;
 *   • a Japanese CTN / J-NDA got no regional section for its jurisdiction.
 *
 * The staff simulation itself ran against a monoclonal antibody — modality
 * `biologic`, route "CHO cell culture", INN `belantezumab` — and composed a
 * small-molecule Module 3 for it without a word of complaint.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • one modality rule, shared with §3.2.A.2: explicit either way, any
 *     biological signal reads biologic, a recorded chemical process with no
 *     such signal reads small molecule, and nothing recorded is `unknown`
 *     rather than an assumed small molecule;
 *   • the simulation's own mAb is refused, on each of the four signals that
 *     identify it independently;
 *   • a US IND composes; an NDA, a BLA, an EU CTA and a Health Canada CTA do
 *     not; a program with no submission spine yet does;
 *   • every refusal carries a code and names the path that does author it;
 *   • a spine that cannot be read refuses rather than composing on an
 *     unestablished application type.
 */

import { describe, expect, it } from 'vitest';

import {
  applicationNotReadable,
  compositionRefusal,
  compositionRefusalBody,
  CompositionOutOfScopeError,
  isCompositionOutOfScope,
} from '../composition-scope';
import { classifySubstanceModality } from '../substance-modality';
import type { CanonicalSource } from '../../module3Composer';

/** A drug-substance source, as `cmc_source_objects` holds it. */
function substance(payload: Record<string, unknown>): CanonicalSource {
  return { id: 'ds-1', sourceType: 'drug_substance', sourcePayload: payload } as unknown as CanonicalSource;
}

/** The small molecule the shipping scope is for. */
const SMALL_MOLECULE = substance({
  name: 'BX-701',
  manufacturingRoute: 'Three-step chemical synthesis from 2-aminopyridine; isolated by crystallisation',
});

/** The simulation's own substance: a monoclonal antibody. */
const THE_SIMULATION_MAB = substance({
  name: 'belantezumab',
  manufacturingRoute: 'CHO cell culture',
  modality: 'biologic',
  biologicalOrigin: 'CHO cell culture, fed-batch',
  cellLine: 'CHO-K1; MCB lot MCB-2401, WCB lot WCB-2403',
  sourceOrganism: 'Cricetulus griseus (Chinese hamster ovary)',
});

// ── The modality rule ───────────────────────────────────────────────────────

describe('classifySubstanceModality — one rule, shared with §3.2.A.2', () => {
  it('honours an explicit modality, either way', () => {
    expect(classifySubstanceModality({ modality: 'small_molecule' })).toMatchObject({
      modality: 'small_molecule',
      explicit: true,
    });
    expect(classifySubstanceModality({ modality: 'biologic' })).toMatchObject({
      modality: 'biologic',
      explicit: true,
    });
    expect(classifySubstanceModality({ molecularType: 'biological' })).toMatchObject({ modality: 'biologic' });
  });

  it('reads any biological signal as biologic, and says which one', () => {
    for (const [field, value] of [
      ['biologicalOrigin', 'CHO cell culture'],
      ['cellLine', 'CHO-K1'],
      ['sourceOrganism', 'E. coli K12'],
      ['viralSafetyEvaluation', 'Two orthogonal clearance steps per Q5A(R2)'],
      ['tseStatus', 'Animal-component-free media'],
    ] as const) {
      const v = classifySubstanceModality({ name: 'X-1', [field]: value });
      expect(v.modality, `${field} did not read as biologic`).toBe('biologic');
      expect(v.basis).toMatch(/recorded/);
    }
  });

  it('catches an expression system in the route, and an INN stem in the name', () => {
    expect(classifySubstanceModality({ manufacturingRoute: 'CHO cell culture' }).modality).toBe('biologic');
    expect(classifySubstanceModality({ name: 'belantezumab' }).modality).toBe('biologic');
    expect(classifySubstanceModality({ processDescription: 'Fermentation in Pichia pastoris' }).modality).toBe(
      'biologic',
    );
  });

  it('does not fire on a chemical substance whose text incidentally says tissue or plasma', () => {
    expect(
      classifySubstanceModality({
        name: 'BX-701',
        manufacturingRoute: 'Chemical synthesis; plasma etching of the reactor surface; tissue paper filtration',
        modality: 'small_molecule',
      }).modality,
    ).toBe('small_molecule');
  });

  it('reads a recorded chemical process with no biological signal as a small molecule', () => {
    expect(classifySubstanceModality({ manufacturingRoute: 'Three-step chemical synthesis' })).toMatchObject({
      modality: 'small_molecule',
      explicit: false,
    });
  });

  it('reads NOTHING recorded as unknown — never as an assumed small molecule', () => {
    expect(classifySubstanceModality({ name: 'BX-701' })).toMatchObject({ modality: 'unknown' });
    expect(classifySubstanceModality({})).toMatchObject({ modality: 'unknown' });
  });
});

// ── The boundary ────────────────────────────────────────────────────────────

describe('the product class the person recorded is asked first', () => {
  it('refuses a biologic, a device, an IVD and a combination product', () => {
    for (const declared of ['biologic', 'device', 'ivd', 'combination']) {
      const refusal = compositionRefusal([SMALL_MOLECULE], 'ind', declared);
      expect(refusal?.code, declared).toBe('CMC_PRODUCT_CLASS_OUT_OF_SCOPE');
      expect(refusal!.message).toContain(declared);
      expect(refusal!.productType).toBe(declared);
    }
  });

  it('refuses a program recorded as a biologic even while its substance register says small molecule', () => {
    // The class is the sponsor's own statement (P-21); the register does not
    // overrule it, and the two disagreeing is itself a reason to refuse.
    expect(compositionRefusal([SMALL_MOLECULE], 'ind', 'biologic')?.code).toBe(
      'CMC_PRODUCT_CLASS_OUT_OF_SCOPE',
    );
  });

  it('composes a program recorded as a drug', () => {
    expect(compositionRefusal([SMALL_MOLECULE], 'ind', 'drug')).toBeNull();
  });

  it('falls through to the substance record when no class is recorded (pre-P-21 data)', () => {
    expect(compositionRefusal([SMALL_MOLECULE], 'ind', null)).toBeNull();
    expect(compositionRefusal([THE_SIMULATION_MAB], 'ind', '')?.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
  });
});

describe('compositionRefusal — small-molecule US IND, and nothing else', () => {
  it('composes a small molecule for a US IND, however the type is cased', () => {
    expect(compositionRefusal([SMALL_MOLECULE], 'ind')).toBeNull();
    expect(compositionRefusal([SMALL_MOLECULE], 'IND')).toBeNull();
  });

  it('composes for an IND program that has no submission row yet', () => {
    // The program's own declared type is the answer when no spine exists.
    expect(compositionRefusal([SMALL_MOLECULE], 'IND')).toBeNull();
  });

  it('refuses a CTA or NDA program that has no submission row yet', () => {
    /* The hole this closes: `resolveSubmissionSpine` returns null for a
       program with no `submissions` row, and a boundary that waved that
       through let a CTA compose CTD Module 3 — which is not an IMPD Quality
       part — simply because nothing had been filed yet. */
    for (const declared of ['CTA', 'NDA', 'BLA', 'ANDA', 'MAA', 'JNDA']) {
      expect(compositionRefusal([SMALL_MOLECULE], declared)?.code, declared).toBe(
        'CMC_APPLICATION_OUT_OF_SCOPE',
      );
    }
  });

  it('refuses when the program row itself could not be read', () => {
    // program_type is NOT NULL, so an empty answer is an unreadable row.
    expect(compositionRefusal([SMALL_MOLECULE], null)?.code).toBe('CMC_APPLICATION_NOT_READABLE');
  });

  it('refuses the simulation’s own monoclonal antibody', () => {
    const refusal = compositionRefusal([THE_SIMULATION_MAB], 'ind');
    expect(refusal, 'a small-molecule Module 3 was composed for a mAb').not.toBeNull();
    expect(refusal!.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
    expect(refusal!.message).toMatch(/Q6B/);
    expect(refusal!.message).toMatch(/Q5A\(R2\)/);
    expect(refusal!.message).toMatch(/Q3A/);
  });

  it('refuses a biologic on each signal alone, so one missing field does not open the door', () => {
    for (const payload of [
      { name: 'X-1', modality: 'biologic' },
      { name: 'X-1', cellLine: 'CHO-K1' },
      { name: 'X-1', manufacturingRoute: 'CHO cell culture' },
      { name: 'belantezumab' },
    ]) {
      expect(compositionRefusal([substance(payload)], 'ind')?.code, JSON.stringify(payload)).toBe(
        'CMC_MODALITY_OUT_OF_SCOPE',
      );
    }
  });

  it('refuses a substance whose modality the record does not establish, and asks for the route', () => {
    const refusal = compositionRefusal([substance({ name: 'BX-701' })], 'ind');
    expect(refusal!.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
    expect(refusal!.message).toMatch(/Record the manufacturing route/);
    // Not an assumption either way.
    expect(refusal!.message).toMatch(/not a question this platform will answer by assumption/);
  });

  it('refuses a program that records no drug substance at all, and says so differently', () => {
    const refusal = compositionRefusal([], 'ind');
    expect(refusal!.code).toBe('CMC_MODALITY_NOT_ESTABLISHED');
    expect(refusal!.message).toMatch(/records no drug substance/);
  });

  it('refuses every application that is not a US IND', () => {
    for (const filed of ['nda', 'anda', 'bla', 'maa', 'cta', 'ctn', 'jnda']) {
      const refusal = compositionRefusal([SMALL_MOLECULE], filed);
      expect(refusal?.code, filed).toBe('CMC_APPLICATION_OUT_OF_SCOPE');
      expect(refusal!.message).toContain(filed.toUpperCase());
      expect(refusal!.applicationType).toBe(filed);
      // The remedy is not "fix the application type" — it is author it elsewhere.
      expect(refusal!.message).toContain('Document editor & authoring');
    }
  });

  it('says what a marketing application needs that is not produced here', () => {
    const refusal = compositionRefusal([SMALL_MOLECULE], 'nda');
    expect(refusal!.message).toMatch(/3\.2\.S\.4\.5/);
    expect(refusal!.message).toMatch(/3\.2\.P\.5\.6/);
    expect(refusal!.message).toMatch(/4-level/);
    expect(refusal!.message).toMatch(/IMPD Quality part/);
  });

  it('judges the modality BEFORE the application — the substance is the stronger refusal', () => {
    // A biologic under an NDA is refused as a biologic: fixing the application
    // type would not make it composable.
    expect(compositionRefusal([THE_SIMULATION_MAB], 'nda')!.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
  });

  it('judges the NEWEST drug substance, as the source read orders them', () => {
    // loadCanonicalSources orders by updated_at DESC, so the first drug
    // substance is the most recently recorded one.
    const sources = [THE_SIMULATION_MAB, SMALL_MOLECULE];
    expect(compositionRefusal(sources, 'ind')!.code).toBe('CMC_MODALITY_OUT_OF_SCOPE');
  });
});

describe('every refusal names the path that does author it', () => {
  it('points at Authoring, Vault and the Submission center', () => {
    for (const refusal of [
      compositionRefusal([THE_SIMULATION_MAB], 'ind')!,
      compositionRefusal([SMALL_MOLECULE], 'nda')!,
    ]) {
      expect(refusal.message).toContain('Document editor & authoring');
      expect(refusal.message).toContain('Vault (DMS)');
      expect(refusal.message).toContain('Submission center');
    }
  });

  it('carries the code and the hint in the 409 body', () => {
    const body = compositionRefusalBody(compositionRefusal([THE_SIMULATION_MAB], 'ind')!);
    expect(body).toMatchObject({ success: false, code: 'CMC_MODALITY_OUT_OF_SCOPE' });
    expect(body.hint).toContain('Submission center');
  });
});

describe('a refusal cannot be mistaken for an empty result', () => {
  it('is a typed error, recognised by its own guard', () => {
    const err = new CompositionOutOfScopeError(compositionRefusal([THE_SIMULATION_MAB], 'ind')!);
    expect(isCompositionOutOfScope(err)).toBe(true);
    expect(isCompositionOutOfScope(new Error('something else'))).toBe(false);
    // The message is the refusal's, so an unhandled throw still says why.
    expect(err.message).toMatch(/biologically derived/);
  });

  it('an unreadable submission refuses rather than composing on an unestablished application', () => {
    const refusal = applicationNotReadable('connection terminated');
    expect(refusal.code).toBe('CMC_APPLICATION_NOT_READABLE');
    expect(refusal.message).toMatch(/not established/);
    expect(refusal.message).toMatch(/connection terminated/);
    // Not "out of scope" — nothing is wrong with the program.
    expect(refusal.message).not.toMatch(/not composed here/);
  });
});
