/**
 * Formal Compliance Graph
 * 
 * DAG representation of workflow states and transitions with formal checks.
 */

import crypto from 'crypto';
import type {
  ExecutionContext,
  EvidenceBundle,
  TransitionProof,
  GuardCondition,
  LogicalExpression,
  ProofType,
  ZKProof,
  SNARKProof,
} from './types';
import type { WorkflowDefinition, WorkflowStepDefinition } from '../../database/schema/workflow-definitions';

export interface ComplianceNode {
  id: string;
  state: string;
  invariant?: (context: ExecutionContext) => boolean;
  preconditions?: LogicalExpression[];
  postconditions?: LogicalExpression[];
  stateCommitment?: string;
}

export interface ComplianceEdge {
  from: string;
  to: string;
  transition: string;
  guardConditions?: GuardCondition[];
  requiresProof?: ProofType[];
}

export class FormalComplianceGraph {
  private nodes = new Map<string, ComplianceNode>();
  private edges = new Map<string, ComplianceEdge>();
  private genesisHash: string;
  private lastProofHash: string | undefined;

  constructor(nodes: ComplianceNode[], edges: ComplianceEdge[]) {
    nodes.forEach(node => {
      if (!node.id) {
        throw new Error('Compliance node missing id');
      }
      this.nodes.set(node.id, {
        ...node,
        stateCommitment: node.stateCommitment || this.hashValue(node.state),
      });
    });
    edges.forEach(edge => {
      if (!edge.from || !edge.to) {
        throw new Error('Compliance edge missing endpoints');
      }
      this.edges.set(this.edgeKey(edge.from, edge.to), edge);
    });
    this.assertAcyclic();
    this.assertNodeCoverage();
    this.genesisHash = this.computeGenesisCommitment();
  }

  static fromWorkflowDefinition(
    _definition: WorkflowDefinition,
    steps: WorkflowStepDefinition[]
  ): FormalComplianceGraph {
    const ordered = [...steps].sort((a, b) => a.order - b.order);
    const nodes: ComplianceNode[] = ordered.map(step => ({
      id: step.id,
      state: step.name,
      preconditions: step.preconditions?.map(p => ({
        id: p.id,
        expression: `${p.type}:${p.target}`,
      })),
      postconditions: step.effects?.map(e => ({
        id: e.id,
        expression: `${e.type}:${e.target}`,
      })),
    }));

    const edges: ComplianceEdge[] = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      edges.push({
        from: ordered[i].id,
        to: ordered[i + 1].id,
        transition: `${ordered[i].name} -> ${ordered[i + 1].name}`,
        guardConditions: (ordered[i + 1].preconditions || []).map(p => ({
          id: p.id,
          predicate: `${p.type}:${p.target}`,
        })),
        requiresProof: ['IDENTITY', 'AUTHORIZATION', 'INTEGRITY'],
      });
    }

    const terminalId = 'workflow_complete';
    nodes.push({ id: terminalId, state: 'COMPLETED' });
    if (ordered.length > 0) {
      edges.push({
        from: ordered[ordered.length - 1].id,
        to: terminalId,
        transition: `${ordered[ordered.length - 1].name} -> COMPLETE`,
        requiresProof: ['INTEGRITY', 'TEMPORAL'],
      });
    }

    return new FormalComplianceGraph(nodes, edges);
  }

  private edgeKey(from: string, to: string) {
    return `${from}::${to}`;
  }

  private computeGenesisCommitment(): string {
    const payload = {
      nodes: Array.from(this.nodes.values())
        .map(n => ({ id: n.id, commitment: n.stateCommitment }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      edges: Array.from(this.edges.values())
        .map(e => ({ from: e.from, to: e.to, transition: e.transition }))
        .sort((a, b) => `${a.from}->${a.to}`.localeCompare(`${b.from}->${b.to}`)),
    };
    return this.hashValue(payload);
  }

  async executeTransition(
    fromNodeId: string,
    toNodeId: string,
    context: ExecutionContext,
    evidence: EvidenceBundle
  ): Promise<TransitionProof> {
    const edge = this.edges.get(this.edgeKey(fromNodeId, toNodeId));
    const targetNode = this.nodes.get(toNodeId);

    if (!edge || !targetNode) {
      throw new Error('Invalid transition path');
    }

    const guardProofs = (edge.guardConditions || []).map(condition => {
      const { valid, reason } = this.evaluateGuard(condition, context, evidence);
      return { id: condition.id, valid, reason };
    });

    const invariantHolding = targetNode.invariant
      ? this.evaluateInvariant(targetNode, context)
      : { valid: true };

    const zkProofs = await this.generateZKProofs(edge.requiresProof || [], evidence, context);

    const proof: TransitionProof = {
      genesis: this.genesisHash,
      fromState: fromNodeId,
      toState: toNodeId,
      timestamp: context.system.timestamp,
      actor: context.actor,
      guardSatisfaction: guardProofs,
      invariantHolding,
      zeroKnowledge: zkProofs,
      previousProofHash: this.lastProofHash,
      circuitSatisfaction: await this.generateCircuitProof(edge, context),
    };

    if (!this.verifyProof(proof)) {
      throw new Error('Transition proof invalid');
    }

    this.lastProofHash = this.hashProof(proof);
    return proof;
  }

  private async generateZKProofs(
    requiresProof: ProofType[],
    evidence: EvidenceBundle,
    context: ExecutionContext
  ): Promise<ZKProof[]> {
    return requiresProof.map(type => {
      const evidenceHash = this.hashValue(evidence || {});
      return {
        type,
        proofId: this.hashValue({ type, evidenceHash, workflowRunId: context.workflowRunId }),
        publicSignals: {
          evidenceHash,
        },
      };
    });
  }

  private async generateCircuitProof(_edge: ComplianceEdge, context: ExecutionContext): Promise<SNARKProof | null> {
    return {
      proofId: this.hashValue({ workflowRunId: context.workflowRunId, stepId: context.stepId }),
      publicSignals: {
        workflowRunId: context.workflowRunId,
        stepId: context.stepId,
      },
      proofData: {
        placeholder: true,
      },
    };
  }

  private verifyProof(proof: TransitionProof): boolean {
    return proof.invariantHolding.valid && proof.guardSatisfaction.every(g => g.valid);
  }

  private hashProof(proof: TransitionProof): string {
    return this.hashValue(proof);
  }

  private hashValue(value: string | Record<string, unknown>): string {
    const payload = typeof value === 'string' ? value : this.stableStringify(value);
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

  private assertAcyclic(): void {
    const adjacency = new Map<string, string[]>();
    Array.from(this.edges.values()).forEach(edge => {
      const neighbors = adjacency.get(edge.from) || [];
      neighbors.push(edge.to);
      adjacency.set(edge.from, neighbors);
    });

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const dfs = (nodeId: string) => {
      if (visiting.has(nodeId)) {
        throw new Error(`Compliance graph cycle detected at ${nodeId}`);
      }
      if (visited.has(nodeId)) return;
      visiting.add(nodeId);
      const outgoing = adjacency.get(nodeId) || [];
      outgoing.forEach(nextId => dfs(nextId));
      visiting.delete(nodeId);
      visited.add(nodeId);
    };

    Array.from(this.nodes.keys()).forEach(dfs);
  }

  private assertNodeCoverage(): void {
    const nodeIds = new Set(this.nodes.keys());
    Array.from(this.edges.values()).forEach(edge => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
        throw new Error(`Edge references unknown node: ${edge.from} -> ${edge.to}`);
      }
    });
  }

  private evaluateInvariant(node: ComplianceNode, context: ExecutionContext): { valid: boolean; reason?: string } {
    try {
      const valid = node.invariant?.(context) ?? true;
      return valid ? { valid: true } : { valid: false, reason: 'Invariant failed' };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Invariant error' };
    }
  }

  private evaluateGuard(
    condition: GuardCondition,
    context: ExecutionContext,
    evidence: EvidenceBundle
  ): { valid: boolean; reason?: string } {
    const predicate = condition.predicate || '';
    if (predicate.startsWith('role:')) {
      const requiredRole = predicate.replace('role:', '');
      const valid = context.actor.role === requiredRole;
      return valid ? { valid } : { valid, reason: `Role ${context.actor.role} does not satisfy ${requiredRole}` };
    }
    if (predicate.startsWith('document:')) {
      const required = predicate.replace('document:', '');
      const valid = Boolean(evidence.documentHash) && evidence.documentHash === required;
      return valid ? { valid } : { valid, reason: 'Document hash mismatch' };
    }
    if (predicate.startsWith('authorization')) {
      const valid = Boolean(evidence.authorizationProof);
      return valid ? { valid } : { valid, reason: 'Missing authorization proof' };
    }
    return { valid: true };
  }
}

export default FormalComplianceGraph;
