import { describe, expect, it } from 'vitest';
import FormalComplianceGraph from '../../services/proof/FormalComplianceGraph';
import { ZeroKnowledgeCompliance } from '../../services/proof/zk/ZeroKnowledgeCompliance';
import { DeltaVerificationEngine } from '../../services/proof/DeltaVerificationEngine';
import {
  ComplianceCertificateGenerator,
  computeDeterministicTimestamp,
} from '../../services/proof/ComplianceCertificate';
import { ProofVerificationService } from '../../services/proof/ProofVerificationService';

describe('Proof System (Phase 4.1)', () => {
  it('FormalComplianceGraph produces deterministic genesis hash and validates guards', async () => {
    const nodes = [
      { id: 'step-a', state: 'A' },
      { id: 'step-b', state: 'B' },
    ];
    const edges = [
      {
        from: 'step-a',
        to: 'step-b',
        transition: 'A -> B',
        guardConditions: [{ id: 'guard-role', predicate: 'role:QA' }],
        requiresProof: ['AUTHORIZATION', 'INTEGRITY'],
      },
    ];

    const graph1 = new FormalComplianceGraph(nodes, edges);
    const graph2 = new FormalComplianceGraph(nodes, edges);

    const context = {
      workflowRunId: 'run-1',
      stepId: 'step-a',
      actor: { userId: 'user-1', role: 'QA' },
      system: { timestamp: new Date().toISOString() },
    };

    const proof1 = await graph1.executeTransition('step-a', 'step-b', context, {
      authorizationProof: 'auth',
    });
    const proof2 = await graph2.executeTransition('step-a', 'step-b', context, {
      authorizationProof: 'auth',
    });

    expect(proof1.genesis).toBe(proof2.genesis);
    expect(proof1.guardSatisfaction[0].valid).toBe(true);
  });

  it('FormalComplianceGraph rejects invalid guard conditions and cycles', async () => {
    const nodes = [
      { id: 'step-x', state: 'X' },
      { id: 'step-y', state: 'Y' },
    ];
    const edges = [
      {
        from: 'step-x',
        to: 'step-y',
        transition: 'X -> Y',
        guardConditions: [{ id: 'guard-role', predicate: 'role:QA' }],
        requiresProof: ['AUTHORIZATION'],
      },
      {
        from: 'step-y',
        to: 'step-x',
        transition: 'Y -> X',
        requiresProof: ['AUTHORIZATION'],
      },
    ];

    expect(() => new FormalComplianceGraph(nodes, edges)).toThrow(/cycle/i);

    const acyclicGraph = new FormalComplianceGraph(nodes, [edges[0]]);
    const context = {
      workflowRunId: 'run-2',
      stepId: 'step-x',
      actor: { userId: 'user-1', role: 'WRITER' },
      system: { timestamp: new Date().toISOString() },
    };

    await expect(
      acyclicGraph.executeTransition('step-x', 'step-y', context, { authorizationProof: 'auth' })
    ).rejects.toThrow(/proof invalid/i);
  });

  it('ZeroKnowledgeCompliance generates deterministic proof ids', async () => {
    const zk = new ZeroKnowledgeCompliance();
    const context = {
      workflowRunId: 'run-123',
      stepId: 'step-1',
      actor: { userId: 'user-1', role: 'QA' },
      system: { timestamp: new Date().toISOString() },
    };

    const proofA = await zk.proveAuthorization({ userId: 'user-1' }, 'QA', context);
    const proofB = await zk.proveAuthorization({ userId: 'user-1' }, 'QA', context);

    expect(proofA.proofId).toBe(proofB.proofId);
    expect(proofA.publicSignals.workflowRunId).toBe('run-123');
  });

  it('DeltaVerificationEngine detects drift between snapshots', async () => {
    const engine = new DeltaVerificationEngine();
    const expected = {
      timestamp: Date.now(),
      merkleRoot: 'root-a',
      complianceGraphHash: 'graph-a',
      activeTransitions: ['step-a'],
    };
    const actual = {
      timestamp: Date.now(),
      merkleRoot: 'root-b',
      complianceGraphHash: 'graph-a',
      activeTransitions: ['step-a'],
    };

    engine.setExpectedState(expected);
    const report = await engine.verifySnapshot(actual);

    expect(report.divergence).toBeGreaterThan(0);
    expect(report.violations[0].path).toBe('merkle-root');
  });

  it('ComplianceCertificateGenerator returns deterministic certificate payload', async () => {
    const generator = new ComplianceCertificateGenerator();
    const workflowRunId = 'wf-run-001';

    const cert1 = await generator.generateCertificate(workflowRunId);
    const cert2 = await generator.generateCertificate(workflowRunId);

    expect(cert1.generatedAt).toBe(computeDeterministicTimestamp(workflowRunId));
    expect(cert1.certificateId).toBe(cert2.certificateId);
    expect(cert1.proof.pathProof?.proofId).toBe(cert2.proof.pathProof?.proofId);
  });

  it('ProofVerificationService rejects tampered certificates', async () => {
    const generator = new ComplianceCertificateGenerator();
    const verifier = new ProofVerificationService();
    const cert = await generator.generateCertificate('wf-run-002');

    const tampered = {
      ...cert,
      proof: {
        ...cert.proof,
        documentIntegrityProof: {
          ...cert.proof.documentIntegrityProof,
          merkleRoot: 'tampered',
        },
      },
    };

    const result = verifier.verifyCertificate(tampered);
    expect(result.valid).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it('ProofVerificationService validates temporal proofs', async () => {
    const generator = new ComplianceCertificateGenerator();
    const verifier = new ProofVerificationService();
    const cert = await generator.generateCertificate('wf-run-003');

    const result = verifier.verifyCertificate(cert);
    expect(result.valid).toBe(true);

    const tampered = {
      ...cert,
      proof: {
        ...cert.proof,
        temporalProofs: [],
      },
    };
    const invalidResult = verifier.verifyCertificate(tampered);
    expect(invalidResult.valid).toBe(false);
  });
});
