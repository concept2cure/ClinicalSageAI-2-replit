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
