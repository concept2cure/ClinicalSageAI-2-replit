/**
 * The regional Module 1 record — one cited answer for US, EU and JP.
 *
 * `shared/regulatory/regional-module1.ts` holds the FDA, EMA and PMDA Module 1
 * trees (moved out of `server/services/regional-ctd-templates.ts`, which now
 * projects them). This test pins:
 *
 *   - every node carries a well-formed basis, roles where it has a role, and an
 *     applicability; regulator-text only where a regulator text was read
 *     (US: the FDA controlled vocabulary vendored in cv-v4-data.ts; EU: the EU
 *     M1 eCTD Specification v3.1; JP: the MHLW/PMDA notices) — recall elsewhere;
 *   - the EU tree has 1.3.5, 1.3.6 and 1.5.3, and 1.1 is not an eCTD item;
 *   - every DocumentRole is used by a node, and placement / equivalence are
 *     derived from those roles, not kept beside them;
 *   - requiredModule1 reports an unknown fact as a gap (undetermined), never as
 *     "not required";
 *   - the templates' Module 1 is the record's projection, and the required
 *     sets the dispatch-readiness gate reads did not move (EU 1.1 excepted).
 *
 * The record module is imported per test, so the template assertions below run
 * (and fail on their own terms) even where the record does not exist yet.
 *
 * Basis for the regulator facts: docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/
 * 2026-10-05-record/g-regional-module1-record-facts.md.
 */
import { describe, it, expect } from 'vitest';

import { CV_CONTEXT_OF_USE } from '../../server/services/ectd/controlled-vocab/cv-v4-data';
import {
  getRegionalTemplate,
  toCtdSection,
  type CTDSection,
} from '../../server/services/regional-ctd-templates';
import { requiredModule1CodesForRegion } from '../../server/services/region-profiles/region-profile-service';
import { basisProblems } from '../../shared/regulatory/regulatory-basis';
import { compareSectionCode } from '../../shared/regulatory/section-code';

type Record_ = typeof import('../../shared/regulatory/regional-module1');
const loadRecord = (): Promise<Record_> => import('../../shared/regulatory/regional-module1');

const CV_VENDORED = 'server/services/ectd/controlled-vocab/cv-v4-data.ts';
const EU_M1_V31 =
  'https://esubmission.ema.europa.eu/eumodule1/EU%20M1%20eCTD%20Spec%20v3.1%20-%20June%202024%20-%20final%20version.pdf';

/** The FDA-published US regional Module 1 headings, as plain codes. */
const FDA_CV_CODES = new Set(
  CV_CONTEXT_OF_USE.codes.map((c) => c.code).filter((c) => c.startsWith('us_1')).map((c) => c.replace(/^us_/, '')),
);

function flatTemplate(sections: readonly CTDSection[]): CTDSection[] {
  return sections.flatMap((s) => [s, ...flatTemplate(s.childSections ?? [])]);
}
function templateCodes(agency: string): string[] {
  return flatTemplate(getRegionalTemplate(agency)!.module1Sections).map((s) => s.number);
}

describe('regional-ctd-templates projects the record', () => {
  it('EU Module 1 carries 1.3.5, 1.3.6 and 1.5.3', () => {
    const eu = templateCodes('EMA');
    expect(eu).toContain('1.3.5');
    expect(eu).toContain('1.3.6');
    expect(eu).toContain('1.5.3');
  });

  it('EU 1.1 (table of contents) is not required of an eCTD MAA', () => {
    const oneOne = flatTemplate(getRegionalTemplate('EMA')!.module1Sections).find((s) => s.number === '1.1');
    expect(oneOne, 'EU 1.1 stays in the tree for non-eCTD submissions').toBeDefined();
    expect(oneOne!.required).toBe(false);
    expect(requiredModule1CodesForRegion('eu', 'maa')).not.toContain('1.1');
  });

  it('the required Module 1 sets the dispatch-readiness gate reads did not move (EU 1.1 excepted)', () => {
    // Pinned from HEAD a9ac124a before the move (g-regional-module1-record-red.txt).
    const head: Array<[string, string | null, string[]]> = [
      ['fda', 'ind', ['1.1', '1.2', '1.3', '1.12.14', '1.14', '1.14.4', '1.14.4.1', '1.14.4.2', '1.20']],
      ['fda', 'nda', ['1.1', '1.2', '1.3', '1.3.3', '1.3.4', '1.12.14', '1.14', '1.14.1']],
      ['fda', 'bla', ['1.1', '1.2', '1.3', '1.3.3', '1.3.4', '1.12.14', '1.14', '1.14.1']],
      ['fda', 'anda', ['1.1', '1.2', '1.3', '1.3.3', '1.3.4', '1.12.14', '1.14', '1.14.1']],
      ['fda', null, ['1.1', '1.2', '1.3', '1.3.3', '1.3.4', '1.12.14', '1.14', '1.14.1', '1.14.4', '1.14.4.1', '1.14.4.2', '1.20']],
      ['eu', 'maa', ['1.0', '1.2', '1.3', '1.3.1', '1.4', '1.4.1', '1.4.2', '1.4.3', '1.6', '1.8', '1.8.1', '1.8.2']],
      ['jp', 'jnda', ['1.1', '1.2', '1.5', '1.7', '1.8', '1.12']],
      ['cn', null, ['1.0', '1.1', '1.2', '1.3', '1.3.1', '1.3.2', '1.3.3', '1.3.5']],
      ['kr', null, ['1.1', '1.2', '1.3', '1.4', '1.5', '1.5.1', '1.5.2']],
    ];
    for (const [region, app, expected] of head) {
      expect(requiredModule1CodesForRegion(region, app), `${region}/${app}`).toEqual(expected);
    }
  });

  it('FDA, EMA and PMDA Module 1 are exactly the record projected; NMPA and MFDS are labelled not modeled', async () => {
    const { moduleOneTree } = await loadRecord();
    expect(getRegionalTemplate('FDA')!.module1Sections).toEqual(moduleOneTree('US').map(toCtdSection));
    expect(getRegionalTemplate('EMA')!.module1Sections).toEqual(moduleOneTree('EU').map(toCtdSection));
    expect(getRegionalTemplate('PMDA')!.module1Sections).toEqual(moduleOneTree('JP').map(toCtdSection));
    expect(getRegionalTemplate('FDA')!.module1Record).toBe('regional-module1');
    expect(getRegionalTemplate('NMPA')!.module1Record).toBe('not-modeled');
    expect(getRegionalTemplate('MFDS')!.module1Record).toBe('not-modeled');
  });
});

describe('every Module 1 node is cited', () => {
  it('every node in every tree has a non-empty, well-formed basis and an applicability list', async () => {
    const { flattenModule1, MODELED_JURISDICTIONS, REGIONAL_MODULE1 } = await loadRecord();
    for (const j of MODELED_JURISDICTIONS) {
      expect(basisProblems(REGIONAL_MODULE1[j].spec), `${j} spec`).toEqual([]);
      const nodes = flattenModule1(j);
      expect(nodes.length).toBeGreaterThan(10);
      for (const n of nodes) {
        expect(n.basis.length, `${j} ${n.number} has no basis`).toBeGreaterThan(0);
        for (const b of n.basis) expect(basisProblems(b), `${j} ${n.number}`).toEqual([]);
        expect(Array.isArray(n.applies), `${j} ${n.number} applies`).toBe(true);
        for (const a of n.applies) {
          if (a.necessity === 'conditional') expect(a.condition, `${j} ${n.number} conditional without a condition`).toBeTruthy();
          if (a.necessity === 'when-applicable') expect(a.when, `${j} ${n.number} when-applicable without words`).toBeTruthy();
          for (const b of a.basis ?? []) expect(basisProblems(b), `${j} ${n.number} applicability`).toEqual([]);
        }
      }
    }
  });

  it('US: a heading FDA publishes in its controlled vocabulary is regulator-text from the vendored CV; nothing else is', async () => {
    const { flattenModule1 } = await loadRecord();
    for (const n of flattenModule1('US')) {
      const regulator = n.basis.filter((b) => b.confidence === 'regulator-text');
      if (FDA_CV_CODES.has(n.number)) {
        expect(regulator.length, `US ${n.number} is in the FDA CV`).toBeGreaterThan(0);
        expect(regulator.every((b) => b.vendored === CV_VENDORED), `US ${n.number}`).toBe(true);
      } else {
        expect(regulator, `US ${n.number} is not in the FDA CV, so it cannot be regulator-text`).toEqual([]);
        expect(n.basis.some((b) => b.confidence === 'recall')).toBe(true);
      }
    }
  });

  it('EU 1.3.1–1.3.3, 1.8.2 and 1.10 cite the EU M1 eCTD Specification v3.1; JP 1.8, 1.11, 1.12 and 1.13 cite MHLW/PMDA text', async () => {
    const { module1Heading } = await loadRecord();
    for (const code of ['1.3.1', '1.3.2', '1.3.3', '1.8.2', '1.10']) {
      const n = module1Heading('EU', code)!;
      expect(n, `EU ${code}`).not.toBeNull();
      expect(n.basis.some((b) => b.confidence === 'regulator-text' && b.url === EU_M1_V31), `EU ${code}`).toBe(true);
    }
    for (const code of ['1.8', '1.11', '1.12', '1.13']) {
      const n = module1Heading('JP', code)!;
      expect(
        n.basis.some((b) => b.confidence === 'regulator-text' && /(^|\.)(pmda|mhlw)\.go\.jp$/.test(new URL(b.url!).hostname)),
        `JP ${code}`,
      ).toBe(true);
    }
    // Everything else in EU and JP is recall until its text is read.
    const { flattenModule1 } = await loadRecord();
    const euRegulator = flattenModule1('EU').filter((n) => n.basis.some((b) => b.confidence === 'regulator-text')).map((n) => n.number);
    expect(euRegulator.sort(compareSectionCode)).toEqual(['1.3.1', '1.3.2', '1.3.3', '1.3.5', '1.3.6', '1.8.2', '1.10']);
    const jpRegulator = flattenModule1('JP').filter((n) => n.basis.some((b) => b.confidence === 'regulator-text')).map((n) => n.number);
    expect(jpRegulator.sort(compareSectionCode)).toEqual(['1.8', '1.11', '1.12', '1.13']);
  });
});

describe('the EU and JP trees', () => {
  it('EU gains 1.3.5, 1.3.6 and 1.5.3, and 1.1 is marked not an eCTD item', async () => {
    const { module1Heading } = await loadRecord();
    expect(module1Heading('EU', '1.3.5')?.title).toMatch(/already approved/i);
    expect(module1Heading('EU', '1.3.6')?.title).toMatch(/braille/i);
    expect(module1Heading('EU', '1.5.3')?.title).toMatch(/exclusivity/i);
    expect(module1Heading('EU', '1.1')?.notInEctd).toBe(true);
    expect(module1Heading('EU', '1.0')?.notInEctd).toBeUndefined();
  });

  it('JP 1.8 is the draft package insert and points at its format engine; 1.11 is the draft RMP; the form is 1.2', async () => {
    const { module1Heading } = await loadRecord();
    const pi = module1Heading('JP', '1.8')!;
    expect(pi.titleLocal).toContain('添付文書');
    expect(pi.pointsTo?.outline).toBe('jp-package-insert');
    expect(module1Heading('JP', '1.11')!.titleLocal).toContain('医薬品リスク管理計画');
    expect(module1Heading('JP', '1.2')!.titleLocal).toContain('承認申請書');
  });

  it('accepts m-prefixed codes and answers null, never another tree, for an unknown code', async () => {
    const { module1Heading } = await loadRecord();
    expect(module1Heading('EU', 'm1.3.2')?.title).toMatch(/mock-up/i);
    expect(module1Heading('EU', '1.20')).toBeNull();
    expect(module1Heading('JP', '1.14')).toBeNull();
    expect(module1Heading('US', '1.1.2'), 'a platform sub-key is not an FDA heading').toBeNull();
  });

  it('US 1.1 lists the platform sub-keys 1.1.1–1.1.4, none of which is an FDA-published heading', async () => {
    const { module1Heading } = await loadRecord();
    const keys = module1Heading('US', '1.1')!.platformSubKeys!.map((k) => k.code);
    expect(keys).toEqual(['1.1.1', '1.1.2', '1.1.3', '1.1.4']);
    for (const k of keys) expect(FDA_CV_CODES.has(k)).toBe(false);
  });

  it('the record cannot be edited by one reader for everyone else', async () => {
    const { REGIONAL_MODULE1, module1Heading } = await loadRecord();
    expect(Object.isFrozen(REGIONAL_MODULE1)).toBe(true);
    expect(Object.isFrozen(module1Heading('EU', '1.8.2'))).toBe(true);
    expect(Object.isFrozen(module1Heading('EU', '1.8.2')!.basis[0])).toBe(true);
  });
});

describe('roles: placement and equivalence derive from one datum', () => {
  it('every DocumentRole is used by at least one node, and no node uses a role outside the list', async () => {
    const { DOCUMENT_ROLES, MODELED_JURISDICTIONS, flattenModule1 } = await loadRecord();
    const used = new Set<string>();
    for (const j of MODELED_JURISDICTIONS) for (const n of flattenModule1(j)) for (const r of n.roles ?? []) used.add(r);
    expect(DOCUMENT_ROLES.filter((r) => !used.has(r)), 'roles no node uses').toEqual([]);
    expect([...used].filter((r) => !(DOCUMENT_ROLES as readonly string[]).includes(r))).toEqual([]);
  });

  it('placementFor answers each tree from its own nodes', async () => {
    const { placementFor } = await loadRecord();
    const codes = (role: Parameters<typeof placementFor>[0], j: Parameters<typeof placementFor>[1], kind?: Parameters<typeof placementFor>[2]) =>
      placementFor(role, j, kind).map((n) => n.number);
    expect(codes('product_information_draft', 'US')).toEqual(['1.14.1.3']);
    expect(codes('product_information_draft', 'EU')).toEqual(['1.3.1']);
    expect(codes('product_information_draft', 'JP')).toEqual(['1.8']);
    expect(codes('cover_letter', 'US')).toEqual(['1.2']);
    expect(codes('cover_letter', 'EU')).toEqual(['1.0']);
    expect(codes('application_form', 'JP')).toEqual(['1.2']);
    expect(codes('rmp', 'EU')).toEqual(['1.8.2']);
    expect(codes('rmp', 'JP')).toEqual(['1.11']);
    expect(codes('rmp', 'US'), 'an EU/JP RMP has no US heading; REMS is its own role').toEqual([]);
    expect(codes('pv_system', 'EU')).toEqual(['1.8.1']);
    expect(codes('paediatric', 'EU')).toEqual(['1.10']);
    expect(codes('environmental', 'EU')).toEqual(['1.6']);
    expect(codes('investigators_brochure', 'US', 'ind')).toEqual(['1.14.4.1']);
    expect(codes('investigators_brochure', 'US', 'nda'), 'an NDA files no investigator’s brochure at 1.14.4.1').toEqual([]);
  });

  it('equivalentsOf is derived from shared roles', async () => {
    const { equivalentsOf } = await loadRecord();
    const eq = equivalentsOf('US', '1.14.1.3').map((e) => `${e.jurisdiction} ${e.code}`);
    expect(eq).toEqual(['EU 1.3.1', 'JP 1.8']);
    expect(equivalentsOf('JP', '1.11').map((e) => `${e.jurisdiction} ${e.code}`)).toEqual(['EU 1.8.2']);
    expect(equivalentsOf('EU', '1.0').map((e) => `${e.jurisdiction} ${e.code}`)).toEqual(['US 1.2']);
    expect(equivalentsOf('EU', '1.5.3'), 'a node with no role has no claimed equivalent').toEqual([]);
    expect(equivalentsOf('US', '9.9')).toEqual([]);
  });
});

describe('requiredModule1: an unknown fact is a gap', () => {
  it('EU MAA: orphan and paediatric headings are undetermined until the fact is known', async () => {
    const { requiredModule1 } = await loadRecord();
    const none = requiredModule1('EU', 'maa');
    expect(none.required).toEqual(expect.arrayContaining(['1.0', '1.2', '1.3.1', '1.6', '1.8.1', '1.8.2']));
    expect(none.required).not.toContain('1.1');
    expect(none.undetermined).toEqual(
      expect.arrayContaining([
        { code: '1.7', condition: 'orphan_designation' },
        { code: '1.10', condition: 'paediatric_obligation' },
      ]),
    );
    expect(none.notApplicable).not.toContain('1.10');

    const known = requiredModule1('EU', 'maa', { orphan_designation: false, paediatric_obligation: true });
    expect(known.required).toContain('1.10');
    expect(known.notApplicable).toEqual(expect.arrayContaining(['1.7', '1.7.1', '1.7.2']));
    expect(known.undetermined.map((u) => u.code)).not.toContain('1.10');
  });

  it('US: an NDA is not asked for the IND plan, and an IND is not asked for debarment', async () => {
    const { requiredModule1 } = await loadRecord();
    const nda = requiredModule1('US', 'nda');
    expect(nda.required).toEqual(expect.arrayContaining(['1.1', '1.2', '1.3.3', '1.3.4', '1.12.14', '1.14.1']));
    expect(nda.notApplicable).toEqual(expect.arrayContaining(['1.20', '1.14.4.1']));
    const ind = requiredModule1('US', 'ind');
    expect(ind.required).toEqual(expect.arrayContaining(['1.20', '1.14.4.1', '1.12.14']));
    expect(ind.notApplicable).toEqual(expect.arrayContaining(['1.3.3', '1.3.4', '1.14.1']));
  });

  it('module1Rows lists the tree for one application in CTD order, required only where always required', async () => {
    const { module1Rows } = await loadRecord();
    const rows = module1Rows('EU', 'maa');
    const codes = rows.map((r) => r.code);
    expect(codes).toEqual([...codes].sort(compareSectionCode));
    expect(codes.indexOf('1.10')).toBeGreaterThan(codes.indexOf('1.9'));
    expect(rows.find((r) => r.code === '1.8.2')).toMatchObject({ title: 'Risk Management System', required: true });
    expect(rows.find((r) => r.code === '1.10')).toMatchObject({ required: false, undetermined: 'paediatric_obligation' });
    expect(module1Rows('US', 'nda').map((r) => r.code)).not.toContain('1.20');
  });
});
