/** Existing description operation transport; source preview is a separate
 * read-only operation. These types supply no authorization or persistence. */
import type { CatalogStatus, SpanCoverageReport, UnverifiedKeyDataLeaf } from './document-catalog-core.js';
import type { CatalogProposer } from './document-catalog-governance.service.js';
import type { LegacyCatalogVerificationScope } from '../../../shared/ana/catalog-facts.js';

export interface CompleteCatalogArgs {
  documentId: string;
  organizationId: number;
  /** Server-loaded target program from serving-context preflight, never body scope. */
  expectedProgramId?: string;
  documentKind: string;
  purpose: string;
  summary: string;
  keyData?: Record<string, unknown> | null;
  userId?: number | null;
  /** Server-derived agent, model and turn that wrote the suggestion. */
  proposer?: CatalogProposer | null;
}

export interface CompleteCatalogResult {
  ok: boolean;
  refusal?: string;
  code?: string;
  coverage?: SpanCoverageReport;
  /** Exact leaves refused by the legacy current-text value checker. */
  unverifiedKeyData?: UnverifiedKeyDataLeaf[];
  embeddingStatus?: 'embedded' | 'failed';
  /** Scope descriptor, not a historical or scientific qualification result. */
  checkScope?: LegacyCatalogVerificationScope;
}

/** Existing session recall file envelope. */
export interface VaultDocDigest {
  fileName: string;
  documentTitle: string;
  programName: string | null;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string;
  catalogStatus: CatalogStatus | 'uncataloged';
  documentKind: string | null;
  purpose: string | null;
  catalogState: string | null;
  checkScope?: LegacyCatalogVerificationScope;
}
