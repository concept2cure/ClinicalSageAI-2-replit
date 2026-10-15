/**
 * Wording seen only in a search engine's extract of a regulator-hosted page is
 * `recall`, and every reader is told so (finding #31, widened; 2026-10-15).
 *
 * shared/regulatory/regulatory-basis.ts defines `regulator-text` as wording
 * confirmed against the regulator's own copy (a regulator URL or a vendored
 * artifact) and `recall` as covering "secondary sources, search extracts,
 * memory"; jp-programs.ts already labels a search extract `recall` with a note.
 *
 * What the code used to do: the bases below were labelled `regulator-text`
 * although each one's own comment, note or evidence record says the regulator
 * host could not be fetched and the wording was matched against search results,
 * and the CSR brief rendered them as "checked against the regulator's text
 * 2026-10-04":
 *   - server/services/ind/ctd/regulatory-basis.ts, all 14 shared constants
 *     (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/research.md;
 *     2026-10-05-record/g-basis-constants-one-home-facts.md;
 *     2026-10-04-depth/b3-safety-presentation-facts.md, b1-plr-rules-elsa-facts.md);
 *   - ind/ctd/lifecycle-document-types.ts, the PDUFA VII, formal-meetings draft
 *     and ICH E2F bases (2026-10-04-depth/b3-meetings-dsur-facts.md);
 *   - ana/promotional-screening.ts, five submission terms of art
 *     (2026-10-04-depth/b3-writing-gate-register-facts.md);
 *   - combination-products (21 CFR Part 3, 4.4(b)(1)), global-ri/labeling-
 *     requirements (the MHLW/PMDA package-insert notices), market-specs/
 *     device-labeling (809.10, 812.5, 812.2) and software-lifecycle
 *     (Documentation Level), whose own notes said "search extract" or "search
 *     results";
 *   - pathway-engines/ctis/ctr-annex-i.ts, the Annex I rows read in a search
 *     snippet (2026-10-05-record/g-ctis-annex-i-readiness-facts.md);
 *   - shared/regulatory/qmsr-crosswalk.ts (820.10(c), 820.35) and
 *     regional-module1.ts (EU M1 v3.1, the EMA eCTD guidance, three MHLW/PMDA
 *     notices), whose notes said "search extract".
 * The US Module 1 controlled-vocabulary bases stay `regulator-text`: they were
 * read from the FDA package vendored in this repository.
 */
import { describe, it, expect } from 'vitest';
import { basisLabel, type RegulatoryBasis } from '../../../../../shared/regulatory/regulatory-basis';
import { QMSR_CROSSWALK } from '../../../../../shared/regulatory/qmsr-crosswalk';
import { REGIONAL_MODULE1, flattenModule1 } from '../../../../../shared/regulatory/regional-module1';
import * as home from '../regulatory-basis';
import { ICH_E3_GUIDANCE, renderE3Brief } from '../csr-e3-guidance';
import { ICH_M4_HEADINGS } from '../ich-m4-headings';
import { FDA_FORMAL_MEETING_TIMELINES, ICH_E2F_DSUR_SECTIONS, meetingPackageDeadline } from '../lifecycle-document-types';
import { screenPromotionalLanguage } from '../../../ana/promotional-screening';
import { listCitations, listDeviceProvisionsForDrugBase } from '../../../combination-products/combination-products-knowledge';
import { LABELING_REQUIREMENTS, OBSOLETE_LABELING_SECTIONS, flattenLabelingSections } from '../../../global-ri/labeling-requirements';
import { deviceLabelingRequirements } from '../../../market-specs/device-labeling';
import { fdaDocumentationLevel } from '../../../market-specs/software-lifecycle';
import { CTR_ANNEX_I } from '../../../pathway-engines/ctis/ctr-annex-i';

/** How each of these records says a passage was seen only in search results. */
const SEARCH = /search (extract|result|snippet)/i;

type Labelled = { confidence: string; note?: string };

/** Seen in a search extract: labelled recall, and the note says what it rests on. */
function expectSearchExtractRecall(b: Labelled, where: string): void {
  expect(b.confidence, where).toBe('recall');
  expect(b.note ?? '', where).toMatch(SEARCH);
}

const SHARED_CONSTANTS = [
  'FDA_E3', 'E3_QA_R1', 'FDA_PDF_SPECS', 'FDA_STUDY_DATA_TRC', 'FDA_SDTCG', 'FDA_ECTD_TCG', 'M4E_R2',
  'FDA_ISS_ISE_PLACEMENT', 'FDA_ISE_GUIDANCE', 'FDA_STF_IG', 'FDA_OCMQ', 'CFR_314_50_F', 'CFR_314_101',
] as const;

const SUBMISSION_TERMS_TEXT = [
  'FDA granted Breakthrough Therapy designation to drug X for this indication.',
  'Patients randomized to the control arm received best supportive care.',
  'Clinical cure at the test-of-cure visit was the primary efficacy endpoint.',
  'The baseline pathogen was eradicated at the test-of-cure visit.',
  'All patients provided written informed consent before any study-specific procedure was performed.',
].join(' ');

/** Every FDA IVD and investigational label element the engine can list. */
function deviceLabelElements() {
  const sets = [{ isIvd: true }, { forClinicalInvestigation: true }, { isIvd: true, isRuo: true, isIuo: true }].map((facts) => {
    const r = deviceLabelingRequirements(facts);
    return [...r.fdaLabel, ...r.fdaIvdLabel, ...r.fdaIvdInsert];
  });
  return sets.flat().filter((e) => e.basisDetail);
}

describe('ind/ctd: the shared regulator documents were read only in search extracts', () => {
  it('each shared constant is recall with a search-extract note, and reads as not checked', () => {
    for (const name of SHARED_CONSTANTS) {
      const b = home[name] as RegulatoryBasis;
      expectSearchExtractRecall(b, name);
      expect(basisLabel(b), name).toMatch(/recall — not checked against the regulator's text/);
    }
    expectSearchExtractRecall(home.cfr201_57('(d)(6)'), 'cfr201_57');
  });

  it("no CSR heading's brief says a search extract was checked against the regulator's text", () => {
    for (const s of ICH_E3_GUIDANCE) {
      expect(renderE3Brief(s.number, 100_000), s.number).not.toMatch(/(?<!not )checked against the regulator's text/);
    }
  });

  it('a non-E3 recall basis is not called "ICH E3 (1995) as recalled"; it says it rests on a search extract', () => {
    const brief = renderE3Brief('12.2.2', 100_000) ?? '';
    const stf = brief.split('\n').find((l) => l.startsWith(`- ${home.FDA_STF_IG.ref}`));
    expect(stf).toBeDefined();
    expect(stf).not.toMatch(/ICH E3 \(1995\)/);
    expect(stf).toMatch(/recall/);
    expect(stf).toMatch(SEARCH);
    // The heading's own E3 citation keeps its wording.
    expect(brief).toMatch(/- ICH E3 §12\.2\.2 — ICH E3 \(1995\) as recalled; verbatim check owed/);
  });

  it('the ICH M4 headings that cite M4E(R2) are recall, and no note promises regulator text for a declaration', () => {
    for (const h of ICH_M4_HEADINGS) {
      expect(h.basis.confidence, h.code).not.toBe('regulator-text');
      expect(h.basis.note ?? '', h.code).not.toMatch(/regulator-text once/);
    }
  });

  it('the formal-meeting and ICH E2F bases are recall, and every package deadline is said to be unread', () => {
    for (const row of Object.values(FDA_FORMAL_MEETING_TIMELINES)) {
      for (const b of row.basis) {
        expect(b.confidence, `${row.type}: ${b.ref}`).not.toBe('regulator-text');
        if (b.url) expectSearchExtractRecall(b, `${row.type}: ${b.ref}`);
      }
      expect(meetingPackageDeadline(row.type), row.type).toMatch(/recall/);
    }
    for (const s of ICH_E2F_DSUR_SECTIONS) expectSearchExtractRecall(s.basis[0], s.title);
  });
});

describe('the other records that labelled a search extract regulator-text', () => {
  it("the writing gate's submission terms of art", () => {
    const { exempted } = screenPromotionalLanguage(SUBMISSION_TERMS_TEXT, { register: 'submission' });
    const refs = new Set(exempted.map((e) => e.basis.ref));
    expect(refs.size).toBe(5);
    for (const e of exempted) expectSearchExtractRecall(e.basis, e.basis.ref);
    // The consent statement cites ICH E3 itself, not FDA's copy of the E3 Q&A (R1).
    const consent = exempted.find((e) => /§5\.3/.test(e.basis.ref));
    expect(consent?.basis.url).toBe(home.FDA_E3.url);
  });

  it('combination products: 21 CFR Part 3 and the QMSR 4.4(b)(1) call-outs', () => {
    const cited = listCitations().filter((c) => c.basis);
    expect(cited.length).toBeGreaterThan(5);
    for (const c of cited) expectSearchExtractRecall(c.basis!, c.id);
    for (const p of listDeviceProvisionsForDrugBase('2026-10-15')) expectSearchExtractRecall(p.basis, p.citation);
  });

  it('the Japanese package insert: headings seen in a search extract are recall that says so', () => {
    const bases = flattenLabelingSections(LABELING_REQUIREMENTS.PMDA).flatMap((s) => s.basis ?? []);
    const obsolete = (OBSOLETE_LABELING_SECTIONS.PMDA ?? []).flatMap((o) => o.basis);
    for (const b of [...bases, ...obsolete]) expect(b.confidence, b.ref).not.toBe('regulator-text');
    const seen = [...bases, ...obsolete].filter((b) => SEARCH.test(b.note ?? ''));
    expect(seen.length).toBeGreaterThan(0);
    for (const b of seen) expectSearchExtractRecall(b, b.ref);
  });

  it('device labeling (809.10, 812.5) and the software Documentation Level', () => {
    const els = deviceLabelElements();
    expect(els.length).toBeGreaterThan(20);
    for (const e of els) expectSearchExtractRecall(e.basisDetail!, e.id);
    expectSearchExtractRecall(fdaDocumentationLevel({}).basis[0], 'Documentation Level definition');
  });

  it('EU CTR Annex I: every row is recall; the rows read in a search snippet say so', () => {
    for (const r of CTR_ANNEX_I) expect(r.basis.confidence, r.id).toBe('recall');
    expect(CTR_ANNEX_I.filter((r) => SEARCH.test(r.basis.note)).map((r) => r.id)).toEqual([
      'gmp-manufacturing', 'recruitment-arrangements', 'subject-information-consent', 'facilities-suitability',
      'insurance', 'financial-arrangements', 'fee-payment', 'data-protection', 'biological-samples',
    ]);
  });

  it('the QMSR crosswalk: 820.10(c) and 820.35 are recall, and no note calls a search extract regulator text', () => {
    for (const r of QMSR_CROSSWALK) {
      expect(r.basis.confidence, r.id).toBe('recall');
      expect(r.basis.note ?? '', r.id).not.toMatch(/is regulator text/i);
    }
    for (const id of ['design_controls', 'feedback_complaints']) {
      expectSearchExtractRecall(QMSR_CROSSWALK.find((r) => r.id === id)!.basis, id);
    }
  });

  it('regional Module 1: EU and JP are recall; the US controlled vocabulary, read from the vendored file, stays regulator-text', () => {
    for (const j of ['EU', 'JP'] as const) {
      expectSearchExtractRecall(REGIONAL_MODULE1[j].spec, `${j} spec`);
      for (const n of flattenModule1(j)) {
        for (const b of n.basis) expect(b.confidence, `${j} ${n.number}: ${b.ref}`).not.toBe('regulator-text');
      }
    }
    const usRead = flattenModule1('US').flatMap((n) => n.basis).filter((b) => b.confidence === 'regulator-text');
    expect(usRead.length).toBeGreaterThan(0);
    for (const b of usRead) expect(b.vendored, b.ref).toBe('server/services/ectd/controlled-vocab/cv-v4-data.ts');
  });
});
