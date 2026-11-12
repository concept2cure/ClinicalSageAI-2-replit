/**
 * The TMF classifier names a catalog artifact only when the name IS that artifact.
 *
 * ── What the code did (found 2026-11-10, the review of slice E1) ─────────────
 * Slice E1 (2026-10-30) matched a catalog artifact name found as whole words
 * ANYWHERE in a file name, and returned that artifact's code and zone. So a
 * document that only mentions an artifact was reported as the artifact itself:
 *
 *   "Data Safety Monitoring Plan.pdf"                   → zone 1, monitoring_plan
 *   "Safety Communication Plan.pdf"                     → zone 1, communication_plan
 *   "Investigators Brochure receipt site 04.pdf"        → zone 2, investigators_brochure
 *   "IRB approval of Sample Informed Consent Form.pdf"  → zone 2, sample_icf
 *   "Statistical report template instructions.pdf"      → zone 11, statistical_report
 *
 * Each of those codes is an essential record. A code is a claim that the record
 * exists, so it is made only when the name is the catalog name, give or take a
 * version, a date, a status word or a file extension.
 *
 * ── What the first fix got wrong (found 2026-11-11, the review of that fix) ──
 * It let the keyword with the most words decide. So "IRB approval - Case
 * Report Form v2.pdf" went to Data Management (zone 10) and "FDA letter re
 * central lab.pdf" to Testing (zone 8), where the code before E1 and E1 itself
 * filed them with IRB / IEC and Regulatory. And any keyword in the rest of a
 * name vetoed a catalog name, so "SAE reports Site 101.pdf" and "Safety
 * Management Plan - CRO.pdf" got no zone at all. A longer keyword now only
 * takes the words of a shorter one inside it; the earliest rule decides, as
 * before; and a keyword that says whose document it is (site, CRO, vendor,
 * protocol) is not a second opinion beside a catalog name.
 *
 * The keyword rules read the raw name with `\b`, which an underscore does not
 * break: "delegation_log_site_04.pdf" matched nothing. And three keywords could
 * never fire, because a shorter keyword in an earlier rule took the name first:
 * "sample icf" (zone 2) lost to "icf" (zone 4), "sample crf" (zone 2) to "crf"
 * (zone 10), and "randomisation list" (zone 11) to "randomisation" (zone 6).
 */
import { describe, it, expect } from 'vitest';

import { classifyArtifact, TMF_KEYWORD_RULES, TMF_QUALIFIER_KEYWORDS } from '../etmf-logic';
import { TMF_REFERENCE_MODEL } from '../../../../shared/constants/domain/tmf-reference-model';
import { classifyForFiling } from '../../vault/vault-filing.service';

const UNCLASSIFIED = { zone: null, code: null };

function said(input: string): { zone: number | null; code: string | null } {
  const c = classifyArtifact(input);
  return { zone: c.zone, code: c.confidence === 'matched' ? c.code : null };
}

describe('a name that only contains a catalog name is not that artifact', () => {
  it('says nothing when the rest of the name points to another zone', () => {
    const names = [
      'Data Safety Monitoring Plan.pdf',
      'Safety Monitoring Plan v2.pdf',
      'Safety Communication Plan.pdf',
      'DSMB Safety Monitoring Plan.pdf',
      'IRB approval of Sample Informed Consent Form.pdf',
      "IRB Approval - Investigator's Brochure Edition 7.pdf",
      'Ethics committee approval of Recruitment Plan and materials.pdf',
    ];
    expect(Object.fromEntries(names.map((n) => [n, said(n)]))).toEqual(
      Object.fromEntries(names.map((n) => [n, UNCLASSIFIED])),
    );
  });

  it('says nothing when the name holds two catalog names from different zones', () => {
    const names = [
      'IRB/IEC approval - Protocol and amendments.pdf',
      'IRB/IEC submission - Protocol and amendments.pdf',
      'Regulatory submission - Protocol and amendments.pdf',
      'Site training records - Protocol and amendments.pdf',
      "Cover letter - Regulatory submission - Investigator's Brochure.pdf",
    ];
    expect(Object.fromEntries(names.map((n) => [n, said(n)]))).toEqual(
      Object.fromEntries(names.map((n) => [n, UNCLASSIFIED])),
    );
  });

  /* Measured on the E1 code: of the 1,640 names "<catalog name A> - <catalog
     name B>", the longer name won, and in 302 the document went from A's own
     zone to another, as B's artifact. */
  it('no pair of catalog names, in either order, is reported as one of the two artifacts', () => {
    const catalog = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => ({ zone: z.number, name: a.name })));
    const wrong: string[] = [];
    let pairs = 0;
    for (const a of catalog) {
      for (const b of catalog) {
        if (a === b) continue;
        pairs += 1;
        const got = said(`${a.name} - ${b.name}`);
        const want = a.zone === b.zone ? { zone: a.zone, code: null } : UNCLASSIFIED;
        if (got.zone !== want.zone || got.code !== want.code) wrong.push(`"${a.name} - ${b.name}": ${JSON.stringify(got)}`);
      }
    }
    expect(pairs).toBe(1640);
    expect(wrong).toEqual([]);
  });

  it('gives the zone at most, and no artifact code, when nothing else in the name disagrees', () => {
    expect(said("Acceptance of Investigator's Brochure - Dr Lee.pdf")).toEqual({ zone: 2, code: null });
    expect(said('Statistical report template instructions.pdf')).toEqual({ zone: 11, code: null });
    expect(said('LMN-201 Monitoring Plan v2.pdf')).toEqual({ zone: 1, code: null });
    expect(said('Financial-disclosure-form-PI.pdf')).toEqual({ zone: 5, code: null });
  });

  it('says it points to two zones, which is not the same as pointing to none', () => {
    expect(classifyArtifact('Data Safety Monitoring Plan.pdf')).toEqual({ zone: null, zoneName: null, section: null, confidence: 'unclassified', conflict: true });
    expect(classifyArtifact('IRB/IEC approval - Protocol and amendments.pdf')).toEqual({ zone: null, zoneName: null, section: null, confidence: 'unclassified', conflict: true });
    expect(classifyArtifact('quarterly-board-deck.pdf')).toEqual({ zone: null, zoneName: null, section: null, confidence: 'unclassified' });
  });

  /* The first fix let "site", "cro", "vendor" and "protocol" veto the catalog
     name: 36 of the 41 names lost their zone with " Site 101.pdf" after them,
     38 with " - CRO.pdf", 36 with " - Protocol ABC-123.pdf". */
  it('a word that says whose document it is does not unseat the catalog name', () => {
    const catalog = TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => ({ zone: z.number, name: a.name })));
    const suffixes = [' Site 101.pdf', ' - CRO.pdf', ' - Vendor Acme.pdf', ' - Protocol ABC-123.pdf'];
    const wrong = catalog.flatMap((a) =>
      suffixes
        .map((suffix) => `${a.name}${suffix}`)
        .filter((n) => said(n).zone !== a.zone || said(n).code !== null)
        .map((n) => `"${n}": ${JSON.stringify(said(n))}, catalog zone ${a.zone}`),
    );
    expect(wrong).toEqual([]);
    expect([...TMF_QUALIFIER_KEYWORDS].sort()).toEqual(['cro', 'protocol', 'site', 'vendor']);
    // The receipt of a brochure at a site is not the brochure: zone at most, never its code.
    expect(said('Investigators Brochure receipt site 04.pdf')).toEqual({ zone: 2, code: null });
  });

  it('a keyword that says what the document is still unseats it, beside the same qualifier', () => {
    expect(said('IRB approval of Monitoring Plan Site 101.pdf')).toEqual(UNCLASSIFIED);
    expect(said('Safety Management Plan - IRB copy - CRO.pdf')).toEqual(UNCLASSIFIED);
  });

  it('a keyword inside the catalog name itself is not a disagreement', () => {
    // "case report form" is a zone-10 keyword and sits inside the zone-2 artifact name.
    expect(said('Sample Case Report Form - annotated.pdf')).toEqual({ zone: 2, code: null });
  });
});

describe('a name that is the catalog name, with a version, date, status or extension, is that artifact', () => {
  it('identifies the artifact', () => {
    const expected: Record<string, { zone: number; code: string }> = {
      'Monitoring Plan v3.pdf': { zone: 1, code: 'monitoring_plan' },
      'Monitoring_Plan_v2.1_FINAL_signed_2026-10-30.pdf': { zone: 1, code: 'monitoring_plan' },
      'DRAFT Statistical Analysis Plan (version 4).docx': { zone: 11, code: 'sap' },
      'Investigators Brochure ed 7': { zone: 2, code: 'investigators_brochure' },
      "Investigator's Brochure Edition 12 - 03 Mar 2026.pdf": { zone: 2, code: 'investigators_brochure' },
      'sae-reports.xlsx': { zone: 7, code: 'sae_reports' },
    };
    expect(Object.fromEntries(Object.keys(expected).map((n) => [n, said(n)]))).toEqual(expected);
  });

  it('every catalog name still identifies itself, bare and with a version suffix', () => {
    const wrong = TMF_REFERENCE_MODEL.flatMap((z) =>
      z.artifacts.flatMap((a) =>
        [a.name, `${a.name} v2.pdf`]
          .filter((n) => said(n).code !== a.code || said(n).zone !== z.number)
          .map((n) => `"${n}": ${JSON.stringify(said(n))}, catalog ${z.number}/${a.code}`),
      ),
    );
    expect(wrong).toEqual([]);
  });
});

describe('the keyword rules read the name as words', () => {
  it('an underscore separates words, as a hyphen and a space do', () => {
    const expected: Record<string, number> = {
      'delegation_log_site_04.pdf': 5,
      'ICF_v2.pdf': 4,
      'SAE_followup_1234.pdf': 7,
      'central_lab_kit_instructions.pdf': 8,
    };
    expect(Object.fromEntries(Object.keys(expected).map((n) => [n, said(n).zone]))).toEqual(expected);
  });

  /* 'protocol' and 'sap' are also catalog codes: alone they are the artifact, in
     the same zone. No keyword is a catalog NAME: one would be taken as the
     catalog name first and could never fire as a keyword. */
  it('every keyword of every rule can fire: alone, it names its own rule\'s zone', () => {
    const shadowed = TMF_KEYWORD_RULES.flatMap((rule) =>
      rule.phrases
        .filter((p) => said(p).zone !== rule.zone)
        .map((p) => `"${p}" (zone ${rule.zone} rule) → ${JSON.stringify(said(p))}`),
    );
    expect(shadowed).toEqual([]);
    const catalogNames = new Set(TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => a.name.toLowerCase())));
    expect(TMF_KEYWORD_RULES.flatMap((r) => r.phrases).filter((p) => catalogNames.has(p)), 'keywords that are catalog names').toEqual([]);
    const codes = new Set(TMF_REFERENCE_MODEL.flatMap((z) => z.artifacts.map((a) => a.code)));
    const asKeyword = TMF_KEYWORD_RULES.flatMap((r) => r.phrases).filter((p) => !codes.has(p));
    expect(asKeyword.filter((p) => said(`zzz ${p} zzz`).code !== null), 'keywords reported as an artifact').toEqual([]);
  });

  it('no keyword is in two rules, and every keyword is lower-case words', () => {
    const all = TMF_KEYWORD_RULES.flatMap((r) => r.phrases);
    expect(all.filter((p, i) => all.indexOf(p) !== i), 'keywords in two rules').toEqual([]);
    expect(all.filter((p) => !/^[a-z0-9]+( [a-z0-9]+)*$/.test(p)), 'keywords that are not lower-case words').toEqual([]);
  });

  it('a longer keyword takes the words of a shorter one inside it', () => {
    expect(said('sample ICF template')).toEqual({ zone: 2, code: null });
    expect(said('Sample CRF pages')).toEqual({ zone: 2, code: null });
    expect(said('Master randomisation list')).toEqual({ zone: 11, code: null });
    expect(said('Randomization list - unblinded')).toEqual({ zone: 11, code: null });
  });

  it('what classified by keyword before still does', () => {
    const expected: Record<string, number> = {
      'Informed Consent Form v2': 4,
      'Monitoring Visit Report - Site 101': 5,
      'IND annual report': 3,
      'FDA correspondence log': 3,
      'Drug accountability log': 6,
      'Unblinding envelope receipt': 6,
      'DSUR 2026': 7,
      'Edit check specification': 10,
      'Vendor agreement - central imaging': 9,
      'Kickoff meeting minutes': 1,
    };
    expect(Object.fromEntries(Object.keys(expected).map((n) => [n, said(n).zone]))).toEqual(expected);
  });

  /* Each of these held before E1 and in E1. The first fix moved every one of
     them to the zone of the longer keyword (10, 2, 8, 6, 5, 8, 5). */
  it('between two keywords the earlier rule decides, however many words the later one has', () => {
    const expected: Record<string, number> = {
      'IRB approval - Case Report Form v2.pdf': 4,
      'IRB Approval - Investigator Brochure Edition 7.pdf': 4,
      'Ethics Committee approval - Lab Manual v3.pdf': 4,
      'IRB approval of Investigational Product label.pdf': 4,
      'IRB approval of site delegation log.pdf': 4,
      'FDA letter re central lab.pdf': 3,
      'SAE Report - Monitoring Visit follow-up.pdf': 7,
    };
    expect(Object.fromEntries(Object.keys(expected).map((n) => [n, said(n).zone]))).toEqual(expected);
  });

  it('a possessive still holds its keyword', () => {
    const expected: Record<string, number> = {
      "IRB's approval letter.pdf": 4,
      "FDA's response letter.pdf": 3,
      'IEC\u2019s roster.pdf': 4,
    };
    expect(Object.fromEntries(Object.keys(expected).map((n) => [n, said(n).zone]))).toEqual(expected);
  });

  /* Where a keyword contradicted the catalog's own placement of the same record. */
  it('a keyword agrees with the catalog about the record it names', () => {
    expect(said('Form FDA 3455 Financial Disclosure - Dr Smith.pdf')).toEqual({ zone: 5, code: null });
    expect(said('Randomization schedule.pdf')).toEqual({ zone: 11, code: null });
    expect(said('Randomisation procedure and code break.pdf')).toEqual({ zone: 11, code: null });
    expect(said('Unblinding envelope receipt')).toEqual({ zone: 6, code: null });
  });

  /* Recorded, not fixed: "site" alone still decides a name with no other
     keyword, in either spelling, as it did before E1 for the spaced one. */
  it('an underscore name is read exactly as its spaced spelling is', () => {
    const pairs: Array<[string, string]> = [
      ['ABC123_Site_101_Lab_Normal_Ranges_2026.pdf', 'ABC123 Site 101 Lab Normal Ranges 2026.pdf'],
      ['ABC123_Site_101_Temperature_Log.pdf', 'ABC123 Site 101 Temperature Log.pdf'],
      ['ABC123_IND_Safety_Report_2026_001.pdf', 'ABC123 IND Safety Report 2026 001.pdf'],
    ];
    expect(pairs.map(([u]) => said(u))).toEqual(pairs.map(([, spaced]) => said(spaced)));
    expect(said('ABC123_Site_101_Temperature_Log.pdf').zone).toBe(5);
  });
});

describe('Form FDA 1572 is filed in one place, however it is written', () => {
  const SPELLINGS = [
    'Form FDA 1572.pdf',
    'Form FDA 1572 - IRB copy.pdf',
    'FDA-1572_DrPatel.pdf',
    'form_fda_1572_site_04.pdf',
    'FDA1572.pdf',
    '1572 signed.pdf',
    'Statement of Investigator 1572.pdf',
  ];

  it('the classifier says Site Management (zone 5) for every spelling', () => {
    expect(Object.fromEntries(SPELLINGS.map((n) => [n, said(n).zone]))).toEqual(
      Object.fromEntries(SPELLINGS.map((n) => [n, 5])),
    );
  });

  it('Vault filing (service view) puts every spelling in the same folder, the classifier\'s', () => {
    expect(Object.fromEntries(SPELLINGS.map((n) => [n, classifyForFiling({ fileName: n, view: 'service' }).folderId]))).toEqual(
      Object.fromEntries(SPELLINGS.map((n) => [n, 'z05'])),
    );
  });

  it('the other FDA forms, and the dossier views, are filed where they were', () => {
    expect(classifyForFiling({ fileName: 'Form FDA 1571.pdf', view: 'service' }).folderId).toBe('z03');
    expect(classifyForFiling({ fileName: 'Form FDA 356h.pdf', view: 'service' }).folderId).toBe('z03');
    expect(classifyForFiling({ fileName: 'Form FDA 1572.pdf', view: 'pharma' }).folderId).toBe('module-1');
    expect(classifyForFiling({ fileName: 'Form FDA 1572.pdf', view: 'biotech' }).folderId).toBe('module-1');
  });
});

describe('Vault filing says how a TMF document was recognised', () => {
  it('a name that is a catalog artifact is not described as a keyword match', () => {
    const named = classifyForFiling({ fileName: 'Monitoring-Plan-v2.pdf', view: 'service' });
    expect(named.folderId).toBe('z01');
    expect(named.rationale).toContain('Monitoring Plan');
    expect(named.rationale).not.toMatch(/keyword/i);
  });

  it('a keyword match is described as one', () => {
    const byKeyword = classifyForFiling({ fileName: 'Monitoring visit report site 101.pdf', view: 'service' });
    expect(byKeyword.folderId).toBe('z05');
    expect(byKeyword.rationale).toMatch(/keyword/i);
  });

  /* Ingest always passes a title, and the Data Room passes the file name as
     the title. Read together ("Monitoring-Plan-v2.pdf Monitoring Plan v2") they
     are no artifact's name, so the first fix never said "Named as". */
  it('the file name and the title are read apart', () => {
    const both = classifyForFiling({ fileName: 'Monitoring-Plan-v2.pdf', title: 'Monitoring Plan v2', view: 'service' });
    expect(both.folderId).toBe('z01');
    expect(both.rationale).toContain('Named as the TMF artifact "Monitoring Plan"');
    const sameTwice = classifyForFiling({ fileName: 'SAE_followup_1234.pdf', title: 'SAE_followup_1234.pdf', view: 'service' });
    expect(sameTwice.folderId).toBe('z07');
    const titleOnly = classifyForFiling({ fileName: 'scan0001.pdf', title: 'Statistical Analysis Plan', view: 'service' });
    expect(titleOnly.folderId).toBe('z11');
    expect(titleOnly.rationale).toContain('Named as the TMF artifact "Statistical Analysis Plan"');
  });

  it('a name and a title that point to different zones are not filed, and neither is a name that points to two', () => {
    const disagree = classifyForFiling({ fileName: 'SAE reports.pdf', title: 'Monitoring Plan', view: 'service' });
    expect(disagree.folderId).toBeNull();
    expect(disagree.needsReview).toBe(true);
    const twoInName = classifyForFiling({ fileName: 'IRB approval of Sample Informed Consent Form.pdf', title: 'Sample Informed Consent Form', view: 'service' });
    expect(twoInName.folderId).toBeNull();
    expect(twoInName.needsReview).toBe(true);
  });
});
