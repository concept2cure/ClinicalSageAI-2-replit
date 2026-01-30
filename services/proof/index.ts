/**
 * Proof System - Phase 4.1 Complete
 * 
 * Provable Regulatory Science for Concept2Cure
 * 
 * Components:
 * - FormalComplianceGraph: DAG representation with deterministic hashing
 * - ZeroKnowledgeCompliance: ZK proofs for authorization and segregation
 * - DeltaVerificationEngine: Drift detection and tamper logging
 * - ComplianceCertificateGenerator: Immutable regulatory certificates
 * - ProofVerificationService: Round-trip certificate verification
 * - ProofAuditService: Hash-chained audit logging with DB persistence
 * - Validation: Zod schemas for all API inputs
 */

export { FormalComplianceGraph, type ComplianceNode, type ComplianceEdge } from './FormalComplianceGraph';
export { ZeroKnowledgeCompliance, type UserIdentity, type CredentialValidationResult } from './zk/ZeroKnowledgeCompliance';
export { DeltaVerificationEngine, type SystemStateSnapshot, type DeltaReport, type DeltaViolation } from './DeltaVerificationEngine';
export { ComplianceCertificateGenerator, computeDeterministicTimestamp, computeProofId, computeCertificateId } from './ComplianceCertificate';
export { ProofVerificationService, type ProofVerificationResult } from './ProofVerificationService';
export { ProofAuditService, type ProofEventType, type ProofAuditEntry } from './ProofAuditService';

// Validation schemas
export {
  proofTypeSchema,
  submissionTypeSchema,
  proofEventTypeSchema,
  zkProofSchema,
  snarkProofSchema,
  regulatoryCertificateSchema,
  executionContextSchema,
  evidenceBundleSchema,
  userIdentitySchema,
  getCertificateParamsSchema,
  verifyCertificateBodySchema,
  getAuditQuerySchema,
  validateOrThrow,
  validateOrNull,
} from './validation';

// Database setup
export {
  initializeProofDatabasePersistence,
  initializeTenantProofPersistence,
  retryFailedPersistence,
  verifyDatabaseAuditChain,
} from './database-setup';

export type {
  ProofType,
  LogicalExpression,
  GuardCondition,
  ExecutionContext,
  EvidenceBundle,
  TransitionProof,
  SNARKProof,
  ZKProof,
  RegulatorySubmissionCertificate,
} from './types';
