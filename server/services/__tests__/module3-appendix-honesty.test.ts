/**
 * The 3.2.A appendices must not clear a product of a risk they did not examine.
 *
 * Each case here is a POSITIVE CLAIM the appendix generators could make over
 * data that does not support it — the one failure mode these sections exist to
 * prevent, since a filed §3.2.A.1 asserting GMP compliance or a §3.2.A.3
 * asserting no animal-origin excipients is a representation to an agency.
 *
 * Every case was seen to FAIL before the fix it pins.
 */
import { describe, expect, it } from 'vitest';

import { composeAppendices, emittableAppendices } from '../module3-extensions';

const src = (sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id: `${sourceType}-${Math.abs(JSON.stringify(sourcePayload).length)}`, sourceType, sourcePayload, sourceHash: 'h' }) as never;

const a3 = (sources: unknown[]) =>
  emittableAppendices(composeAppendices(sources as never)).find((s) => s.sectionKey === '3.2.A.3')!;

const a1 = (sources: unknown[]) =>
  composeAppendices(sources as never).find((s) => s.sectionKey === '3.2.A.1')!;

const a1Sibling = (sources: unknown[]) =>
  composeAppendices(sources as never).find((s) => s.sectionKey === '3.2.A.2')!;

const originTable = (section: { tables: Array<{ title: string; headers: string[]; rows: string[][] }> }) =>
  section.tables.find((t) => t.title.startsWith('Excipients of Human or Animal Origin'));

/** A material-register excipient row as mapMaterialSpecPayload emits it. */
const excipient = (over: Record<string, unknown> = {}) => ({
  materialRole: 'excipient',
  materialName: 'Gelatin',
  functionInFormulation: 'Capsule shell',
  origin: 'bovine',
  tseCertificate: 'CEP R1-CEP 2000-045-Rev 03',
  status: 'specified',
  ...over,
});

/** A formulation record carrying one named component. */
const formulation = (component: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  formulationName: 'BX-cap 25 mg hard capsule',
  version: 'F-v2.0',
  status: 'current',
  components: [{ component: 'BX-204', role: 'Active', origin: 'synthetic' }, component],
  ...over,
});

describe('§3.2.A.3 — a free-text origin on the formulation cannot mask the register’s recorded one', () => {
  it('does NOT clear the product when the register records bovine and the formulation row says plant', () => {
    /* The join inherited the register's origin only where the component's own
       was blank, and the classification read the component's origin alone — so
       a formulation row typed "plant" over a material the excipient register
       records as bovine produced the animal-free all-clear, with the register's
       own origin field sitting unread two rows away. */
    const section = a3([
      src('excipient', excipient({ tseCertificate: '' })),
      src('formulation_record', formulation({ component: 'Gelatin', role: 'Capsule shell', origin: 'plant' })),
    ]);
    expect(section.narrativeDraft).not.toContain('No excipients of human or animal origin are used');
    expect(section.narrativeDraft).not.toContain('no additional TSE/BSE or viral safety documentation is required');
    const table = originTable(section);
    expect(table).toBeDefined();
    expect(table!.rows.some((r) => /gelatin/i.test(String(r[0])))).toBe(true);
    // The disagreement is stated, not silently resolved in either direction.
    expect(JSON.stringify(table!.rows)).toMatch(/bovine/i);
    expect(section.completeness).toBe(0);
  });

  it('still reports the material when the formulation records no origin at all', () => {
    const section = a3([
      src('excipient', excipient()),
      src('formulation_record', formulation({ component: 'gelatin', role: 'Capsule shell' })),
    ]);
    const table = originTable(section)!;
    const rows = table.rows.filter((r) => /gelatin/i.test(String(r[0])));
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe('CEP R1-CEP 2000-045-Rev 03');
  });
});

describe('§3.2.A.3 — two register rows for one material, one of them uncertified', () => {
  it('does NOT say a certificate is recorded for each when a second row of the same material has none', () => {
    /* The name map kept the FIRST row and the join then dropped every register
       row whose name matched — so a second supplier's gelatin with no CEP
       vanished from the section entirely, and the narrative said a certificate
       was recorded for each. */
    const section = a3([
      src('excipient', excipient({ tseCertificate: 'CEP R1-CEP 2000-045-Rev 03', grade: 'Ph. Eur.', supplier: 'Rousselot' })),
      src('excipient', excipient({ tseCertificate: '', grade: 'USP', supplier: 'Second supplier' })),
      src('formulation_record', formulation({ component: 'Gelatin', role: 'Capsule shell', origin: 'bovine' })),
    ]);
    expect(section.narrativeDraft).not.toContain('A TSE/BSE certificate is recorded for each');
    expect(section.narrativeDraft).toMatch(/NOT established/);
    expect(section.completeness).toBe(0);
    const table = originTable(section)!;
    expect(JSON.stringify(table.rows)).toMatch(/NOT RECORDED/);
  });

  it('certifies the material only when every register row for it carries a certificate', () => {
    const section = a3([
      src('excipient', excipient({ supplier: 'Rousselot' })),
      src('excipient', excipient({ supplier: 'Second supplier', tseCertificate: 'CEP R1-CEP 2011-012-Rev 01' })),
      src('formulation_record', formulation({ component: 'Gelatin', role: 'Capsule shell', origin: 'bovine' })),
    ]);
    expect(section.narrativeDraft).toContain('A TSE/BSE certificate is recorded for each');
    expect(section.completeness).toBe(100);
  });
});

describe('§3.2.A.3 — one material is counted once', () => {
  it('does not count the same excipient twice when a superseded formulation also names it', () => {
    /* Components were read from EVERY formulation_record, so a superseded
       version sharing a component inflated "Excipients Recorded" and the
       "certificate recorded for N of M" tally the reviewer reads. */
    const section = a3([
      src('excipient', excipient()),
      src('formulation_record', formulation({ component: 'Gelatin', role: 'Capsule shell', origin: 'bovine' }, {
        version: 'F-v1.0', status: 'superseded',
      })),
      src('formulation_record', formulation({ component: 'Gelatin', role: 'Capsule shell', origin: 'bovine' })),
    ]);
    const table = originTable(section)!;
    expect(table.rows.filter((r) => /gelatin/i.test(String(r[0])))).toHaveLength(1);
    expect(section.narrativeDraft).not.toMatch(/certificate is recorded for 2 of 2/);
  });
});

describe('§3.2.A.3 — a name-flagged excipient is not a complete section', () => {
  it('marks the review-required (name-based) branch as not established', () => {
    /* The 'potential' branch says the component "must be qualified through"
       three things and records none of them — but emitted no NOT ESTABLISHED
       marker, so the section scored 100% with nothing qualified. */
    const section = a3([
      src('formulation_record', formulation({ component: 'Lanolin', role: 'Emollient' })),
    ]);
    expect(section.narrativeDraft).toMatch(/NOT established/);
    expect(section.completeness).toBe(0);
    expect(section.missingInputs.length).toBeGreaterThan(0);
  });
});

describe('§3.2.A.1 — facilities are described, not asserted', () => {
  it('does not claim GMP compliance, cleaning, qualification or environmental monitoring over an empty record', () => {
    /* The closing paragraph asserted that cleaning, equipment qualification,
       changeover, cross-contamination controls, environmental monitoring and
       utilities all meet current GMP — unconditionally, over a record whose
       manufacturing site was "not yet recorded", and with no completeness
       marker, so the required appendix scored 100%. */
    const section = a1([src('drug_product', { name: 'BX-cap', status: 'development' })]);
    expect(section.narrativeDraft).not.toMatch(/follow site SOPs and current GMP requirements\./);
    expect(section.narrativeDraft).not.toMatch(/meet the standards applicable to the dosage form\./);
    expect(section.narrativeDraft).toMatch(/NOT ESTABLISHED by this section/);
    expect(section.completeness).toBe(0);
    expect(section.missingInputs.length).toBeGreaterThan(0);
  });

  it('describes what IS recorded, and still scopes what the register does not hold', () => {
    const section = a1([
      src('manufacturing_process', {
        manufacturingSite: 'Cork, Ireland',
        processDescription: 'Wet granulation, compression, film coating',
      }),
      src('container_closure', {
        containerDescription: '10 mL Type I vial',
        closureDescription: '20 mm bromobutyl stopper',
        suitabilityJustification: 'Compatibility demonstrated over 12 months',
      }),
    ]);
    expect(section.narrativeDraft).toContain('Cork, Ireland');
    expect(section.narrativeDraft).not.toMatch(/meet the standards applicable to the dosage form\./);
    /* Scoping what the register does not hold is not a missing input: a
       recorded facility must still be able to reach 100%, or the required
       appendix would block the export gate for every project forever. */
    expect(section.narrativeDraft).not.toMatch(/NOT ESTABLISHED/);
    expect(section.completeness).toBe(100);
    expect(section.narrativeDraft).toMatch(/makes no statement about their content/);
  });
});

describe('the missing-input list is made of whole sentences', () => {
  it('does not split a guideline revision number into its own missing input', () => {
    /* notEstablishedStatements split on any period followed by whitespace, and
       the narrative names "EMA EMEA/410/01 rev. 3" — so the staffer's list of
       what to record read: "3 is NOT established by this section." */
    const section = a3([
      src('excipient', excipient({ tseCertificate: '' })),
      src('formulation_record', formulation({ component: 'Gelatin', role: 'Capsule shell', origin: 'bovine' })),
    ]);
    expect(section.missingInputs.length).toBeGreaterThan(0);
    for (const input of section.missingInputs) {
      expect(input).not.toMatch(/^\d/);
      expect(input.split(' ').length).toBeGreaterThan(3);
    }
  });
});

describe('§3.2.A.2 — adventitious agents are not cleared over unexamined data', () => {
  it('does not declare a CHO cell-culture substance a chemical one', () => {
    /* The biologic heuristic asked for "cell LINE" and the register records
       "CHO cell culture", so a monoclonal antibody fell through to the
       chemical branch — in the one appendix whose subject is adventitious
       agents. A false positive here costs a section that asks for viral-safety
       data; a false negative files an all-clear for a cell-culture product. */
    const section = a1Sibling([
      src('drug_substance', { name: 'BX-701', manufacturingRoute: 'CHO cell culture, fed-batch, protein A capture' }),
    ]);
    expect(section.narrativeDraft).not.toMatch(/does not apply to the drug substance/);
    expect(section.narrativeDraft).not.toMatch(/no animal- or human-derived raw materials/);
  });

  it('reads a monoclonal antibody INN as a biologic', () => {
    const section = a1Sibling([src('drug_substance', { name: 'belantezumab', manufacturingRoute: 'Upstream and downstream processing' })]);
    expect(section.narrativeDraft).not.toMatch(/does not apply to the drug substance/);
  });

  it('a genuinely chemical route claims nothing about the raw materials it never read', () => {
    /* The branch asserted "no animal- or human-derived raw materials, no
       cell-line propagation and no fermentation step recorded against it" —
       three claims read from no field, in a section that receives neither the
       excipient nor the material register. */
    const section = a1Sibling([
      src('drug_substance', {
        name: 'BX-204',
        manufacturingRoute: 'Four-step convergent synthesis from intermediate INT-2',
      }),
    ]);
    expect(section.narrativeDraft).not.toMatch(/no animal- or human-derived raw materials/);
    expect(section.narrativeDraft).toMatch(/does not apply to the drug substance itself/);
    expect(section.narrativeDraft).toMatch(/neither reads nor certifies them/);
    // It is still a COMPLETE section: what it states, the record supports.
    expect(section.completeness).toBe(100);
  });

  it('says the question is unanswered when nothing at all is recorded', () => {
    const section = a1Sibling([src('drug_substance', { name: 'BX-204' })]);
    expect(section.narrativeDraft).toMatch(/NOT ESTABLISHED/);
    expect(section.completeness).toBe(0);
  });
});

describe('§3.2.A.2 — the BIOLOGIC branch claims only what the register holds', () => {
  it('does not assert viral clearance and cell-bank characterisation from a name alone', () => {
    /* The two non-biologic branches were given fail-closed wording; this one
       was not, and composeAppendices scores a section 100 unless the marker
       appears. A drug substance row holding nothing but "Trastuzumab" produced
       a 100%-complete section asserting a three-part control strategy,
       in-process adventitious-agent testing, viral clearance steps and
       cell-bank characterisation — approvable, exportable, filed. */
    const section = a1Sibling([src('drug_substance', { name: 'Trastuzumab' })]);
    expect(section.narrativeDraft).not.toMatch(/The control strategy combines/);
    expect(section.narrativeDraft).not.toMatch(/Cell bank characterization, end-of-production/);
    expect(section.narrativeDraft).toMatch(/NOT ESTABLISHED by this section/);
    expect(section.completeness).toBe(0);
    expect(section.missingInputs.length).toBeGreaterThan(0);
  });

  it('names each thing the register does not hold', () => {
    const section = a1Sibling([
      src('drug_substance', { name: 'BX-mab', biologicalOrigin: 'CHO cell culture', cellLine: 'CHO-K1' }),
    ]);
    expect(section.narrativeDraft).toContain('CHO cell culture');
    expect(section.narrativeDraft).toMatch(/viral safety evaluation/i);
    expect(section.narrativeDraft).toMatch(/TSE\/BSE risk assessment/i);
    expect(section.narrativeDraft).toMatch(/NOT ESTABLISHED/);
    expect(section.completeness).toBe(0);
  });

  it('is a complete section when the register holds the whole record', () => {
    const section = a1Sibling([
      src('drug_substance', {
        name: 'BX-mab',
        biologicalOrigin: 'CHO cell culture',
        cellLine: 'CHO-K1 MCB lot MCB-01',
        viralSafetyEvaluation: 'Two orthogonal clearance steps (low-pH hold, 20 nm filtration) validated to > 4 log10 per ICH Q5A(R2)',
        tseStatus: 'No animal-derived raw materials in the process; media are chemically defined',
      }),
    ]);
    expect(section.narrativeDraft).toContain('low-pH hold');
    expect(section.narrativeDraft).not.toMatch(/NOT ESTABLISHED/);
    expect(section.completeness).toBe(100);
    expect(section.missingInputs).toEqual([]);
  });
});
