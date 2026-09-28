/**
 * §3.2.S.1 and §3.2.R.1 must not claim content they do not carry.
 *
 * Both are pointer-shaped sections, which is exactly where a generator drifts
 * into asserting rather than reporting. Each case here is a POSITIVE CLAIM the
 * generators made over data that did not support it, and each was seen to FAIL
 * before the fix it pins:
 *
 *   §3.2.S.1 closed with "This section provides general information including
 *   nomenclature, molecular structure, and general properties of the drug
 *   substance" over a two-row table of name and manufacturer — asserting the
 *   whole of ICH M4Q §3.2.S.1.1/.1.2/.1.3 and delivering none of it — while
 *   the write-through was already capturing INN, CAS, molecular formula,
 *   molecular weight and structure and the section discarded them.
 *
 *   §3.2.R.1 stated, in filed dossier content, that a Type III DMF Letter of
 *   Authorization was "on file", that a QP Declaration was "included in
 *   Module 1.5.2", and that a Letter of Access was "on file" — for a dossier
 *   whose canonical source set (CMC_SOURCE_TYPES) has no member that can hold
 *   any of them.
 */
import { describe, expect, it } from 'vitest';

import {
  changeControlScopeOf,
  composeModule3FromCanonicalSources,
  impactedSectionsForChangeControl,
} from '../module3Composer';
import { mapChangeControlPayload } from '../cmc-write-through';
import { composeRegional } from '../module3-extensions';

const src = (sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id: `${sourceType}-1`, sourceType, sourcePayload, sourceHash: 'h' }) as never;

const s1 = (sources: unknown[]) =>
  composeModule3FromCanonicalSources(sources as never).find((s) => s.sectionKey === '3.2.S.1')!;

const regional = (region: 'US' | 'EU' | 'JP' | 'CA', sources: unknown[] = []) =>
  composeRegional(sources as never, region)[0]!;

const allText = (section: {
  narrativeDraft: string;
  tables: Array<{ title: string; headers: string[]; rows: string[][] }>;
}) => [section.narrativeDraft, ...section.tables.flatMap((t) => t.rows.flat())].join('\n');

describe('§3.2.S.1 — the section does not claim the sub-parts it has no record for', () => {
  it('does not assert nomenclature, structure or general properties over a bare name', () => {
    const section = s1([src('drug_substance', { name: 'BX-701', manufacturer: 'Acme API' })]);

    // The old sentence, verbatim, is the thing that must not come back.
    expect(section.narrativeDraft).not.toMatch(
      /This section provides general information including nomenclature, molecular structure, and general properties/,
    );
    expect(section.narrativeDraft).toMatch(/not established by this section/);
    // cap() starts the sentence, so the first sub-part is title-cased.
    for (const part of ['nomenclature', 'molecular structure', 'general properties']) {
      expect(section.narrativeDraft.toLowerCase()).toContain(part);
    }
  });

  it('renders the nomenclature and structure fields the register already holds', () => {
    // Every one of these is captured by mapDrugSubstancePayload and was being
    // discarded by this section while its narrative claimed to provide them.
    const section = s1([
      src('drug_substance', {
        name: 'BX-701',
        manufacturer: 'Acme API',
        inn: 'bexotifan',
        cas: '1234567-89-0',
        molecularFormula: 'C21H28N4O3',
        molecularWeight: '384.48 g/mol',
        structure: 'CC(=O)Nc1ccc(cc1)S(=O)(=O)N',
      }),
    ]);

    const text = allText(section);
    for (const value of ['bexotifan', '1234567-89-0', 'C21H28N4O3', '384.48 g/mol']) {
      expect(text).toContain(value);
    }
    expect(section.narrativeDraft).toMatch(/nomenclature \(INN, CAS number\)/);
    expect(section.narrativeDraft).toMatch(/structure \(structural formula, molecular formula, molecular weight\)/);
  });

  it('names exactly the sub-parts that are missing, and no others', () => {
    // Nomenclature recorded, structure and properties not.
    const section = s1([src('drug_substance', { name: 'BX-701', inn: 'bexotifan' })]);

    expect(section.narrativeDraft).toMatch(/nomenclature \(INN\)/);
    expect(section.narrativeDraft).toMatch(/molecular structure \(§3\.2\.S\.1\.2\)/i);
    expect(section.narrativeDraft).toMatch(/general properties \(§3\.2\.S\.1\.3\)/i);
    expect(section.narrativeDraft).toMatch(/are not established by this section/);
  });

  it('claims nothing as missing when the register holds all three sub-parts', () => {
    const section = s1([
      src('drug_substance', {
        name: 'BX-701',
        inn: 'bexotifan',
        cas: '1234567-89-0',
        molecularFormula: 'C21H28N4O3',
        molecularWeight: '384.48 g/mol',
        structure: 'CC(=O)N',
        physicochemicalProperties: 'White crystalline powder; soluble in water to 12 mg/mL at 25 C; pKa 4.2',
        biologicalActivity: 'IC50 3.1 nM against the target kinase',
      }),
    ]);

    expect(section.narrativeDraft).not.toMatch(/not established by this section/);
    expect(section.narrativeDraft).toMatch(/general properties \(physicochemical properties, biological activity\)/);
  });

  it('never renders a recorded object as the literal [object Object]', () => {
    // val() stringifies with String(), which reads as present and says nothing.
    const section = s1([
      src('drug_substance', {
        name: 'BX-701',
        physicochemicalProperties: { appearance: 'White powder', solubility: '12 mg/mL' },
      }),
    ]);

    expect(allText(section)).not.toContain('[object Object]');
    expect(allText(section)).toContain('White powder');
  });

  it('treats an empty recorded object as nothing recorded', () => {
    const section = s1([src('drug_substance', { name: 'BX-701', physicochemicalProperties: {} })]);

    expect(section.narrativeDraft).toMatch(/general properties \(§3\.2\.S\.1\.3\)/i);
  });
});

describe('§3.2.R.1 — regional pointers state a requirement and a status, never possession', () => {
  const REGIONS = ['US', 'EU', 'JP', 'CA'] as const;

  it.each(REGIONS)('%s does not assert that a regional document is on file or included', (region) => {
    const text = allText(regional(region));

    // The three assertions, verbatim, plus the shape they shared.
    expect(text).not.toMatch(/Letter of Authorization on file/);
    expect(text).not.toMatch(/Letter of Access on file/);
    expect(text).not.toMatch(/QP Declaration[\s\S]*?included in Module 1\.5\.2/);
    expect(text).not.toMatch(/\bon file\b/);
  });

  it.each(REGIONS)('%s gives every pointer a status column a reviewer can act on', (region) => {
    const section = regional(region);
    const pointers = section.tables.find((t) => t.title.endsWith('Documentation Pointers'))!;

    expect(pointers.headers).toEqual(['Item', 'Regulatory basis', 'Status in this dossier']);
    expect(pointers.rows.length).toBeGreaterThan(0);
    for (const row of pointers.rows) {
      expect(row).toHaveLength(3);
      expect(row[2]).toMatch(
        /^(Cross-referenced to .+ of this dossier|Required in .+ — outside Module 3; not verified by this section|Not recorded in this dossier)$/,
      );
    }
  });

  it('says the DMF letter of authorization is not recorded, because no source type holds one', () => {
    const pointers = regional('US').tables.find((t) => t.title.endsWith('Documentation Pointers'))!;
    const dmf = pointers.rows.find((r) => r[0].includes('Type III DMF'))!;

    expect(dmf[1]).toMatch(/21 CFR 314\.420/);
    expect(dmf[2]).toBe('Not recorded in this dossier');
  });

  it('says the QP declaration is not recorded rather than that it is in Module 1.5.2', () => {
    const pointers = regional('EU').tables.find((t) => t.title.endsWith('Documentation Pointers'))!;
    const qp = pointers.rows.find((r) => r[0].includes('QP Declaration'))!;

    expect(qp[1]).toMatch(/Annex 16/);
    expect(qp[2]).toBe('Not recorded in this dossier');
  });

  it('says the Canadian letter of access is not recorded', () => {
    const pointers = regional('CA').tables.find((t) => t.title.endsWith('Documentation Pointers'))!;
    const dmf = pointers.rows.find((r) => r[0].includes('Drug Master File'))!;

    expect(dmf[2]).toBe('Not recorded in this dossier');
  });

  it('still points at a §3.2 section this dossier composes, where one exists', () => {
    // The fix must not flatten every pointer to "not recorded": a real
    // cross-reference into the dossier is what a pointer section is FOR, and
    // the export gate is what makes it true.
    const pointers = regional('EU').tables.find((t) => t.title.endsWith('Documentation Pointers'))!;
    const tse = pointers.rows.find((r) => r[0].includes('TSE/BSE'))!;

    expect(tse[2]).toBe('Cross-referenced to 3.2.A.2 and 3.2.A.3 of this dossier');
  });

  it.each(REGIONS)('%s narrative does not claim Module 1 content was provided', (region) => {
    const narrative = regional(region).narrativeDraft;

    expect(narrative).not.toMatch(/are provided in Module/);
    expect(narrative).not.toMatch(/is documented in 3\.2\.P\.4/);
    expect(narrative).not.toMatch(/specifications are presented/);
  });
});

describe('change-control staleness reads the side the change declares', () => {
  it('stales the drug-substance manufacture section for a drug-substance change', () => {
    // The defect: staleness keyed on the source TYPE alone, and exactly one
    // rule names change_control — §3.2.P.3, Manufacture of the Drug Product.
    // So a new API synthetic route staled the drug PRODUCT's manufacture
    // section and left §3.2.S.2 reading "approved and current".
    const sections = impactedSectionsForChangeControl('drug_substance');

    expect(sections).toContain('3.2.S.2');
    expect(sections).not.toContain('3.2.P.3');
  });

  it('stales the drug-product manufacture section for a drug-product change', () => {
    const sections = impactedSectionsForChangeControl('drug_product');

    expect(sections).toContain('3.2.P.3');
    expect(sections).not.toContain('3.2.S.2');
  });

  it('stales both sides when the change declares both', () => {
    const sections = impactedSectionsForChangeControl('both');

    expect(sections).toEqual(expect.arrayContaining(['3.2.P.3', '3.2.S.2']));
  });

  it('stales both sides when the scope is not recorded, rather than guessing', () => {
    // Fail closed: a stale section costs a re-approval, a section that should
    // have gone stale and did not costs a filing of unreviewed content.
    const sections = impactedSectionsForChangeControl(null);

    expect(sections).toEqual(expect.arrayContaining(['3.2.P.3', '3.2.S.2']));
  });

  it('reads the scope only from the three values the classifier recognises', () => {
    expect(changeControlScopeOf({ affects: 'drug_substance' })).toBe('drug_substance');
    expect(changeControlScopeOf({ affects: 'drug_product' })).toBe('drug_product');
    expect(changeControlScopeOf({ affects: 'both' })).toBe('both');
    // Anything else is "not recorded", which stales both — never a silent
    // narrowing to the drug-product default the old rule effectively had.
    expect(changeControlScopeOf({ affects: '' })).toBeNull();
    expect(changeControlScopeOf({ affects: 'DRUG_SUBSTANCE' })).toBeNull();
    expect(changeControlScopeOf({})).toBeNull();
    expect(changeControlScopeOf(null)).toBeNull();
  });

  it('carries affects from the change record into the canonical payload', () => {
    // It never did, so the rule above could not have branched on it.
    expect(mapChangeControlPayload({ changeNumber: 'CC-1', affects: 'drug_substance' }).affects).toBe(
      'drug_substance',
    );
    expect(mapChangeControlPayload({ changeNumber: 'CC-1' }).affects).toBe('');
  });
});
