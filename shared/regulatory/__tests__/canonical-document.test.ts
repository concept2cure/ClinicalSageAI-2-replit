/**
 * Canonical document model — identity + convergence invariants.
 *
 * These tests hold the decisions that end the duplicated-document problem: the
 * canonical id is a UUID that bridges integer and UUID source systems; an
 * approved version is immutable and signed; a packaged version carries both an
 * MD5 (eCTD) and a SHA-256 (governance); and no two source rows claim the same
 * facet for one document.
 */

import { describe, it, expect } from 'vitest';
import {
  makeSourceRef,
  isCanonicalId,
  validateCanonicalVersion,
  SOURCE_ID_KIND,
  FACET_SOURCE,
  type CanonicalDocument,
  type CanonicalVersion,
  type CanonicalDocumentId,
  type CanonicalVersionId,
} from '../canonical-document';
import { verifyAuditChain, type DocumentAuditEvent } from '../document-lifecycle';

const DOC_ID = '11111111-1111-4111-8111-111111111111' as CanonicalDocumentId;
const VER_ID = '22222222-2222-4222-8222-222222222222' as CanonicalVersionId;

function baseDoc(overrides: Partial<CanonicalDocument> = {}): CanonicalDocument {
  return {
    id: DOC_ID, title: 'Drug Substance 3.2.S', documentType: 'ICH_M3_DS', organizationId: 1,
    currentVersionId: VER_ID, sourceRefs: [], createdAt: 't', updatedAt: 't', ...overrides,
  };
}
function baseVer(overrides: Partial<CanonicalVersion> = {}): CanonicalVersion {
  return { id: VER_ID, documentId: DOC_ID, version: 1, stage: 'authoring', contentHash: 'h', immutable: false, createdAt: 't', audit: [], ...overrides };
}

describe('canonical document model', () => {
  describe('identity bridges integer and UUID writers', () => {
    it('canonical id must be a UUID', () => {
      expect(isCanonicalId(DOC_ID)).toBe(true);
      expect(isCanonicalId('123')).toBe(false);
    });

    it('normalises an integer native id (unified_documents) to a string ref', () => {
      const ref = makeSourceRef('unified_documents', 42, 'approval');
      expect(ref).toEqual({ system: 'unified_documents', nativeId: '42', idKind: 'integer', role: 'approval' });
    });

    it('normalises a UUID native id (concept2cure_artifacts) to a string ref', () => {
      const ref = makeSourceRef('concept2cure_artifacts', 'abc-uuid', 'artifact');
      expect(ref.idKind).toBe('uuid');
      expect(ref.nativeId).toBe('abc-uuid');
    });

    it('records the id-kind of every known source system', () => {
      expect(SOURCE_ID_KIND.unified_documents).toBe('integer');
      expect(SOURCE_ID_KIND.coauthor_documents).toBe('integer');
      expect(SOURCE_ID_KIND.concept2cure_artifacts).toBe('uuid');
    });
  });

  describe('fail-closed invariants', () => {
    it('a valid authoring version has no violations', () => {
      expect(validateCanonicalVersion(baseDoc(), baseVer())).toEqual([]);
    });

    it('rejects a non-UUID canonical id', () => {
      const doc = baseDoc({ id: '7' as CanonicalDocumentId });
      const ver = baseVer({ documentId: '7' as CanonicalDocumentId });
      expect(validateCanonicalVersion(doc, ver)).toContain('NON_UUID_CANONICAL_ID');
    });

    it('an approved version must be immutable and signed', () => {
      const v = validateCanonicalVersion(baseDoc(), baseVer({ stage: 'approved', immutable: false }));
      expect(v).toContain('APPROVED_NOT_IMMUTABLE');
      expect(v).toContain('APPROVED_WITHOUT_SIGNATURE');
    });

    it('a placed version must carry a placement', () => {
      const v = validateCanonicalVersion(baseDoc(), baseVer({ stage: 'placed', immutable: true, approval: { actor: 'a', role: 'ra', signatureRef: 's', signedAt: 't', meaning: 'approved' } }));
      expect(v).toContain('PLACED_WITHOUT_PLACEMENT');
    });

    it('a packaged version must carry BOTH md5 and sha256', () => {
      const ver = baseVer({
        stage: 'packaged', immutable: true,
        approval: { actor: 'a', role: 'ra', signatureRef: 's', signedAt: 't', meaning: 'approved' },
        placement: { registryId: 'US_IND', ctdModule: 'M3', sectionCode: '3.2.S' },
        export: { format: 'pdf', md5: 'm' }, // sha256 missing
      });
      expect(validateCanonicalVersion(baseDoc(), ver)).toContain('EXPORTED_WITHOUT_HASHES');
    });

    it('flags two source rows claiming the same facet (the duplication guard)', () => {
      const doc = baseDoc({ sourceRefs: [
        makeSourceRef('concept2cure_artifacts', 'a', 'artifact'),
        makeSourceRef('unified_documents', 1, 'artifact'),
      ] });
      expect(validateCanonicalVersion(doc, baseVer())).toContain('DUPLICATE_SOURCE_ROLE');
    });
  });

  describe('convergence map', () => {
    it('binds every facet to a single blessed subsystem', () => {
      for (const facet of ['authoring', 'artifact', 'placement', 'review', 'approval', 'export', 'audit'] as const) {
        expect(FACET_SOURCE[facet]).toBeTruthy();
      }
      expect(FACET_SOURCE.audit).toMatch(/audit_logs/);
      expect(FACET_SOURCE.placement).toMatch(/submission_leaves/);
    });
  });

  describe('append-only audit chain', () => {
    it('accepts a correctly linked chain and rejects a broken link', () => {
      const chain: DocumentAuditEvent[] = [
        { documentId: DOC_ID, version: 1, from: 'authoring', to: 'in_review', actor: 'a', at: 't1', prevEventHash: '', eventHash: 'h1' },
        { documentId: DOC_ID, version: 1, from: 'in_review', to: 'approved', actor: 'b', at: 't2', prevEventHash: 'h1', eventHash: 'h2' },
      ];
      expect(verifyAuditChain(chain).valid).toBe(true);
      chain[1].prevEventHash = 'tampered';
      expect(verifyAuditChain(chain)).toEqual({ valid: false, brokenAt: 1 });
    });
  });
});
