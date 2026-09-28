/**
 * Canonical document lifecycle spine — gate invariants.
 *
 * The spine's value is that every stage transition is fail-closed: approval,
 * placement, packaging, and submission cannot happen without their evidence, and
 * an approved document is immutable (no path back to authoring). These tests hold
 * those invariants so the one canonical spine cannot silently loosen.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  canAdvanceDocument,
  buildAuditEvent,
  buildSignatureEvent,
  canonicalAuditPayload,
  verifyAuditChain,
  type DocumentAuditEvent,
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

describe('the chain verifier recomputes (VR-03)', () => {
  const sha256 = (payload: string) => createHash('sha256').update(payload).digest('hex');
  /** Seal events exactly as canonicalDocumentStore.persistState does. */
  function sealed(events: DocumentAuditEvent[]): DocumentAuditEvent[] {
    const out: DocumentAuditEvent[] = [];
    for (const e of events) {
      const linked = { ...e, prevEventHash: out.length ? out[out.length - 1].eventHash : '' };
      out.push({ ...linked, eventHash: sha256(canonicalAuditPayload(linked)) });
    }
    return out;
  }
  const trail = () =>
    sealed([
      buildAuditEvent(doc(), 'in_review', { actor: '42', at: '2026-09-25T00:00:00Z', contentHash: 'h' }),
      buildAuditEvent(doc({ stage: 'in_review' }), 'approved', { actor: '43', at: '2026-09-25T01:00:00Z', signatureRef: 'csig:1' }),
    ]);

  it('an intact trail verifies, and reports that its hashes were recomputed', () => {
    expect(verifyAuditChain(trail(), sha256)).toEqual({ valid: true, brokenAt: -1, hashesRecomputed: true });
  });

  it('an event whose actor was edited with its hashes left in place is broken, at that event', () => {
    const t = trail();
    t[1] = { ...t[1], actor: '999' };
    // Linkage alone cannot see it: every prevEventHash still matches.
    expect(verifyAuditChain(t).valid).toBe(true);
    expect(verifyAuditChain(t, sha256)).toEqual({ valid: false, brokenAt: 1, hashesRecomputed: true });
  });

  it('an event with no hash at all is broken when hashes are recomputed', () => {
    const t = trail();
    t[0] = { ...t[0], eventHash: undefined };
    expect(verifyAuditChain(t, sha256).valid).toBe(false);
  });

  it('without a hasher it says so: linkage only, never a claim that hashes were checked', () => {
    expect(verifyAuditChain(trail()).hashesRecomputed).toBe(false);
  });
});

describe('a signature is its own trail event', () => {
  it('records the sign-off at the current stage, naming the signer and the signature', () => {
    const ev = buildSignatureEvent(doc({ stage: 'in_review' }), {
      actor: '42', role: 'admin', signatureRef: 'csig:r1', signedAt: '2026-09-25T00:00:00Z', meaning: 'reviewed',
    }, { contentHash: 'h' });
    expect(ev).toMatchObject({
      from: 'in_review', to: 'in_review', actor: '42', signatureRef: 'csig:r1',
      reason: 'signed: reviewed', at: '2026-09-25T00:00:00Z', contentHash: 'h',
    });
  });
});
