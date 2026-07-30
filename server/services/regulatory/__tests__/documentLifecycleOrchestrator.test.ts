/**
 * Document lifecycle orchestrator — one governed pipeline.
 *
 * Proves the coordination contract without a database: (1) the three identity
 * systems project to ONE canonical UUID document; (2) transitions are fail-closed
 * against the canonical gate; (3) each permitted transition invokes the correct
 * blessed service and appends EXACTLY ONE audit event.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  projectCanonicalDocument,
  advanceDocument,
  assertCanonicalIdentity,
  type LifecycleBindings,
  type ProjectionInput,
} from '../documentLifecycleOrchestrator';
import type { RegulatedDocumentState, DossierPlacement } from '../../../../shared/regulatory/document-lifecycle';
import type { CanonicalDocument, CanonicalDocumentId } from '../../../../shared/regulatory/canonical-document';

const UUID = '33333333-3333-4333-8333-333333333333';
const placement: DossierPlacement = { registryId: 'US_IND', ctdModule: 'M3', sectionCode: '3.2.S' };

function baseProjection(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    canonicalId: UUID, title: 'Drug Substance', documentType: 'ICH_M3_DS', organizationId: 1,
    version: 1, stage: 'authoring', createdAt: 't', updatedAt: 't',
    sources: {
      coauthor_documents: { nativeId: 42, role: 'authoring' },       // integer writer
      concept2cure_artifacts: { nativeId: 'art-uuid', role: 'artifact' }, // UUID writer
    },
    hasContent: true, contentHash: 'h', audit: [], ...overrides,
  };
}

function mockBindings(): LifecycleBindings & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    registerGovernedDocument: vi.fn(async () => { calls.push('register'); }),
    applySignature: vi.fn(async (_d, meaning) => { calls.push('sign'); return { actor: 'ra', role: 'ra', signatureRef: 'sig-1', signedAt: 't', meaning }; }),
    upsertLeaf: vi.fn(async () => { calls.push('leaf'); return { leafId: 'leaf-1' }; }),
    assemble: vi.fn(async () => { calls.push('assemble'); return { packageSha256: 'abc' }; }),
    audit: vi.fn(async () => { calls.push('audit'); }),
  };
}

function state(overrides: Partial<RegulatedDocumentState> = {}): RegulatedDocumentState {
  return { documentId: UUID, title: 'Drug Substance', stage: 'authoring', version: 1, hasContent: true, ...overrides };
}
function doc(): CanonicalDocument {
  return projectCanonicalDocument(baseProjection()).document;
}

describe('document lifecycle orchestrator', () => {
  describe('identity convergence (projection)', () => {
    it('collapses an integer writer and a UUID writer into one canonical UUID document', () => {
      const { document, violations } = projectCanonicalDocument(baseProjection());
      expect(document.id).toBe(UUID);
      expect(violations).toEqual([]);
      const systems = document.sourceRefs.map((r) => r.system).sort();
      expect(systems).toEqual(['coauthor_documents', 'concept2cure_artifacts']);
      // The UUID writer keeps its uuid kind; the integer writer is bridged as a string.
      const artifact = document.sourceRefs.find((r) => r.system === 'concept2cure_artifacts')!;
      const authoring = document.sourceRefs.find((r) => r.system === 'coauthor_documents')!;
      expect(artifact.idKind).toBe('uuid');
      expect(authoring.idKind).toBe('integer');
      expect(authoring.nativeId).toBe('42');
    });

    it('assertCanonicalIdentity rejects a non-UUID document', () => {
      const bad = { ...doc(), id: '42' as CanonicalDocumentId };
      expect(() => assertCanonicalIdentity(bad)).toThrow(/canonical UUID/);
      expect(() => assertCanonicalIdentity(doc())).not.toThrow();
    });
  });

  describe('fail-closed transitions', () => {
    it('blocks approval without a review signature and calls NO binding', async () => {
      const b = mockBindings();
      const r = await advanceDocument(state({ stage: 'in_review' }), 'approved', { actor: 'a', at: 't' }, b, doc());
      expect(r.ok).toBe(false);
      expect(r.blockedBy).toContain('REVIEW_SIGNOFF_REQUIRED');
      expect(b.calls).toEqual([]); // no service touched, no audit written
    });

    it('blocks placement without a placement coordinate', async () => {
      const b = mockBindings();
      const s = state({ stage: 'approved', approvalSignature: { actor: 'a', role: 'ra', signatureRef: 's', signedAt: 't', meaning: 'approved' } });
      const r = await advanceDocument(s, 'placed', { actor: 'a', at: 't' }, b, doc());
      expect(r.ok).toBe(false);
      expect(r.blockedBy).toContain('PLACEMENT_REQUIRED');
      expect(b.calls).toEqual([]);
    });
  });

  describe('routes each transition to the right blessed service + one audit', () => {
    it('approval → signs (Part 11) + registers governed doc + one audit', async () => {
      const b = mockBindings();
      const s = state({ stage: 'in_review', reviewSignature: { actor: 'qa', role: 'qa', signatureRef: 's', signedAt: 't', meaning: 'reviewed' } });
      const r = await advanceDocument(s, 'approved', { actor: 'ra', at: 't' }, b, doc());
      expect(r.ok).toBe(true);
      expect(b.calls).toEqual(['sign', 'register', 'audit']);
      expect(r.state.approvalSignature?.signatureRef).toBe('sig-1');
      expect(r.state.stage).toBe('approved');
    });

    it('placement → upserts a submission_leaf + one audit', async () => {
      const b = mockBindings();
      const s = state({ stage: 'approved', approvalSignature: { actor: 'a', role: 'ra', signatureRef: 's', signedAt: 't', meaning: 'approved' } });
      const r = await advanceDocument(s, 'placed', { actor: 'ra', at: 't', placement }, b, doc());
      expect(r.ok).toBe(true);
      expect(b.calls).toEqual(['leaf', 'audit']);
      expect(r.state.placement?.leafId).toBe('leaf-1');
    });

    it('packaging → assembles the eCTD package + one audit', async () => {
      const b = mockBindings();
      const s = state({ stage: 'placed', placement });
      const r = await advanceDocument(s, 'packaged', { actor: 'pub', at: 't' }, b, doc());
      expect(r.ok).toBe(true);
      expect(b.calls).toEqual(['assemble', 'audit']);
      expect(r.state.packagingValidated).toBe(true);
    });

    it('every successful transition appends exactly one audit event', async () => {
      const b = mockBindings();
      const s = state({ stage: 'authoring', hasContent: true });
      const r = await advanceDocument(s, 'in_review', { actor: 'a', at: 't' }, b, doc());
      expect(r.ok).toBe(true);
      expect(b.calls.filter((c) => c === 'audit')).toHaveLength(1);
      expect(r.auditEvent).toMatchObject({ from: 'authoring', to: 'in_review' });
    });
  });
});
