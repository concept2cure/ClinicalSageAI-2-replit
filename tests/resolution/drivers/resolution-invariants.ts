/**
 * Resolution Invariants — System Truth Assertions
 *
 * These are NOT test utilities. They are system rules that must ALWAYS hold.
 * If any invariant fails, the system has a governance defect.
 */

import type { ResolutionTestState } from './resolution-test-state';
import type { BundleExecutionReceipt } from '../../../shared/types/resolution';

/**
 * No superseded object remains authoritative.
 * If a supersession is confirmed, the superseded object cannot be in
 * an authoritative state (approved, published, locked).
 */
export function noSupersededObjectIsAuthoritative(state: ResolutionTestState): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const s of state.supersessions) {
    if (s.state !== 'confirmed') continue;

    // Check artifacts
    if (s.supersededObjectType === 'artifact') {
      const artifact = state.artifacts.find(
        a => a.id === s.supersededObjectId && a.organizationId === s.organizationId
      );
      if (artifact && ['approved', 'published', 'locked'].includes(artifact.status)) {
        violations.push(
          `Artifact "${artifact.title}" (${artifact.id}) is superseded but still in "${artifact.status}" state`
        );
      }
    }

    // Check documents
    if (s.supersededObjectType === 'document') {
      const doc = state.documents.find(
        d => d.id === s.supersededObjectId && d.organizationId === s.organizationId
      );
      if (doc && ['approved', 'published', 'locked'].includes(doc.status)) {
        violations.push(
          `Document "${doc.title}" (${doc.id}) is superseded but still in "${doc.status}" state`
        );
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * No duplicate supersessions exist.
 * For any (superseded, successor) pair, there should be at most one
 * non-reverted supersession record.
 */
export function noDuplicateSupersessions(state: ResolutionTestState): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  const seen = new Map<string, number>();

  for (const s of state.supersessions) {
    if (s.state === 'reverted') continue;
    const key = `${s.supersededObjectType}:${s.supersededObjectId}→${s.successorObjectType}:${s.successorObjectId}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) {
      violations.push(`Duplicate supersession: ${key} (${count} non-reverted records)`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Receipt accounts for every bundle item.
 * executed + prepared + blocked must equal totalItems.
 */
export function receiptAccountsForAllItems(receipt: BundleExecutionReceipt): {
  valid: boolean;
  detail: string;
} {
  const total = receipt.summary.executed + receipt.summary.prepared + receipt.summary.blocked;
  const valid = total === receipt.summary.totalItems;
  return {
    valid,
    detail: valid
      ? `All ${receipt.summary.totalItems} items accounted for`
      : `Mismatch: ${total} accounted vs ${receipt.summary.totalItems} total`,
  };
}

/**
 * Every executed step has complete lineage.
 */
export function allExecutedStepsHaveLineage(receipt: BundleExecutionReceipt): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const step of receipt.executedSteps) {
    if (!step.bundleId) violations.push(`${step.targetType}:${step.targetId} missing bundleId`);
    if (!step.timestamp) violations.push(`${step.targetType}:${step.targetId} missing timestamp`);
    if (!step.priorState) violations.push(`${step.targetType}:${step.targetId} missing priorState`);
    if (!step.newState) violations.push(`${step.targetType}:${step.targetId} missing newState`);
    if (step.priorState === step.newState && step.priorState !== 'already_completed') {
      violations.push(`${step.targetType}:${step.targetId} state did not change (${step.priorState})`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Every prepared step explains why it wasn't executed.
 */
export function allPreparedStepsExplained(receipt: BundleExecutionReceipt): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const step of receipt.preparedSteps) {
    if (!step.preparedAction || step.preparedAction.length < 10) {
      violations.push(`${step.targetType}:${step.targetId} has insufficient explanation: "${step.preparedAction}"`);
    }
    if (!step.confidence) {
      violations.push(`${step.targetType}:${step.targetId} missing confidence level`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Every blocked step names the blocking condition.
 */
export function allBlockedStepsNamed(receipt: BundleExecutionReceipt): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  for (const step of receipt.blockedSteps) {
    if (!step.reason || step.reason.length < 5) {
      violations.push(`${step.targetType}:${step.targetId} has insufficient blocking reason: "${step.reason}"`);
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Contradiction state never advances beyond what execution supports.
 */
export function contradictionStateMatchesReality(receipt: BundleExecutionReceipt): {
  valid: boolean;
  detail: string;
} {
  const { executed, prepared, blocked } = receipt.summary;

  if (executed === 0 && prepared === 0) {
    // All blocked — should be unresolved
    const valid = receipt.contradictionState === 'unresolved';
    return {
      valid,
      detail: valid
        ? 'All blocked → unresolved (correct)'
        : `All blocked but state is "${receipt.contradictionState}" (should be "unresolved")`,
    };
  }

  if (blocked === 0 && prepared === 0) {
    // All executed — should be resolved_pending_review
    const valid = receipt.contradictionState === 'resolved_pending_review';
    return {
      valid,
      detail: valid
        ? 'All executed → resolved_pending_review (correct)'
        : `All executed but state is "${receipt.contradictionState}" (should be "resolved_pending_review")`,
    };
  }

  // Mixed — should be in_resolution
  const valid = receipt.contradictionState === 'in_resolution';
  return {
    valid,
    detail: valid
      ? `Mixed (${executed} exec, ${prepared} prep, ${blocked} block) → in_resolution (correct)`
      : `Mixed execution but state is "${receipt.contradictionState}" (should be "in_resolution")`,
  };
}

/**
 * Run ALL invariants. Returns a combined report.
 */
export function runAllInvariants(
  state: ResolutionTestState,
  receipt: BundleExecutionReceipt
): { allValid: boolean; report: string[] } {
  const report: string[] = [];
  let allValid = true;

  const checks = [
    { name: 'No superseded object is authoritative', result: noSupersededObjectIsAuthoritative(state) },
    { name: 'No duplicate supersessions', result: noDuplicateSupersessions(state) },
  ];

  for (const check of checks) {
    if (!check.result.valid) {
      allValid = false;
      report.push(`FAIL: ${check.name}`);
      for (const v of check.result.violations) report.push(`  → ${v}`);
    } else {
      report.push(`PASS: ${check.name}`);
    }
  }

  const receiptChecks = [
    { name: 'Receipt accounts for all items', ...receiptAccountsForAllItems(receipt) },
    { name: 'All executed steps have lineage', ...allExecutedStepsHaveLineage(receipt) },
    { name: 'All prepared steps explained', ...allPreparedStepsExplained(receipt) },
    { name: 'All blocked steps named', ...allBlockedStepsNamed(receipt) },
    { name: 'Contradiction state matches reality', ...contradictionStateMatchesReality(receipt) },
  ];

  for (const check of receiptChecks) {
    if (!check.valid) {
      allValid = false;
      report.push(`FAIL: ${check.name}`);
      if ('violations' in check) {
        for (const v of (check as any).violations) report.push(`  → ${v}`);
      }
      if ('detail' in check) {
        report.push(`  → ${(check as any).detail}`);
      }
    } else {
      report.push(`PASS: ${check.name}`);
    }
  }

  return { allValid, report };
}
