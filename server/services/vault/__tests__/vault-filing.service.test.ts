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

  it('the TMF default zone is NOT treated as a finding — service-view no-match stays unfiled', () => {
    // etmf-logic defaults unmatched names to Zone 2; filing must not adopt a
    // placeholder as a placement.
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
    expect(pharma('cover letter.pdf').ctdSection).toBe('1.1');
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
