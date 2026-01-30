import { describe, expect, it, beforeEach } from 'vitest';
import FormalComplianceGraph from '../../services/proof/FormalComplianceGraph';
import { ZeroKnowledgeCompliance, UserIdentity } from '../../services/proof/zk/ZeroKnowledgeCompliance';
import { DeltaVerificationEngine } from '../../services/proof/DeltaVerificationEngine';
import {
  ComplianceCertificateGenerator,
  computeDeterministicTimestamp,
} from '../../services/proof/ComplianceCertificate';
import { ProofVerificationService } from '../../services/proof/ProofVerificationService';
import { ProofAuditService } from '../../services/proof/ProofAuditService';

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

  // ─────────────────────────────────────────────────────────────────────────────
  // M2: Authorization Proofs - Expired/Revoked Credential Tests
  // ─────────────────────────────────────────────────────────────────────────────

  it('ZeroKnowledgeCompliance rejects expired credentials', async () => {
    const zk = new ZeroKnowledgeCompliance();
    const context = {
      workflowRunId: 'run-expired',
      stepId: 'step-1',
      actor: { userId: 'user-1', role: 'QA' },
      system: { timestamp: new Date().toISOString() },
    };

    const expiredUser: UserIdentity = {
      userId: 'user-1',
      credentialExpiry: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
    };

    await expect(zk.proveAuthorization(expiredUser, 'QA', context)).rejects.toThrow(/expired/i);
  });

  it('ZeroKnowledgeCompliance rejects revoked credentials', async () => {
    const zk = new ZeroKnowledgeCompliance();
    const context = {
      workflowRunId: 'run-revoked',
      stepId: 'step-1',
      actor: { userId: 'user-1', role: 'QA' },
      system: { timestamp: new Date().toISOString() },
    };

    const revokedUser: UserIdentity = {
      userId: 'user-1',
      isRevoked: true,
    };

    await expect(zk.proveAuthorization(revokedUser, 'QA', context)).rejects.toThrow(/revoked/i);
  });

  it('ZeroKnowledgeCompliance accepts valid non-expired credentials', async () => {
    const zk = new ZeroKnowledgeCompliance();
    const context = {
      workflowRunId: 'run-valid',
      stepId: 'step-1',
      actor: { userId: 'user-1', role: 'QA' },
      system: { timestamp: new Date().toISOString() },
    };

    const validUser: UserIdentity = {
      userId: 'user-1',
      credentialExpiry: new Date(Date.now() + 86400000).toISOString(), // expires tomorrow
      isRevoked: false,
    };

    const proof = await zk.proveAuthorization(validUser, 'QA', context);
    expect(proof.proofId).toBeDefined();
    expect(proof.type).toBe('AUTHORIZATION');
  });

  it('ZeroKnowledgeCompliance rejects segregation with revoked approver', async () => {
    const zk = new ZeroKnowledgeCompliance();
    
    const creator: UserIdentity = { userId: 'creator-1' };
    const revokedApprover: UserIdentity = { userId: 'approver-1', isRevoked: true };

    await expect(zk.proveSegregationOfDuties(creator, revokedApprover)).rejects.toThrow(/revoked/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // M3: Delta Verification - Tamper Detection Tests
  // ─────────────────────────────────────────────────────────────────────────────

  it('DeltaVerificationEngine detects critical compliance graph tamper', async () => {
    const engine = new DeltaVerificationEngine();
    const baseline = {
      timestamp: Date.now(),
      merkleRoot: 'root-a',
      complianceGraphHash: 'graph-original',
      activeTransitions: ['step-a'],
    };
    const tampered = {
      timestamp: Date.now(),
      merkleRoot: 'root-a',
      complianceGraphHash: 'graph-tampered', // Critical violation
      activeTransitions: ['step-a'],
    };

    engine.setExpectedState(baseline);
    const report = await engine.verifySnapshot(tampered);

    expect(report.divergence).toBeGreaterThan(0);
    const criticalViolation = report.violations.find(v => v.path === 'compliance-graph-hash');
    expect(criticalViolation).toBeDefined();
    expect(criticalViolation?.severity).toBe('CRITICAL');
  });

  it('DeltaVerificationEngine reports no divergence for identical snapshots', async () => {
    const engine = new DeltaVerificationEngine();
    const snapshot = engine.createSnapshot(['step-a', 'step-b'], 'graph-hash', 'run-1');
    
    engine.setExpectedState(snapshot);
    const report = await engine.verifySnapshot(snapshot);

    expect(report.divergence).toBe(0);
    expect(report.violations).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // M4: Certificate - Export-Safe Serialization Tests
  // ─────────────────────────────────────────────────────────────────────────────

  it('ComplianceCertificateGenerator round-trips through serialization', async () => {
    const generator = new ComplianceCertificateGenerator();
    const verifier = new ProofVerificationService();
    
    const original = await generator.generateCertificate('wf-run-export');
    const serialized = generator.serializeForExport(original);
    const deserialized = generator.deserializeFromExport(serialized);
    
    // Verify structure matches
    expect(deserialized.certificateId).toBe(original.certificateId);
    expect(deserialized.workflowRunId).toBe(original.workflowRunId);
    expect(deserialized.generatedAt).toBe(original.generatedAt);
    
    // Verify deserialized certificate still validates
    const result = verifier.verifyCertificate(deserialized);
    expect(result.valid).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Audit Service Tests
  // ─────────────────────────────────────────────────────────────────────────────

  it('ProofAuditService maintains hash chain integrity', async () => {
    const audit = ProofAuditService.getInstance();
    
    await audit.logEvent('GRAPH_COMPILE', { test: 'hash-chain-1' });
    await audit.logEvent('GRAPH_TRANSITION', { test: 'hash-chain-2' });
    await audit.logEvent('CERTIFICATE_GENERATED', { test: 'hash-chain-3' });
    
    const chainStatus = audit.verifyHashChain();
    expect(chainStatus.valid).toBe(true);
  });

  it('ProofAuditService redacts sensitive data', async () => {
    const audit = ProofAuditService.getInstance();
    
    const entry = await audit.logEvent('ZK_PROOF_GENERATED', {
      password: 'secret123',
      apiKey: 'key-abc',
      publicData: 'visible',
    });
    
    expect(entry.details.password).toBe('[REDACTED]');
    expect(entry.details.apiKey).toBe('[REDACTED]');
    expect(entry.details.publicData).toBe('visible');
  });

  it('ProofAuditService filters entries by workflowRunId', async () => {
    const audit = ProofAuditService.getInstance();
    
    await audit.logEvent('GRAPH_COMPILE', { test: 'filter-1' }, { workflowRunId: 'run-filter-a' });
    await audit.logEvent('GRAPH_COMPILE', { test: 'filter-2' }, { workflowRunId: 'run-filter-b' });
    
    const filtered = audit.getEntries({ workflowRunId: 'run-filter-a' });
    expect(filtered.every(e => e.workflowRunId === 'run-filter-a')).toBe(true);
  });
});