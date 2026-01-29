/**
 * Proof System Types
 */

export type ProofType =
  | 'IDENTITY'
  | 'AUTHORIZATION'
  | 'INTEGRITY'
  | 'TEMPORAL'
  | 'SEPARATION'
  | 'KNOWLEDGE';

export interface LogicalExpression {
  id: string;
  expression: string;
}

export interface GuardCondition {
  id: string;
  predicate: string;
}

export interface ExecutionContext {
  workflowRunId: string;
  stepId: string;
  actor: {
    userId: string;
    role?: string;
  };
  system: {
    timestamp: string;
  };
  variables?: Record<string, unknown>;
}

export interface EvidenceBundle {
  identityProof?: string;
  authorizationProof?: string;
  trainingProof?: string;
  documentHash?: string;
  previousProofHash?: string;
  metadata?: Record<string, unknown>;
}

export interface TransitionProof {
  genesis: string;
  fromState: string;
  toState: string;
  timestamp: string;
  actor: {
    userId: string;
    role?: string;
  };
  guardSatisfaction: Array<{ id: string; valid: boolean; reason?: string }>;
  invariantHolding: { valid: boolean; reason?: string };
  zeroKnowledge: ZKProof[];
  previousProofHash?: string;
  circuitSatisfaction?: SNARKProof | null;
}

export interface SNARKProof {
  proofId: string;
  publicSignals: Record<string, string>;
  proofData: Record<string, unknown>;
}

export interface ZKProof {
  type: ProofType;
  proofId: string;
  publicSignals: Record<string, string>;
}

export interface RegulatorySubmissionCertificate {
  certificateId: string;
  workflowRunId: string;
  submissionType: 'IND' | '510K' | 'NDA' | 'BLA' | 'PMA' | 'MAA';
  generatedAt: string;
  proof: {
    pathProof: SNARKProof | null;
    authorizationProofs: ZKProof[];
    documentIntegrityProof: { merkleRoot: string; documentHashes: string[] };
    temporalProofs: Array<{ id: string; valid: boolean; window: string }>;
  };
  claims: {
    alcoaPlusCompliance: boolean;
    segregationOfDutiesEnforced: boolean;
    electronicSignaturesValid: boolean;
    trainingCurrent: boolean;
    noUnauthorizedModifications: boolean;
  };
  verification: {
    algorithm: 'groth16' | 'plonk' | 'stark' | 'placeholder';
    verificationKeyUri: string;
    publicInputs: Record<string, string>;
    verificationSteps: string[];
  };
}
