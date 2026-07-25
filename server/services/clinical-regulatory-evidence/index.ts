/**
 * Clinical Regulatory Evidence — shared domain barrel.
 *
 * The source-agnostic evidence spine (§3): typed contracts + the org-scoped
 * persistence/query service over the cre_* tables. Consumers (CSR adapter,
 * studyDesignEvidenceService, CRL ingestion, AnA tools) import from here.
 *
 * @module server/services/clinical-regulatory-evidence
 */

export * from './types';
export * as evidenceSpine from './evidence-spine.service';
export { EvidenceSpineError } from './evidence-spine.service';
export * as csrAdapter from './csr-adapter.service';
export * as studyDesignEvidence from './study-design-evidence.service';
