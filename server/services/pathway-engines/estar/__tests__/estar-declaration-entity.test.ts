/**
 * The Declaration of Conformity must name the entity the governed record names.
 *
 * THE DEFECT THIS FILE EXISTS FOR. `ESTAR_TEMPLATE_RECOMPUTED_FIELDS` records
 * `declarationCompanyName` with `rebuildOutcome: 'substitutes'` and calls it
 * "the dangerous case: the cell is not blank, it is wrong." It was recorded and
 * nothing acted on it: `fillEstarSubmission` wrote
 * `estar_registrations.declaration_company_name` into `DoC.DCTextField120`,
 * returned `filled: true` with no blocker, and the route delivered, retained and
 * registered that PDF as "Module 1 / official FDA eSTAR (submittable)".
 *
 * What the template does with that cell, read out of the vendored
 * `eSTAR-510k-non-ivd.pdf` itself (`AdministrativeInformation.ApplicantInformation
 * <variables> Functions.Validation()`, called from fourteen field `exit`
 * handlers in the applicant block):
 *
 *     //FDA: default
 *     AdministrativeDocumentation.DoC.DCTextField120.rawValue = "";
 *     ...
 *     //FDA: Fill in DoC
 *     if (AdministrativeInformation.ApplicantInformation.ADTextField210.rawValue != null)
 *       {AdministrativeDocumentation.DoC.DCTextField120.rawValue =
 *        AdministrativeInformation.ApplicantInformation.ADTextField210.rawValue}//applicant name
 *
 * `ADTextField210` is `applicantCompanyName`. So the applicant's first tab out of
 * any field in their own block replaces the declaring entity with the applicant,
 * and the Declaration of Conformity in a submitted device filing then attests in
 * the name of a legal entity that did not make it.
 *
 * WHY A REFUSAL AND NOT A WARNING. There is no writable source that holds a
 * second entity — the clear is unconditional and the rebuild reads the applicant
 * block by design — so the only outcomes are "refuse" and "hand over a false
 * attestation". WHY IT IS NARROW. `declarationCompanyName` falls back to
 * `client_workspaces.name` then `organizations.name`, which is exactly what
 * `applicantCompanyName` resolves to, so the ordinary filing has the two equal
 * and the rebuild rewrites the cell with an identical string. Refusing every
 * filing would block the common case for nothing; the refusal is on DIVERGENCE.
 *
 * EXACTLY WHAT THE GATE COVERS (corrected 2026-09-08 — it used to claim more
 * than it did). A declaring entity is refused when it is written and the
 * applicant company either (a) is written and differs, or (b) is not written at
 * all — because FDA's clear fires regardless and the applicant's own first entry
 * of their company name, which the form requires, rebuilds the cell in their
 * name. Case (b) answered 'erased' and raised no blocker until this date, so the
 * form went out attesting in a name the applicant's next keystroke would
 * replace. Nothing is refused when the two names agree, and nothing is refused
 * for a filing that writes no declaring entity.
 *
 * AND IT SEES THE VALUE THE WRITER WILL WRITE, not only a string: `toText()` in
 * `fill-official-pdf.ts` ends `return String(value)` and the route's schema is
 * `data: z.record(z.unknown())`, so `['Declaring Entity GmbH']` reached the cell
 * as text while the gate read "not a string, nothing written" and let it
 * through. See {@link estarCellText} and the P1 block below.
 *
 * @module server/services/pathway-engines/estar/__tests__/estar-declaration-entity.test
 */

import { describe, it, expect } from 'vitest';
import fsSync from 'fs';
import path from 'path';
import { fillEstarSubmission } from '../estar-fill';
import {
  ESTAR_FIELD_MAPS,
  ESTAR_TEMPLATE_RECOMPUTED_FIELDS,
  assessEstarTemplateRebuild,
  estarCellText,
  ESTAR_UNRENDERABLE_VALUE,
} from '../estar-field-map';
import { resolveOfficialEstarFields, reportOfficialEstarFill } from '../estar-administrative-data';
import { readXfaDatasetsValues } from '../../../forms/fill-official-pdf';

const TEMPLATE_DIR = path.resolve(process.cwd(), 'assets/estar-templates');
const NIVD = path.resolve(TEMPLATE_DIR, 'eSTAR-510k-non-ivd.pdf');
const IVD = path.resolve(TEMPLATE_DIR, 'eSTAR-510k-ivd.pdf');

/** The applicant company the form's own rebuild will put in the DoC cell. */
const APPLICANT = 'Acme Devices, Inc.';
/** A DIFFERENT declaring entity — the case `declaration_company_name` exists for. */
const DECLARANT = 'Declaring Entity GmbH';

/** Enough to make a producible fill, plus the two company names under test. */
function fillData(declarationCompanyName: string): Record<string, string> {
  return {
    deviceTradeName: 'AcuSense CGM System',
    declarationDeviceTradeName: 'AcuSense CGM System',
    applicantCompanyName: APPLICANT,
    applicantContactEmail: 'ra@acme.example',
    declarationCompanyName,
  };
}

const withTemplates = fsSync.existsSync(NIVD) && fsSync.existsSync(IVD);

describe.skipIf(!withTemplates)('fillEstarSubmission — the Declaration of Conformity entity', () => {
  it('REFUSES to produce the eSTAR when the declaring entity is not the applicant', async () => {
    const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: fillData(DECLARANT) });

    expect(r.filled).toBe(false);
    expect(r.pdfBytes).toBeUndefined();
    // A blocker, not a warning: nothing downstream retains or registers this.
    expect(r.blockers).toHaveLength(1);
    const [blocker] = r.blockers;
    // It names BOTH entities, so the operator can see which one the form would file.
    expect(blocker).toContain(DECLARANT);
    expect(blocker).toContain(APPLICANT);
    // And both canonical keys, so the remedy is unambiguous.
    expect(blocker).toContain('declarationCompanyName');
    expect(blocker).toContain('applicantCompanyName');
  });

  it('produces the eSTAR when the declaring entity IS the applicant (positive control)', async () => {
    const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: fillData(APPLICANT) });

    expect(r.blockers).toEqual([]);
    expect(r.filled).toBe(true);
    expect(r.pdfBytes).toBeDefined();
    const map = ESTAR_FIELD_MAPS['510k-device'];
    const back = await readXfaDatasetsValues(r.pdfBytes!, [
      map.declarationCompanyName.xfaSomPath!,
      map.applicantCompanyName.xfaSomPath!,
    ]);
    // The rebuild copies ADTextField210 into DCTextField120; identical strings,
    // so what the applicant sees after their first tab is what we wrote.
    expect(back[map.declarationCompanyName.xfaSomPath!]).toBe(APPLICANT);
    expect(back[map.applicantCompanyName.xfaSomPath!]).toBe(APPLICANT);
  });

  it('refuses on every pathway and both families — the DoC cell is pathway-neutral', async () => {
    for (const [type, variant] of [
      ['510k', 'ivd'],
      ['de_novo', 'device'],
      ['pma', 'device'],
    ] as const) {
      const r = await fillEstarSubmission({ type, variant, data: fillData(DECLARANT) });
      expect(r.filled, `${type}/${variant} must refuse`).toBe(false);
      expect(r.blockers.join(' '), `${type}/${variant} names both entities`).toContain(DECLARANT);
    }
  });
});

describe('assessEstarTemplateRebuild — the measured table, evaluated against real values', () => {
  const MAP = ESTAR_FIELD_MAPS['510k-device'];

  it('is silent when the declaring entity equals the applicant', () => {
    const findings = assessEstarTemplateRebuild(MAP, fillData(APPLICANT));
    expect(findings.filter((f) => f.key === 'declarationCompanyName')).toEqual([]);
  });

  it('names the substituting key and both values when they differ', () => {
    const findings = assessEstarTemplateRebuild(MAP, fillData(DECLARANT));
    expect(findings.filter((f) => f.effect === 'substituted')).toEqual([
      {
        key: 'declarationCompanyName',
        effect: 'substituted',
        caption: MAP.declarationCompanyName.caption,
        somPath: MAP.declarationCompanyName.xfaSomPath,
        substitutedByKey: 'applicantCompanyName',
        substitutedByCaption: MAP.applicantCompanyName.caption,
        writtenValue: DECLARANT,
        survivingValue: APPLICANT,
      },
    ]);
  });

  /*
   * SPLIT ON 2026-09-08. This was ONE assertion — "nothing writes the source ⇒
   * erased" — and it conflated two different facts under one phrase. "Nothing
   * writes the source" can mean the MAP has no key for it (a real erasure: no
   * value of ours can ever reach FDA's guarded refill, so the cell goes blank),
   * or it can mean the map DOES write it and this FILL left it blank — which is
   * not a blank cell at all. FDA's clear is unconditional and its refill is
   * guarded, so the delivered form still shows our value and the applicant's
   * first entry of their own company name takes the cell. Calling that an
   * erasure is what let the refusal skip it. Two claims, two tests.
   */
  it('is a DEFERRED substitution when the map writes the source but this fill left it blank', () => {
    const noApplicant = fillData(DECLARANT);
    delete (noApplicant as Record<string, unknown>).applicantCompanyName;
    const findings = assessEstarTemplateRebuild(MAP, noApplicant);
    expect(findings.filter((f) => f.key === 'declarationCompanyName')).toEqual([
      {
        key: 'declarationCompanyName',
        effect: 'substituted-on-entry',
        caption: MAP.declarationCompanyName.caption,
        somPath: MAP.declarationCompanyName.xfaSomPath,
        substitutedByKey: 'applicantCompanyName',
        substitutedByCaption: MAP.applicantCompanyName.caption,
        writtenValue: DECLARANT,
      },
    ]);
    // No `survivingValue`: nothing survives it yet — that is the whole point.
    expect(findings.find((f) => f.key === 'declarationCompanyName')).not.toHaveProperty('survivingValue');
  });

  it('is a true ERASURE when NOTHING IN THE MAP writes the rebuild source', () => {
    // declarationCompanyAddress is rebuilt from the applicant block's six
    // address parts (ADTextField220..ADDropDownList270). This map writes none of
    // them, so no value of ours can reach the refill: the cell goes blank.
    expect(MAP.declarationCompanyAddress).toBeDefined();
    const findings = assessEstarTemplateRebuild(MAP, {
      ...fillData(APPLICANT),
      declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
    });
    expect(findings.find((f) => f.key === 'declarationCompanyAddress')?.effect).toBe('erased');
    expect(findings.filter((f) => f.effect === 'substituted')).toEqual([]);
    expect(findings.filter((f) => f.effect === 'substituted-on-entry')).toEqual([]);
  });

  it('reports every value the form erases, and only those it really does erase', () => {
    // Every mapped key carries a value, so nothing is missed for being blank.
    const all = Object.fromEntries(Object.keys(MAP).map((k) => [k, `v-${k}`]));
    const erased = assessEstarTemplateRebuild(MAP, all)
      .filter((f) => f.effect === 'erased')
      .map((f) => f.key)
      .sort();
    /*
     * The six cells the form's OWN recomputation clears and refills from a
     * source this map does not write. `declarationCompanyName` is not here: with
     * both company names present and different it is SUBSTITUTED, which is the
     * separate, worse finding asserted above.
     */
    expect(erased).toEqual([
      'applicantContactTelephone',
      'correspondentTelephone',
      'declarationCompanyAddress',
      'deviceClassificationName',
      'deviceCommonName',
      'regulationNumber',
    ]);
    /*
     * WHY THE PREDICATE PAIR IS NOT HERE, though both carry
     * `rebuildOutcome: 'blanks'`. Their `rebuiltFrom` is null and their only
     * writer is `PredicatesSE.PredicateReference.DeletePredicate [click]` — the
     * applicant explicitly deleting the predicate. Nothing recomputes them, so
     * calling them erased would tell a filer their predicate had been dropped
     * from a form that still holds it, and a warning that cries wolf is how the
     * six real ones get ignored.
     */
    for (const key of ['predicateSubmissionNumber', 'predicateDeviceTradeName']) {
      expect(ESTAR_TEMPLATE_RECOMPUTED_FIELDS[key].rebuildOutcome).toBe('blanks');
      expect(ESTAR_TEMPLATE_RECOMPUTED_FIELDS[key].rebuiltFrom).toBeNull();
      expect(erased).not.toContain(key);
    }
  });

  it('says nothing about a key that was mapped but not written (positive control)', () => {
    // deviceCommonName is erased when written; absent, there is nothing to lose.
    const findings = assessEstarTemplateRebuild(MAP, { deviceTradeName: 'AcuSense' });
    expect(findings.map((f) => f.key)).toEqual([]);
  });
});

describe.skipIf(!withTemplates)('fillEstarSubmission — what the caller is told about erased values', () => {
  it('names the written values the form will erase, instead of counting them as filled and stopping', async () => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: {
        ...fillData(APPLICANT),
        deviceCommonName: 'Continuous glucose monitor',
        declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
      },
    });

    expect(r.filled).toBe(true);
    // They ARE written — that is why they are in filledFields — and they will
    // not survive, which is why they are named here too.
    expect(r.filledFields).toContain('deviceCommonName');
    expect(r.filledFields).toContain('declarationCompanyAddress');
    expect(r.erasedFields.sort()).toEqual(['declarationCompanyAddress', 'deviceCommonName']);
    expect(r.warnings.some((w) => w.includes('deviceCommonName'))).toBe(true);
  });

  it('reports no erasure for a fill whose written values all survive (positive control)', async () => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceTradeName: 'AcuSense CGM System', declarationDeviceTradeName: 'AcuSense CGM System' },
    });
    expect(r.filled).toBe(true);
    expect(r.erasedFields).toEqual([]);
  });
});

describe('reportOfficialEstarFill — the field report says the same thing as the fill', () => {
  const MAP = ESTAR_FIELD_MAPS['510k-device'];

  function report(values: Record<string, string>) {
    const resolved = resolveOfficialEstarFields({
      fieldMap: MAP,
      governed: { values, provenance: Object.fromEntries(Object.keys(values).map((k) => [k, 'test'])) },
      honourRequestOverGoverned: false,
    });
    return reportOfficialEstarFill(resolved, Object.keys(values)).fieldReport;
  }

  it('does not cry substitution when the two company names agree', () => {
    // The static table says 'substitutes' for this key on every filing. It is
    // only a substitution when the rebuild puts a DIFFERENT string in the cell.
    expect(report(fillData(APPLICANT)).substitutedByTemplateKeys).toEqual([]);
  });

  it('names it when they do not', () => {
    expect(report(fillData(DECLARANT)).substitutedByTemplateKeys).toEqual(['declarationCompanyName']);
  });

  it('does not report the predicate fields as cleared by the template', () => {
    const r = report({
      predicateSubmissionNumber: 'K203456',
      predicateDeviceTradeName: 'Predicate One',
      deviceCommonName: 'Continuous glucose monitor',
    });
    // Only the cell the form really recomputes.
    expect(r.clearedByTemplateKeys).toEqual(['deviceCommonName']);
  });
});

/* ───────────────────────────────────────────────────────────────────────────
 * THE FOUR DEFECTS AN ADVERSARIAL REVIEW DEMONSTRATED IN THE GATE ABOVE.
 *
 * Each block below reproduces one of them exactly as it was reproduced against
 * the vendored template, so the repair is pinned by the case that broke it.
 * ─────────────────────────────────────────────────────────────────────────── */

describe('P1 — the gate must see the value the WRITER writes, not only a string', () => {
  const MAP = ESTAR_FIELD_MAPS['510k-device'];

  /*
   * `toText()` in `server/services/forms/fill-official-pdf.ts` ends
   * `return String(value)`, so EVERY non-null value reaches a cell as text:
   * `['Declaring Entity GmbH']` lands as `Declaring Entity GmbH`, `12345` as
   * `12345`, `{}` as `[object Object]`. The route's schema is
   * `data: z.record(z.unknown())`, so all three arrive over a plain JSON body.
   *
   * The assessor asked `typeof raw !== 'string'` and answered "no value", so it
   * emitted no finding and the refusal never fired — the exact fail-open the
   * gate exists to close. Verified end-to-end: `declarationCompanyName:
   * ['Declaring Entity GmbH']` with `applicantCompanyName: 'Acme Devices, Inc.'`
   * produced `filled: true`, `blockers: []`, and a DoC cell reading
   * "Declaring Entity GmbH".
   */
  const NON_STRINGS: Array<[string, unknown, string]> = [
    ['a single-element array', [DECLARANT], DECLARANT],
    ['a number', 12345, '12345'],
    ['an object', { name: DECLARANT }, '[object Object]'],
    ['a boolean', true, 'Yes'],
  ];

  it.each(NON_STRINGS)('sees %s exactly as the writer will render it', (_label, raw, rendered) => {
    const findings = assessEstarTemplateRebuild(MAP, {
      ...fillData(APPLICANT),
      declarationCompanyName: raw,
    });
    expect(findings.filter((f) => f.effect === 'substituted')).toEqual([
      {
        key: 'declarationCompanyName',
        effect: 'substituted',
        caption: MAP.declarationCompanyName.caption,
        somPath: MAP.declarationCompanyName.xfaSomPath,
        substitutedByKey: 'applicantCompanyName',
        substitutedByCaption: MAP.applicantCompanyName.caption,
        writtenValue: rendered,
        survivingValue: APPLICANT,
      },
    ]);
  });

  it('sees a non-string APPLICANT company too — the surviving side is rendered the same way', () => {
    // The applicant arrives as an array holding the SAME name: the rebuild puts
    // back an identical string, so there is nothing to report. Reading the
    // surviving side as "no value" would instead have called this an erasure.
    const findings = assessEstarTemplateRebuild(MAP, {
      ...fillData(APPLICANT),
      applicantCompanyName: [APPLICANT],
    });
    expect(findings.filter((f) => f.key === 'declarationCompanyName')).toEqual([]);
  });

  it('treats a value that renders to nothing as unwritten (no finding invented)', () => {
    // `[]` and `{}`-free empties stringify to '', which puts no text in a cell.
    // Nothing of ours is on the form, so nothing of ours is taken away.
    const findings = assessEstarTemplateRebuild(MAP, {
      ...fillData(APPLICANT),
      declarationCompanyName: [],
    });
    expect(findings.filter((f) => f.key === 'declarationCompanyName')).toEqual([]);
  });

  it('does not call surrounding whitespace a different legal entity', () => {
    const findings = assessEstarTemplateRebuild(MAP, {
      ...fillData(`  ${APPLICANT}  `),
    });
    expect(findings.filter((f) => f.key === 'declarationCompanyName')).toEqual([]);
  });
});

describe.skipIf(!withTemplates)('P1 end-to-end — the array case the reviewer filed', () => {
  it('REFUSES the non-string declaring entity against the real vendored template', async () => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { ...fillData(APPLICANT), declarationCompanyName: [DECLARANT] },
    });

    expect(r.filled).toBe(false);
    expect(r.pdfBytes).toBeUndefined();
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toContain(DECLARANT);
    expect(r.blockers[0]).toContain(APPLICANT);
  });

  it.each([
    ['a number', 12345],
    ['an object', { name: DECLARANT }],
  ])('REFUSES %s in the declaring-entity cell as well', async (_label, raw) => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { ...fillData(APPLICANT), declarationCompanyName: raw },
    });
    expect(r.filled).toBe(false);
    expect(r.blockers.join(' ')).toContain(APPLICANT);
  });
});

describe.skipIf(!withTemplates)('P3 — a fill whose every value the form erases is not a fill', () => {
  it('REFUSES when the only written value is one the template clears', async () => {
    // Reviewer's case: `{ deviceCommonName: 'CGM' }` gave filled:true,
    // filledFields:['deviceCommonName'], erasedFields:['deviceCommonName'],
    // blockers:[] — a form that is blank in practice, registered as
    // "Module 1 / official FDA eSTAR (submittable)".
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceCommonName: 'CGM' },
    });

    expect(r.filled).toBe(false);
    expect(r.pdfBytes).toBeUndefined();
    expect(r.blockers.join(' ')).toContain('deviceCommonName');
  });

  it('names WHICH values went and WHY, so the refusal can be acted on', async () => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceCommonName: 'CGM', regulationNumber: '21 CFR 862.1355' },
    });
    expect(r.filled).toBe(false);
    const [blocker] = r.blockers;
    expect(blocker).toContain('deviceCommonName');
    expect(blocker).toContain('regulationNumber');
    expect(blocker).toContain('cleared and rebuilt by the template');
  });

  it('REFUSES a fill whose only written value renders to an EMPTY cell', async () => {
    /*
     * A neighbour of the same defect, reachable the same way. The writer's
     * `hasData` counts `[]` as data — it is neither undefined, null, nor a blank
     * string — and `toText` renders it `String([]) === ''`. So the key was
     * recorded in `filled`, the cell went out blank, and "the fill wrote no
     * values" could not see it: the blank official template was delivered and
     * registered as submittable, exactly as for `data: {}`.
     */
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceTradeName: [] as never },
    });
    expect(r.filledFields).toEqual(['deviceTradeName']); // the writer did "fill" it
    expect(r.filled).toBe(false);
    expect(r.pdfBytes).toBeUndefined();
    expect(r.blockers[0]).toContain('renders to no text at all');
    expect(r.blockers[0]).toContain('deviceTradeName');
  });

  it('still produces the eSTAR when ONE written value survives (positive control)', async () => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceTradeName: 'AcuSense CGM System', deviceCommonName: 'CGM' },
    });

    expect(r.blockers).toEqual([]);
    expect(r.filled).toBe(true);
    expect(r.filledFields.sort()).toEqual(['deviceCommonName', 'deviceTradeName']);
    expect(r.erasedFields).toEqual(['deviceCommonName']);
  });
});

describe.skipIf(!withTemplates)('P4 — the gate covers the unwritten-applicant case too', () => {
  it('REFUSES a declaring entity written beside NO applicant company', async () => {
    /*
     * The delivered form shows the declaring entity in the DoC cell. FDA's
     * `Functions.Validation()` clears that cell unconditionally and refills it
     * `if (ADTextField210.rawValue != null)`, so the applicant's FIRST entry of
     * their own company name — which a 510(k) requires — replaces the declaring
     * entity with the applicant. Same false attestation as the both-written
     * case, deferred by one keystroke.
     */
    const noApplicant = fillData(DECLARANT);
    delete (noApplicant as Record<string, unknown>).applicantCompanyName;

    const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: noApplicant });

    expect(r.filled).toBe(false);
    expect(r.pdfBytes).toBeUndefined();
    expect(r.blockers.join(' ')).toContain(DECLARANT);
    expect(r.blockers.join(' ')).toContain('applicantCompanyName');
    expect(r.blockers.join(' ')).toContain('declarationCompanyName');
  });

  it('does NOT refuse a fill that writes no declaring entity at all (positive control)', async () => {
    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceTradeName: 'AcuSense CGM System', applicantCompanyName: APPLICANT },
    });
    expect(r.blockers).toEqual([]);
    expect(r.filled).toBe(true);
  });
});

describe.skipIf(!withTemplates)('estarCellText — pinned against the writer that actually fills the PDF', () => {
  /*
   * `hasData`, `toText` and `toBoolean` are module-private to
   * `server/services/forms/fill-official-pdf.ts`, so the gate cannot import the
   * normalization it has to agree with. It is therefore PINNED here: each shape
   * is filled into a real cell of the real vendored template and read back, and
   * what comes out must be exactly what `estarCellText` says it will be. If the
   * writer's coercion ever changes, this fails — which is the only thing that
   * keeps the refusal from silently going blind to a shape again.
   *
   * `deviceTradeName` is used deliberately: its rebuildOutcome is 'reproduces',
   * so the gate itself has no opinion about it and cannot mask a mismatch.
   */
  const MAP = ESTAR_FIELD_MAPS['510k-device'];
  const SHAPES: Array<[string, unknown]> = [
    ['a string', 'AcuSense CGM System'],
    ['a single-element array', ['AcuSense CGM System']],
    ['a multi-element array', ['AcuSense', 'CGM']],
    ['a number', 12345],
    ['a boolean', true],
    ['an object', { name: 'AcuSense' }],
    ['a padded string', '  AcuSense CGM System  '],
  ];

  it.each(SHAPES)('renders %s the way the writer does', async (_label, raw) => {
    const predicted = estarCellText(MAP.deviceTradeName, raw);
    expect(typeof predicted).toBe('string');

    const r = await fillEstarSubmission({
      type: '510k',
      variant: 'device',
      data: { deviceTradeName: raw, declarationDeviceTradeName: 'AcuSense CGM System' },
    });
    expect(r.blockers).toEqual([]);
    expect(r.filledFields).toContain('deviceTradeName');

    const som = MAP.deviceTradeName.xfaSomPath!;
    const back = await readXfaDatasetsValues(r.pdfBytes!, [som]);
    // A null read would mean the cell is not there at all — the comparison below
    // must not pass by both sides being absent.
    expect(typeof back[som]).toBe('string');
    // Trimmed on both sides: the writer writes the raw string, the gate compares
    // trimmed (a name differing only by whitespace is the same legal entity).
    expect(String(back[som]).trim()).toBe(predicted);
  });

  it('answers null for exactly the values the writer skips', () => {
    for (const raw of [undefined, null, '', '   ']) {
      expect(estarCellText(MAP.deviceTradeName, raw)).toBeNull();
    }
    // `[]` and `{}` are "has data" to the writer, but render to nothing, so no
    // text of ours is in the cell either way.
    expect(estarCellText(MAP.deviceTradeName, [])).toBeNull();
  });

  it('answers UNRENDERABLE, never null, for a value whose coercion throws', () => {
    // A null-prototype object: `String(value)` throws "Cannot convert object to
    // primitive value". Answering null would mean "nothing written" and would
    // suppress the finding — the fail-open shape of the original defect.
    const hostile = Object.create(null) as Record<string, unknown>;
    expect(estarCellText(MAP.deviceTradeName, hostile)).toBe(ESTAR_UNRENDERABLE_VALUE);

    // And it is REPORTED, not swallowed: an unrenderable declaring entity beside
    // a real applicant is a substitution, so the fill refuses instead of
    // throwing its way to a 500 with nothing said about why.
    const findings = assessEstarTemplateRebuild(MAP, {
      ...fillData(APPLICANT),
      declarationCompanyName: hostile,
    });
    expect(findings.find((f) => f.key === 'declarationCompanyName')?.effect).toBe('substituted');
  });
});
