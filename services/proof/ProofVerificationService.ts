/**
 * Proof Verification Service
 */

import crypto from 'crypto';
import type { RegulatorySubmissionCertificate } from './types';
import {
  computeCertificateId,
  computeDeterministicTimestamp,
  computeProofId,
} from './ComplianceCertificate';

export interface ProofVerificationResult {
  valid: boolean;
  verificationTimeMs: number;
  checkedProofs: Array<{ type: string; valid: boolean; anonymous?: boolean }>;
  failures: Array<{ type: string; reason: string }>;
}

export class ProofVerificationService {
  verifyCertificate(certificate: RegulatorySubmissionCertificate): ProofVerificationResult {
    const start = Date.now();
    const failures: ProofVerificationResult['failures'] = [];
    const checkedProofs: ProofVerificationResult['checkedProofs'] = [];

    if (!certificate?.workflowRunId) {
      failures.push({ type: 'METADATA', reason: 'Missing workflowRunId' });
    }

    if (certificate?.verification?.publicInputs?.workflowRunId !== certificate?.workflowRunId) {
      failures.push({ type: 'METADATA', reason: 'Public inputs do not match workflowRunId' });
    }

    if (certificate?.generatedAt) {
      const expectedTimestamp = computeDeterministicTimestamp(certificate.workflowRunId);
      if (certificate.generatedAt !== expectedTimestamp) {
        failures.push({ type: 'METADATA', reason: 'Generated timestamp is not deterministic' });
      }
    }

    if (!certificate?.proof?.documentIntegrityProof?.merkleRoot) {
      failures.push({ type: 'DOCUMENT_INTEGRITY', reason: 'Missing merkleRoot' });
    } else {
      const expectedMerkle = this.hashValue(certificate.workflowRunId);
      if (certificate.proof.documentIntegrityProof.merkleRoot !== expectedMerkle) {
        failures.push({ type: 'DOCUMENT_INTEGRITY', reason: 'Merkle root mismatch' });
      } else {
        checkedProofs.push({ type: 'DOCUMENT_INTEGRITY', valid: true });
      }
    }

    if (certificate?.proof?.pathProof) {
      const expectedProofId = computeProofId(certificate.workflowRunId, 'path-proof');
      if (certificate.proof.pathProof.proofId !== expectedProofId) {
        failures.push({ type: 'EXECUTION_PATH', reason: 'Path proof id mismatch' });
      } else {
        checkedProofs.push({ type: 'EXECUTION_PATH', valid: true });
      }
    } else {
      failures.push({ type: 'EXECUTION_PATH', reason: 'Missing path proof' });
    }

    if (certificate?.proof?.authorizationProofs?.length) {
      const mismatched = certificate.proof.authorizationProofs.find(
        proof => proof.publicSignals?.workflowRunId && proof.publicSignals.workflowRunId !== certificate.workflowRunId
      );
      if (mismatched) {
        failures.push({ type: 'AUTHORIZATION', reason: 'Authorization proof workflowRunId mismatch' });
      } else {
        checkedProofs.push({ type: 'AUTHORIZATION', valid: true, anonymous: true });
      }
    } else {
      failures.push({ type: 'AUTHORIZATION', reason: 'Missing authorization proofs' });
    }

    if (certificate?.proof?.temporalProofs?.length) {
      const expectedTemporalId = computeProofId(certificate.workflowRunId, 'temporal-proof');
      const temporalMatch = certificate.proof.temporalProofs.find(p => p.id === expectedTemporalId && p.valid);
      if (!temporalMatch) {
        failures.push({ type: 'TEMPORAL', reason: 'Temporal proof invalid or missing' });
      } else {
        checkedProofs.push({ type: 'TEMPORAL', valid: true });
      }
    } else {
      failures.push({ type: 'TEMPORAL', reason: 'Missing temporal proofs' });
    }

    if (certificate?.workflowRunId && certificate?.generatedAt) {
      const documentHashes = [...(certificate.proof?.documentIntegrityProof?.documentHashes || [])].sort();
      const proofBundleHash = this.hashValue({
        pathProof: certificate.proof?.pathProof,
        authorizationProofs: certificate.proof?.authorizationProofs || [],
        documentHashes,
      });
      const expectedCertificateId = computeCertificateId(
        certificate.workflowRunId,
        certificate.generatedAt,
        proofBundleHash
      );
      if (certificate.certificateId !== expectedCertificateId) {
        failures.push({ type: 'CERTIFICATE', reason: 'Certificate id mismatch' });
      } else {
        checkedProofs.push({ type: 'CERTIFICATE', valid: true });
      }
    }

    const valid = failures.length === 0;

    return {
      valid,
      verificationTimeMs: Date.now() - start,
      checkedProofs,
      failures,
    };
  }

  private hashValue(value: unknown): string {
    const payload = this.stableStringify(value);
    return crypto.createHash('sha256').update(payload).digest('hex');
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

export default ProofVerificationService;
