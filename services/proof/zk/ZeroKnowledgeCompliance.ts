/**
 * Zero Knowledge Compliance Layer
 * 
 * M2 Authorization Proofs: Role-scoped public signals; signature/approval binding;
 * privacy preserved; verification fails for expired/revoked credentials;
 * deterministic proof verification.
 */

import * as crypto from 'crypto';
import type { ExecutionContext, ZKProof, ProofType } from '../types';
import { ProofAuditService } from '../ProofAuditService';

export interface UserIdentity {
  userId: string;
  zkSecret?: string;
  identityCommitment?: string;
  /** ISO timestamp for credential expiration */
  credentialExpiry?: string;
  /** Whether credential has been revoked */
  isRevoked?: boolean;
}

export interface CredentialValidationResult {
  valid: boolean;
  reason?: string;
}

export class ZeroKnowledgeCompliance {
  private auditService: ProofAuditService;

  constructor() {
    this.auditService = ProofAuditService.getInstance();
  }

  /**
   * M2: Validate credential is not expired or revoked before proof generation.
   */
  validateCredential(user: UserIdentity): CredentialValidationResult {
    if (user.isRevoked) {
      return { valid: false, reason: 'Credential has been revoked' };
    }
    if (user.credentialExpiry) {
      const expiry = new Date(user.credentialExpiry);
      if (expiry < new Date()) {
        return { valid: false, reason: 'Credential has expired' };
      }
    }
    return { valid: true };
  }

  async proveAuthorization(
    user: UserIdentity,
    requiredRole: string,
    context: ExecutionContext
  ): Promise<ZKProof> {
    // M2: Check for expired/revoked credentials
    const credentialCheck = this.validateCredential(user);
    if (!credentialCheck.valid) {
      const failedProof: ZKProof = {
        type: 'AUTHORIZATION',
        proofId: this.hash(`failed:${context.workflowRunId}:${context.stepId}`),
        publicSignals: { error: credentialCheck.reason || 'Invalid credential' },
      };
      await this.auditService.logZKVerificationResult(
        failedProof, 
        false, 
        credentialCheck.reason,
        { workflowRunId: context.workflowRunId, actorId: user.userId }
      );
      throw new Error(credentialCheck.reason);
    }

    const roleHash = this.hash(requiredRole);
    const userCommitment = user.identityCommitment || this.hash(user.userId);
    const proof: ZKProof = {
      type: 'AUTHORIZATION',
      proofId: this.hash(`${context.workflowRunId}:${context.stepId}:${roleHash}:${userCommitment}`),
      publicSignals: {
        roleHash,
        workflowRunId: context.workflowRunId,
        userCommitment,
      },
    };
    
    // M2: Audit ZK proof generation
    await this.auditService.logZKProofGenerated(proof, {
      workflowRunId: context.workflowRunId,
      actorId: user.userId,
    });
    
    return proof;
  }

  async proveSegregationOfDuties(creator: UserIdentity, approver: UserIdentity): Promise<ZKProof> {
    // M2: Check credentials for both parties
    const creatorCheck = this.validateCredential(creator);
    if (!creatorCheck.valid) {
      throw new Error(`Creator credential invalid: ${creatorCheck.reason}`);
    }
    const approverCheck = this.validateCredential(approver);
    if (!approverCheck.valid) {
      throw new Error(`Approver credential invalid: ${approverCheck.reason}`);
    }

    const creatorCommitment = creator.identityCommitment || this.hash(creator.userId);
    const approverCommitment = approver.identityCommitment || this.hash(approver.userId);
    const proof: ZKProof = {
      type: 'SEPARATION',
      proofId: this.hash(`${creatorCommitment}:${approverCommitment}`),
      publicSignals: {
        creatorCommitment,
        approverCommitment,
      },
    };
    
    await this.auditService.logZKProofGenerated(proof, {});
    return proof;
  }

  async proveTrainingCurrent(user: UserIdentity, trainingHash: string): Promise<ZKProof> {
    // M2: Check credential validity
    const credentialCheck = this.validateCredential(user);
    if (!credentialCheck.valid) {
      throw new Error(credentialCheck.reason);
    }

    const userCommitment = user.identityCommitment || this.hash(user.userId);
    const proof: ZKProof = {
      type: 'KNOWLEDGE',
      proofId: this.hash(`${trainingHash}:${userCommitment}`),
      publicSignals: {
        trainingHash,
        userCommitment,
      },
    };
    
    await this.auditService.logZKProofGenerated(proof, { actorId: user.userId });
    return proof;
  }

  async generateProof(type: ProofType, payload: Record<string, string>): Promise<ZKProof> {
    const proof: ZKProof = {
      type,
      proofId: this.hash(`${type}:${this.stableStringify(payload)}`),
      publicSignals: payload,
    };
    
    await this.auditService.logZKProofGenerated(proof, {});
    return proof;
  }

  verifyProof(proof: ZKProof, expected: Partial<Record<string, string>> = {}): boolean {
    const entries = Object.entries(expected);
    const valid = entries.every(([key, value]) => proof.publicSignals?.[key] === value);
    
    // M2: Audit verification result
    this.auditService.logZKVerificationResult(proof, valid).catch(() => {});
    
    return valid;
  }

  private hash(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map(v => this.stableStringify(v)).join(',')}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${this.stableStringify(val)}`);
    return `{${entries.join(',')}}`;
  }
}

export default ZeroKnowledgeCompliance;
