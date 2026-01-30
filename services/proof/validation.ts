/**
 * Proof System Validation Schemas
 * 
 * Zod schemas for validating all proof system API inputs.
 * Required for 21 CFR Part 11 § 11.10 compliance.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Base Types
// ─────────────────────────────────────────────────────────────────────────────

export const proofTypeSchema = z.enum([
  'IDENTITY',
  'AUTHORIZATION',
  'INTEGRITY',
  'TEMPORAL',
  'SEPARATION',
  'KNOWLEDGE',
]);

export const submissionTypeSchema = z.enum([
  'IND',
  '510K',
  'NDA',
  'BLA',
  'PMA',
  'MAA',
]);

export const proofEventTypeSchema = z.enum([
  'GRAPH_COMPILE',
  'GRAPH_TRANSITION',
  'GRAPH_INVARIANT_CHECK',
  'ZK_PROOF_GENERATED',
  'ZK_VERIFICATION_SUCCESS',
  'ZK_VERIFICATION_FAILED',
  'DELTA_BASELINE_SET',
  'DELTA_DRIFT_DETECTED',
  'DELTA_TAMPER_DETECTED',
  'CERTIFICATE_GENERATED',
  'CERTIFICATE_VERIFIED',
  'CERTIFICATE_VERIFICATION_FAILED',
  'UI_PROOF_VIEW',
  'UI_VERIFICATION_REQUEST',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Proof Structures
// ─────────────────────────────────────────────────────────────────────────────

export const zkProofSchema = z.object({
  type: proofTypeSchema,
  proofId: z.string().min(1).max(256),
  publicSignals: z.record(z.string(), z.string()),
});

export const snarkProofSchema = z.object({
  proofId: z.string().min(1).max(256),
  publicSignals: z.record(z.string(), z.string()),
  proofData: z.record(z.string(), z.unknown()),
});

export const temporalProofSchema = z.object({
  id: z.string().min(1).max(256),
  valid: z.boolean(),
  window: z.string().min(1),
});

export const documentIntegrityProofSchema = z.object({
  merkleRoot: z.string().min(1).max(256),
  documentHashes: z.array(z.string().max(256)),
});

// ─────────────────────────────────────────────────────────────────────────────
// Certificate Schema (for verification endpoint)
// ─────────────────────────────────────────────────────────────────────────────

export const certificateProofSchema = z.object({
  pathProof: snarkProofSchema.nullable(),
  authorizationProofs: z.array(zkProofSchema),
  documentIntegrityProof: documentIntegrityProofSchema,
  temporalProofs: z.array(temporalProofSchema),
});

export const certificateClaimsSchema = z.object({
  alcoaPlusCompliance: z.boolean(),
  segregationOfDutiesEnforced: z.boolean(),
  electronicSignaturesValid: z.boolean(),
  trainingCurrent: z.boolean(),
  noUnauthorizedModifications: z.boolean(),
});

export const certificateVerificationSchema = z.object({
  algorithm: z.enum(['groth16', 'plonk', 'stark', 'placeholder']),
  verificationKeyUri: z.string().min(1),
  publicInputs: z.record(z.string(), z.string()),
  verificationSteps: z.array(z.string()),
});

export const regulatoryCertificateSchema = z.object({
  certificateId: z.string().min(1).max(256),
  workflowRunId: z.string().min(1).max(256),
  submissionType: submissionTypeSchema,
  generatedAt: z.string().datetime(),
  proof: certificateProofSchema,
  claims: certificateClaimsSchema,
  verification: certificateVerificationSchema,
});

// ─────────────────────────────────────────────────────────────────────────────
// API Request Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const getCertificateParamsSchema = z.object({
  workflowRunId: z.string()
    .min(1, 'workflowRunId is required')
    .max(256, 'workflowRunId too long'),
});

export const verifyCertificateBodySchema = regulatoryCertificateSchema;

export const getAuditQuerySchema = z.object({
  workflowRunId: z.string().max(256).optional(),
  eventType: proofEventTypeSchema.optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

// ─────────────────────────────────────────────────────────────────────────────
// Execution Context (for internal use)
// ─────────────────────────────────────────────────────────────────────────────

export const executionContextSchema = z.object({
  workflowRunId: z.string().min(1),
  stepId: z.string().min(1),
  actor: z.object({
    userId: z.string().min(1),
    role: z.string().optional(),
  }),
  system: z.object({
    timestamp: z.string().datetime(),
  }),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export const evidenceBundleSchema = z.object({
  identityProof: z.string().optional(),
  authorizationProof: z.string().optional(),
  trainingProof: z.string().optional(),
  documentHash: z.string().optional(),
  previousProofHash: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const userIdentitySchema = z.object({
  userId: z.string().min(1),
  zkSecret: z.string().optional(),
  identityCommitment: z.string().optional(),
  credentialExpiry: z.string().datetime().optional(),
  isRevoked: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helper
// ─────────────────────────────────────────────────────────────────────────────

export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Validation failed: ${errors}`);
  }
  return result.data;
}

export function validateOrNull<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}

// Type exports
export type ProofType = z.infer<typeof proofTypeSchema>;
export type SubmissionType = z.infer<typeof submissionTypeSchema>;
export type ProofEventType = z.infer<typeof proofEventTypeSchema>;
export type ZKProof = z.infer<typeof zkProofSchema>;
export type SNARKProof = z.infer<typeof snarkProofSchema>;
export type RegulatoryCertificate = z.infer<typeof regulatoryCertificateSchema>;
export type ExecutionContext = z.infer<typeof executionContextSchema>;
export type EvidenceBundle = z.infer<typeof evidenceBundleSchema>;
export type UserIdentity = z.infer<typeof userIdentitySchema>;
