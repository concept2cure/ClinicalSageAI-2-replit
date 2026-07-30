/**
 * Canonical document lifecycle spine — gate invariants.
 *
 * The spine's value is that every stage transition is fail-closed: approval,
 * placement, packaging, and submission cannot happen without their evidence, and
 * an approved document is immutable (no path back to authoring). These tests hold
 * those invariants so the one canonical spine cannot silently loosen.
 */

import { describe, it, expect } from 'vitest';
import {
  canAdvanceDocument,
  buildAuditEvent,
  isCompletePlacement,
  stageProgress,
  FORWARD_STAGE_ORDER,
  STAGE_SUBSYSTEM,
  DOCUMENT_STAGES,
  type RegulatedDocumentState,
  type DossierPlacement,
} from '../document-lifecycle';

const placement: DossierPlacement = { registryId: 'US_IND', ctdModule: 'M3', sectionCode: '3.2.S' };

function doc(overrides: Partial<RegulatedDocumentState> = {}): RegulatedDocumentState {
  return {
    documentId: 'doc-1', title: 'Drug Substance', stage: 'authoring', version: 1, hasContent: true,
    ...overrides,
  };
}

describe('document lifecycle spine', () => {
  describe('fail-closed gates', () => {
    it('authoring → in_review requires content', () => {
      expect(canAdvanceDocument(doc({ stage: 'authoring', hasContent: false }), 'in_review').allowed).toBe(false);
      expect(canAdvanceDocument(doc({ stage: 'authoring', hasContent: true }), 'in_review').allowed).toBe(true);
    });

    it('in_review → approved requires a review sign-off', () => {
      const r = canAdvanceDocument(doc({ stage: 'in_review' }), 'approved');
      expect(r.allowed).toBe(false);
      expect(r.blockedBy).toContain('REVIEW_SIGNOFF_REQUIRED');
      const ok = canAdvanceDocument(
        doc({ stage: 'in_review', reviewSignature: { actor: 'a', role: 'qa', signatureRef: 's', signedAt: 't', meaning: 'reviewed' } }),
        'approved',
      );
      expect(ok.allowed).toBe(true);
    });

    it('approved → placed requires an approval signature AND a complete placement', () => {
      const noSig = canAdvanceDocument(doc({ stage: 'approved', placement }), 'placed');
      expect(noSig.blockedBy).toContain('APPROVAL_SIGNOFF_REQUIRED');

      const sig = { actor: 'a', role: 'ra', signatureRef: 's', signedAt: 't', meaning: 'approved' as const };
      const noPlacement = canAdvanceDocument(doc({ stage: 'approved', approvalSignature: sig }), 'placed');
      expect(noPlacement.blockedBy).toContain('PLACEMENT_REQUIRED');

      const ok = canAdvanceDocument(doc({ stage: 'approved', approvalSignature: sig, placement }), 'placed');
      expect(ok.allowed).toBe(true);
    });

    it('packaged → submitted requires packaging validation', () => {
      expect(canAdvanceDocument(doc({ stage: 'packaged', placement }), 'submitted').blockedBy).toContain('PACKAGING_VALIDATION_REQUIRED');
      expect(canAdvanceDocument(doc({ stage: 'packaged', placement, packagingValidated: true }), 'submitted').allowed).toBe(true);
    });
  });

  describe('immutability of approved content', () => {
    it('approved cannot transition back to authoring (must supersede)', () => {
      const r = canAdvanceDocument(doc({ stage: 'approved' }), 'authoring');
      expect(r.allowed).toBe(false);
      expect(r.blockedBy).toContain('ILLEGAL_TRANSITION');
    });

    it('approved can be superseded', () => {
      expect(canAdvanceDocument(doc({ stage: 'approved' }), 'superseded').allowed).toBe(true);
    });

    it('submitted cannot go back to packaged (terminal-forward)', () => {
      expect(canAdvanceDocument(doc({ stage: 'submitted' }), 'packaged').allowed).toBe(false);
    });
  });

  describe('legal back-transitions', () => {
    it('in_review can request revision back to authoring', () => {
      expect(canAdvanceDocument(doc({ stage: 'in_review' }), 'authoring').allowed).toBe(true);
    });
  });

  describe('placement completeness', () => {
    it('requires registryId, module, and section', () => {
      expect(isCompletePlacement(undefined)).toBe(false);
      expect(isCompletePlacement({ registryId: 'US_IND', ctdModule: 'M3', sectionCode: '' })).toBe(false);
      expect(isCompletePlacement(placement)).toBe(true);
    });
  });

  describe('audit event', () => {
    it('captures from/to, actor, version, and placement for a transition', () => {
      const state = doc({ stage: 'approved', version: 2, placement });
      const ev = buildAuditEvent(state, 'placed', { actor: 'jchen', at: '2026-07-30T00:00:00Z', reason: 'place in M3', signatureRef: 'sig-1' });
      expect(ev).toMatchObject({ documentId: 'doc-1', version: 2, from: 'approved', to: 'placed', actor: 'jchen', placement });
    });
  });

  describe('progress + wiring', () => {
    it('progress increases monotonically across the forward spine', () => {
      const values = FORWARD_STAGE_ORDER.map(stageProgress);
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
      expect(stageProgress('submitted')).toBe(1);
      expect(stageProgress('withdrawn')).toBe(0);
    });

    it('every stage has a subsystem binding (no orphaned stage)', () => {
      for (const s of DOCUMENT_STAGES) expect(STAGE_SUBSYSTEM[s]).toBeTruthy();
    });
  });
});
