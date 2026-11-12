/**
 * Vault filing classifier — unit contract.
 *
 * The load-bearing cases:
 *   1. TOTALITY — every folder a rule can emit exists in that view's preset
 *      taxonomy, so a suggestion can never point at a folder the tree does not
 *      render.
 *   2. FAIL CLOSED — an unclassifiable file returns folderId null +
 *      needsReview true (the visible Unfiled queue), never a guessed folder.
 *   3. VIEW FIDELITY — the same file files differently per client type
 *      (labeling → Module 1 for pharma, 'udi' for a device program), and a
 *      kind with no folder in a view (SOP in a pharma dossier) says so instead
 *      of inventing a place.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyForFiling,
  FILING_RULES,
  isFolderInView,
  folderLabel,
} from '../vault-filing.service';
import { classifyArtifact as classifyTmfArtifact } from '../../etmf/etmf-logic';
import {
  foldersForView,
  VAULT_VIEWS,
  type VaultViewId,
} from '../../../../shared/constants/domain/vault-taxonomy';

const ALL_VIEWS = VAULT_VIEWS.map(v => v.value) as VaultViewId[];

describe('FILING_RULES totality', () => {
  it('every rule target folder exists in the view preset it names', () => {
    for (const rule of FILING_RULES) {
      for (const [view, folderId] of Object.entries(rule.folders)) {
        const preset = foldersForView(view as VaultViewId);
        expect(
          preset.some(f => f.id === folderId),
          `rule "${rule.label}" targets folder "${folderId}" which is not in the ${view} preset`,
        ).toBe(true);
      }
    }
  });

  it('classifier output folder is always renderable for the input view', () => {
    const names = [
      'FDA-Day74-filing-communication.pdf',
      'form-fda-1571.pdf',
      'index.xml',
      'CTD-house-style-template.docx',
      '510k-eSTAR-package-v2.zip',
      'clinical-evaluation-report-2026.pdf',
      'RMF-risk-management-file-v3.pdf',
      'BX-204-IFU-EN.pdf',
      'MDR-vigilance-complaint-0218.pdf',
      'SOP-document-control.docx',
      'stability-report-24month.pdf',
      'toxicology-study-9001.pdf',
      'CSR-pivotal-phase-3.pdf',
      'protocol-amendment-3.docx',
      'informed-consent-form-site-12.pdf',
      'randomization-list-sealed.xlsx',
    ];
    for (const view of ALL_VIEWS) {
      for (const fileName of names) {
        const c = classifyForFiling({ fileName, view });
        if (c.folderId != null) {
          expect(
            isFolderInView(view, c.folderId),
            `"${fileName}" (${view}) → "${c.folderId}" is not in the ${view} preset`,
          ).toBe(true);
          expect(c.needsReview).toBe(false);
          expect(c.rationale.length).toBeGreaterThan(0);
        } else {
          expect(c.needsReview).toBe(true);
          expect(c.confidence).toBe('none');
        }
      }
    }
  });
});

describe('fail-closed on unclassifiable input', () => {
  it('a meaningless filename lands in the Unfiled queue, not a guessed folder', () => {
    const c = classifyForFiling({ fileName: 'scan0001.pdf', view: 'pharma' });
    expect(c.folderId).toBeNull();
    expect(c.evidenceKind).toBeNull();
    expect(c.needsReview).toBe(true);
    expect(c.confidence).toBe('none');
    expect(c.rationale).toMatch(/needs a person/i);
  });

  it('an empty name with no text is unfiled everywhere', () => {
    for (const view of ALL_VIEWS) {
      const c = classifyForFiling({ fileName: '', view });
      expect(c.folderId).toBeNull();
      expect(c.needsReview).toBe(true);
    }
  });

  it('a name the TMF classifier leaves unclassified stays unfiled in the service view', () => {
    // etmf-logic returns an unmatched name as 'unclassified', with no zone (it
    // defaulted to Zone 2 until 2026-10-15); filing must not invent a placement.
    expect(classifyTmfArtifact('holiday-photos-notes.txt')).toMatchObject({ zone: null, confidence: 'unclassified' });
    const c = classifyForFiling({ fileName: 'holiday-photos-notes.txt', view: 'service' });
    expect(c.folderId).toBeNull();
    expect(c.needsReview).toBe(true);
  });
});

describe('view fidelity — the same file files by client type', () => {
  it('labeling: pharma → Module 1, device → udi', () => {
    const pharma = classifyForFiling({ fileName: 'USPI-draft-labeling-v4.docx', view: 'pharma' });
    expect(pharma.folderId).toBe('module-1');
    const device = classifyForFiling({ fileName: 'BX-204-IFU-EN-v2.7.pdf', view: 'device' });
    expect(device.folderId).toBe('udi');
    expect(device.evidenceKind).toBe('label');
  });

  it('CTD content: stability → Module 3, toxicology → Module 4, CSR → Module 5', () => {
    const stab = classifyForFiling({ fileName: 'stability-summary-24m.pdf', view: 'biotech' });
    expect(stab.folderId).toBe('module-3');
    expect(stab.ctdSection).toBe('3.2.P.8');
    const tox = classifyForFiling({ fileName: 'repeat-dose-toxicology-rat.pdf', view: 'pharma' });
    expect(tox.folderId).toBe('module-4');
    const csr = classifyForFiling({ fileName: 'CSR-BX204-301-efficacy.pdf', view: 'pharma' });
    expect(csr.folderId).toBe('module-5');
  });

  it('device engineering: risk file → eng with a rationale', () => {
    const c = classifyForFiling({ fileName: 'RMF-residual-risk-v3.1.pdf', view: 'device' });
    expect(c.folderId).toBe('eng');
    expect(c.confidence).toBe('high');
    expect(c.rationale).toContain('eng');
  });

  it('an SOP in a pharma dossier vault is honestly not placeable', () => {
    const c = classifyForFiling({ fileName: 'SOP-021-document-control.docx', view: 'pharma' });
    expect(c.evidenceKind).toBe('qms');       // it knows WHAT it is…
    expect(c.folderId).toBeNull();            // …and refuses to invent a WHERE
    expect(c.needsReview).toBe(true);
    expect(c.rationale).toMatch(/Quality module/i);
    // The same file in a device program has a real QMS folder.
    const dev = classifyForFiling({ fileName: 'SOP-021-document-control.docx', view: 'device' });
    expect(dev.folderId).toBe('qms');
    expect(dev.needsReview).toBe(false);
  });

  it('service view files by TMF zone on a keyword match', () => {
    const c = classifyForFiling({ fileName: 'site-12-delegation-log.pdf', view: 'service' });
    expect(c.folderId).toBe('z05');
    expect(c.confidence).toBe('medium');
  });

  it('correspondence and templates file in every view', () => {
    for (const view of ALL_VIEWS) {
      expect(classifyForFiling({ fileName: 'FDA-information-request-2026-08.pdf', view }).folderId).toBe('corresp');
      expect(classifyForFiling({ fileName: 'CSR-house-style-template.docx', view }).folderId).toBe('shared');
    }
  });
});

describe('document-body fallback', () => {
  it('uses bounded text only when the name says nothing', () => {
    const c = classifyForFiling({
      fileName: 'document-final-2.pdf',
      view: 'pharma',
      extractedText: 'STUDY BX-204-301   Clinical Study Report   ICH E3 …',
    });
    expect(c.folderId).toBe('module-5');
    expect(c.confidence).toBe('medium');
    expect(c.rationale).toMatch(/text contains/i);
  });

  it('a name match wins over body text', () => {
    const c = classifyForFiling({
      fileName: 'stability-trend-24m.pdf',
      view: 'pharma',
      extractedText: 'Clinical Study Report',
    });
    expect(c.folderId).toBe('module-3');
  });
});

describe('folderLabel', () => {
  it('labels a real folder and never invents one', () => {
    expect(folderLabel('pharma', 'module-3')).toContain('Module 3');
    expect(folderLabel('device', 'not-a-folder')).toBe('');
    expect(folderLabel('device', null)).toBe('');
  });
});

/* VR-04 (row D4): beside 'Confirm filing', a proposal is either right or
   honestly 'needs review'. The CTD patterns were unanchored substrings, a
   generic safety pattern ran before the ISS one, and a module fallback emitted
   a non-section 'N.0'. */
describe('CTD proposals you can trust (VR-04)', () => {
  const pharma = (fileName: string) => classifyForFiling({ fileName, view: 'pharma' });

  it('a word inside another word is not a section: "Permission" is not ISS, "Otherwise" is not ISE', () => {
    for (const f of ['Permission to cross-reference.pdf', 'Otherwise unrelated memo.docx']) {
      const c = pharma(f);
      expect(`${c.ctdSection}/${c.confidence}`, f).not.toBe('5.3.5.3/high');
    }
  });

  it('an Integrated Summary of Safety is proposed at 5.3.5.3, not the generic 5.3.5', () => {
    expect(pharma('Integrated Summary of Safety.pdf').ctdSection).toBe('5.3.5.3');
    expect(pharma('Integrated Summary of Efficacy.pdf').ctdSection).toBe('5.3.5.3');
  });

  it('a safety data sheet is not a clinical safety study', () => {
    expect(pharma('Safety Data Sheet - ethanol.pdf').ctdSection).toBeNull();
  });

  it('"Item2" is not Module 2, and a bare module is never proposed as a section', () => {
    expect(pharma('Item2 notes.pdf').ctdSection).toBeNull();
    for (const f of ['Module 3 quality notes.pdf', 'M4 summary.pdf']) {
      const c = pharma(f);
      expect(c.ctdSection, f).toBeNull();
      expect(c.confidence, f).not.toBe('high');
    }
    expect(pharma('Module 3 quality notes.pdf').folderId).toBe('module-3');
  });

  it('clinical pharmacology is Module 5, not the nonclinical pharmacology of Module 4', () => {
    expect(pharma('Clinical Pharmacology report.pdf').ctdSection).toBe('5.3.3');
  });

  it('positive controls stay put', () => {
    expect(pharma('Clinical Overview.pdf').ctdSection).toBe('2.5');
    expect(pharma('ISS tables.pdf').ctdSection).toBe('5.3.5.3');
    expect(pharma('stability-protocol.pdf').ctdSection).toBe('3.2.P.8');
    // FDA regional Module 1: 1.1 is FORMS, 1.2 is the Cover Letter (shared/regulatory/regional-module1.ts).
    // This control pinned 1.1 — the swapped pair the ingestion detector carried until 2026-10-12.
    expect(pharma('cover letter.pdf').ctdSection).toBe('1.2');
    expect(pharma('Nonclinical Overview.pdf').ctdSection).toBe('2.4');
  });
});

describe("the uploader's declared type informs the proposal (VR-04)", () => {
  it('a declared PROTOCOL on a neutral filename is a protocol', () => {
    const c = classifyForFiling({ fileName: 'scan-0042.pdf', view: 'pharma', documentType: 'PROTOCOL' });
    expect(c.evidenceKind).toBe('protocol');
    expect(c.rationale).toMatch(/Protocol/);
  });

  it('a declared type that contradicts the filename is flagged for review naming both, not overridden', () => {
    const c = classifyForFiling({ fileName: 'stability-summary-24m.pdf', view: 'pharma', documentType: 'CSR' });
    expect(c.needsReview).toBe(true);
    expect(c.folderId).toBeNull();
    expect(c.rationale).toMatch(/Clinical study report/);
    expect(c.rationale).toMatch(/Module 3/);
  });

  it('a declared type that agrees with the filename keeps the placement and the more specific kind', () => {
    const c = classifyForFiling({ fileName: 'CSR-BX204-301-efficacy.pdf', view: 'pharma', documentType: 'CSR' });
    expect(c.needsReview).toBe(false);
    expect(c.folderId).toBe('module-5');
    expect(c.evidenceKind).toBe('csr');
  });

  it('OTHER, or no declared type, changes nothing', () => {
    const plain = classifyForFiling({ fileName: 'stability-summary-24m.pdf', view: 'pharma' });
    expect(classifyForFiling({ fileName: 'stability-summary-24m.pdf', view: 'pharma', documentType: 'OTHER' })).toEqual(plain);
  });
});

/* S6 (2026-11-05): Module 1 is the CTD's one regional module (ICH M4), and the rule tables state the US
   heading. Labeling was proposed at 1.14 and the IB at 1.14.4.1 for every CTD project, so an EMA project's
   SmPC and a PMDA project's package insert were proposed at US 1.14. The project's region now selects the
   heading from the regional Module 1 record (shared/regulatory/regional-module1.ts). */
describe("Module 1 proposals follow the project's region (S6)", () => {
  const IB_TEXT = "Investigator's Brochure, edition 7. Summary of data and guidance for the investigator.";
  const ib = (jurisdiction?: 'US' | 'EU' | 'JP' | 'CA' | null, applicationKind?: string | null) => classifyForFiling({
    fileName: 'document-final-2.pdf', view: 'pharma', extractedText: IB_TEXT, jurisdiction, applicationKind,
  });

  it('US: labeling at 1.14 and the IB at 1.14.4.1, exactly as before', () => {
    const before = classifyForFiling({ fileName: 'USPI-draft-labeling-v4.docx', view: 'pharma' });
    expect(before.ctdSection).toBe('1.14');
    for (const applicationKind of ['ind', 'nda', null]) {
      expect(classifyForFiling({ fileName: 'USPI-draft-labeling-v4.docx', view: 'pharma', jurisdiction: 'US', applicationKind }))
        .toEqual(before);
    }
    expect(ib().ctdSection).toBe('1.14.4.1');
    expect(ib('US', 'ind')).toEqual(ib());
    expect(classifyForFiling({ fileName: 'form-fda-1571.pdf', view: 'pharma', jurisdiction: 'US', applicationKind: 'ind' }))
      .toEqual(classifyForFiling({ fileName: 'form-fda-1571.pdf', view: 'pharma' }));
  });

  it("EU: an EMA project's labeling is proposed at 1.3.1, the SmPC heading", () => {
    const c = classifyForFiling({ fileName: 'SmPC-draft-labelling-v2.docx', view: 'pharma', jurisdiction: 'EU', applicationKind: 'maa' });
    expect(c.folderId).toBe('module-1');
    expect(c.ctdSection).toBe('1.3.1');
    expect(c.needsReview).toBe(false);
    expect(c.rationale).toMatch(/EU 1\.3\.1, SmPC, Labelling and Package Leaflet/);
    expect(classifyForFiling({ fileName: 'SmPC-draft-labelling-v2.docx', view: 'biotech', jurisdiction: 'EU', applicationKind: null }).ctdSection)
      .toBe('1.3.1');
  });

  it("JP: a PMDA project's package insert is proposed at 1.8, Package Insert (Draft)", () => {
    const c = classifyForFiling({ fileName: 'package-insert-draft-ja.docx', view: 'pharma', jurisdiction: 'JP', applicationKind: 'jnda' });
    expect(c.folderId).toBe('module-1');
    expect(c.ctdSection).toBe('1.8');
    expect(c.needsReview).toBe(false);
    expect(c.rationale).toMatch(/JP 1\.8, Package Insert \(Draft\)/);
  });

  it('EU and JP: the record holds no Module 1 heading for an IB, so none is proposed and a person places it', () => {
    for (const j of ['EU', 'JP'] as const) {
      const c = ib(j, j === 'EU' ? 'maa' : 'jnda');
      expect(c.folderId, j).toBe('module-1');
      expect(c.ctdSection, j).toBeNull();
      expect(c.needsReview, j).toBe(true);
      expect(c.rationale, j).toMatch(new RegExp(`The ${j} Module 1 holds no single heading for this document`));
    }
  });

  it('an application the regional tree does not model gets no heading: an EU CTA is not an MAA', () => {
    const c = classifyForFiling({ fileName: 'SmPC-draft-labelling-v2.docx', view: 'pharma', jurisdiction: 'EU', applicationKind: 'cta' });
    expect(c.ctdSection).toBeNull();
    expect(c.needsReview).toBe(true);
    expect(c.rationale).toMatch(/in this application \(CTA\)/);
  });

  it('a US-only rule gives no other region a heading: an FDA form in an EU project', () => {
    const c = classifyForFiling({ fileName: 'form-fda-1571.pdf', view: 'pharma', jurisdiction: 'EU', applicationKind: 'maa' });
    expect(c.folderId).toBe('module-1');
    expect(c.ctdSection).toBeNull();
    expect(c.needsReview).toBe(true);
    // An FDA form number names a US form even through the CTD filename detector.
    for (const fileName of ['356h-application.pdf', 'Form 1571 signed.pdf']) {
      expect(classifyForFiling({ fileName, view: 'pharma', jurisdiction: 'EU', applicationKind: 'maa' }).ctdSection, fileName).toBeNull();
    }
  });


  it("CA, AU, or an agency that names no region: Module 1, no section, needs review, and the rationale says why", () => {
    for (const j of ['CA', 'AU'] as const) {
      const c = classifyForFiling({ fileName: 'product-monograph-labeling.docx', view: 'pharma', jurisdiction: j, applicationKind: 'nda' });
      expect(c.folderId, j).toBe('module-1');
      expect(c.ctdSection, j).toBeNull();
      expect(c.needsReview, j).toBe(true);
      expect(c.confidence, j).toBe('medium');
      expect(c.rationale, j).toMatch(new RegExp(`the ${j} Module 1 is not modelled here, so no section is proposed`));
    }
    const unknown = classifyForFiling({ fileName: 'product-monograph-labeling.docx', view: 'pharma', jurisdiction: null });
    expect(unknown.ctdSection).toBeNull();
    expect(unknown.needsReview).toBe(true);
    expect(unknown.rationale).toMatch(/agency names no region whose Module 1 is modelled here/);
    expect(ib('CA', 'nda').ctdSection).toBeNull();
  });

  it('Modules 2 to 5 and the device views do not depend on the region', () => {
    for (const j of ['EU', 'JP', 'CA', null] as const) {
      expect(classifyForFiling({ fileName: 'stability-summary-24m.pdf', view: 'biotech', jurisdiction: j }).ctdSection).toBe('3.2.P.8');
      expect(classifyForFiling({ fileName: 'CSR-BX204-301-efficacy.pdf', view: 'pharma', jurisdiction: j }).folderId).toBe('module-5');
      expect(classifyForFiling({ fileName: 'BX-204-IFU-EN-v2.7.pdf', view: 'device', jurisdiction: j }))
        .toEqual(classifyForFiling({ fileName: 'BX-204-IFU-EN-v2.7.pdf', view: 'device' }));
    }
  });

  it('a module-only proposal names no US heading, so it is left as it is', () => {
    const before = classifyForFiling({ fileName: 'Module 1 administrative notes.pdf', view: 'pharma' });
    expect(before.ctdSection).toBeNull();
    expect(classifyForFiling({ fileName: 'Module 1 administrative notes.pdf', view: 'pharma', jurisdiction: 'CA' })).toEqual(before);
  });
});

/* S6/F1 (2026-11-05): the CTD filename detector names what a Module 1 document is, so its region's heading is read
   from the record as for labeling. A cover letter was proposed at US 1.2 in every region, or none. */
describe("the CTD filename detector's Module 1 documents follow the project's region (F1)", () => {
  it("the CTD filename detector's Module 1 documents take their region's heading from the record", () => {
    const at = (fileName: string, jurisdiction: 'EU' | 'JP', applicationKind: string) =>
      classifyForFiling({ fileName, view: 'pharma', jurisdiction, applicationKind });
    expect(at('cover letter.pdf', 'EU', 'maa')).toMatchObject({ folderId: 'module-1', ctdSection: '1.0', needsReview: false });
    expect(at('cover letter.pdf', 'EU', 'maa').rationale).toMatch(/EU 1\.0, Cover Letter/);
    expect(at('Application form MAA.pdf', 'EU', 'maa').ctdSection).toBe('1.2');
    const rmp = at('RMP draft.pdf', 'EU', 'maa');
    expect(rmp.ctdSection).toBe('1.8.2');
    // The US record gives an RMP no heading; the region's does, and the reason says that, not "no section".
    expect(rmp.rationale).toMatch(/^The file name names a Module 1 document\. Module 1 follows the project's region: EU 1\.8\.2/);
    expect(at('Application form.pdf', 'JP', 'jnda').ctdSection).toBe('1.2');
    expect(at('patent status.pdf', 'JP', 'jnda').ctdSection).toBe('1.4');
    expect(at('RMP draft.pdf', 'JP', 'jnda').ctdSection).toBe('1.11');
    // Where the region's record holds no heading for it, none is proposed and a person places it.
    for (const [fileName, j, kind] of [['patent certification.pdf', 'EU', 'maa'], ['cover letter.pdf', 'JP', 'jnda']] as const) {
      const c = at(fileName, j, kind);
      expect(c.ctdSection, fileName).toBeNull();
      expect(c.needsReview, fileName).toBe(true);
      expect(c.rationale, fileName).toMatch(new RegExp(`The ${j} Module 1 holds no single heading for this document`));
    }
  });

  it("the CTD filename detector's US headings are unchanged", () => {
    for (const fileName of ['cover letter.pdf', 'Application form.pdf', 'patent information.pdf', 'RMP draft.pdf', '356h-application.pdf']) {
      const before = classifyForFiling({ fileName, view: 'pharma' });
      expect(classifyForFiling({ fileName, view: 'pharma', jurisdiction: 'US', applicationKind: 'nda' }), fileName).toEqual(before);
    }
    expect(classifyForFiling({ fileName: 'cover letter.pdf', view: 'pharma' }).ctdSection).toBe('1.2');
    expect(classifyForFiling({ fileName: 'RMP draft.pdf', view: 'pharma' }).ctdSection).toBeNull();
  });
});

/* J2 human test (2026-11-06): a data-room letter filed itself and the note under "Looks like" read
   "filed to corresp for the biotech view" — a folder id and an internal view name, not the folder a person sees. */
describe('the classifier note names the folder a person sees', () => {
  it('says the folder by its label, never its id or the view', () => {
    const c = classifyForFiling({ fileName: '[Demo] FDA information request - IND C2C-101.txt', view: 'biotech' });
    expect(c.folderId).toBe('corresp');
    expect(c.rationale).toBe('Matched agency correspondence — filed to Agency correspondence.');
    expect(c.rationale).not.toMatch(/\bcorresp\b|biotech view/);
  });
});

/* Decided as the subject-matter expert under the founder's instruction of 2026-11-10 ("you decide as the SME would"):
   in a pharma or biotech Vault a "Risk management plan" is the dossier's own document (the EU RMP, Module 1.8.2), and
   the device rule for the ISO 14971 risk file does not claim it there. In a device Vault the same name is part of the
   risk management file, as before. Evidence: docs/evidence/SPINE/S6/2026-11-10-rmp-classifier/. */
describe('a Risk management plan belongs to the dossier in a pharma or biotech Vault', () => {
  const RMP_NAMES = ['Risk management plan.pdf', 'Risk-Management-Plan-v2.docx', 'EU Risk Management System.pdf'];

  it("is proposed for Module 1 at its region's heading, the same answer the name RMP already gets", () => {
    for (const view of ['pharma', 'biotech'] as const) {
      for (const fileName of RMP_NAMES) {
        const eu = classifyForFiling({ fileName, view, jurisdiction: 'EU', applicationKind: 'maa' });
        expect(eu, `${view} ${fileName}`).toMatchObject({ folderId: 'module-1', ctdSection: '1.8.2', needsReview: false });
        expect(eu.rationale, fileName).toMatch(/Module 1 follows the project's region: EU 1\.8\.2/);
        expect(classifyForFiling({ fileName, view, jurisdiction: 'JP', applicationKind: 'jnda' }).ctdSection, fileName).toBe('1.11');
        // No region given (the US record, which gives an RMP no single heading): Module 1, and a person confirms where.
        expect(classifyForFiling({ fileName, view }), fileName).toEqual(classifyForFiling({ fileName: 'RMP draft.pdf', view }));
      }
    }
  });

  it('is never told it is a device risk file, or a quality-system record', () => {
    for (const fileName of RMP_NAMES) {
      const c = classifyForFiling({ fileName, view: 'pharma' });
      expect(c.rationale, fileName).not.toMatch(/engineering|DHF|risk file|Quality module/i);
      expect(c.folderId, fileName).toBe('module-1');
    }
  });

  it('in a device or IVD Vault the same name is still part of the risk management file', () => {
    for (const view of ['device', 'ivd'] as const) {
      for (const fileName of RMP_NAMES.slice(0, 2)) {
        expect(classifyForFiling({ fileName, view }), `${view} ${fileName}`).toMatchObject({ folderId: 'eng', evidenceKind: 'report', needsReview: false });
      }
    }
  });

  it("a device risk file's own names are not claimed for the dossier", () => {
    for (const fileName of ['Risk management file ISO 14971.pdf', 'ISO 14971 risk management plan.pdf', 'Device risk management plan.pdf', 'RMF risk analysis report.pdf', 'FMEA.xlsx']) {
      const c = classifyForFiling({ fileName, view: 'pharma', jurisdiction: 'EU', applicationKind: 'maa' });
      expect(c, fileName).toMatchObject({ folderId: null, ctdSection: null, needsReview: true, evidenceKind: 'report' });
      expect(c.rationale, fileName).toMatch(/^Matched engineering \/ DHF \/ risk file, but the pharma vault has no folder for that kind/);
    }
  });
});

describe('a kind with no folder in this Vault says only what is true of it', () => {
  it('says quality-system records live in the Quality module for a quality-system record only', () => {
    expect(classifyForFiling({ fileName: 'SOP-021-document-control.docx', view: 'pharma' }).rationale)
      .toBe('Matched quality-system record, but the pharma vault has no folder for that kind. Quality-system records live in the Quality module, not the dossier: review where it belongs.');
    for (const [fileName, view, label] of [
      ['Design verification report.pdf', 'pharma', 'engineering / DHF / risk file'],
      ['PSUR 2026.pdf', 'biotech', 'post-market vigilance record'],
      ['510k predicate comparison.pdf', 'pharma', '510(k) / eSTAR submission artifact'],
      ['ectd sequence 0003 index.xml', 'device', 'eCTD sequence artifact'],
    ] as const) {
      const c = classifyForFiling({ fileName, view });
      expect(c, fileName).toMatchObject({ folderId: null, needsReview: true, confidence: 'none' });
      expect(c.rationale, fileName).toBe(`Matched ${label}, but the ${view} vault has no folder for that kind. Review where it belongs.`);
      expect(c.rationale, fileName).not.toMatch(/Quality module/);
    }
  });
});
