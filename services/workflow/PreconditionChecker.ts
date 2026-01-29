/**
 * Precondition Checker
 * 
 * Evaluates workflow step preconditions to determine if a step can proceed.
 * Supports various condition types for the Workflow-as-Contract pillar.
 */

import type { Precondition } from '../../database/schema/workflow-definitions';
import type { WorkflowRun } from '../../database/schema/workflow-runs';
import type { WorkflowStep } from '../../database/schema/workflow-steps';
import type { PreconditionCheckResult } from '../../database/schema/step-runs';

export interface PreconditionContext {
  workflowRun: WorkflowRun;
  allSteps: WorkflowStep[];
  currentStep: WorkflowStep;
  artifacts?: Map<string, { id: string; status: string; version: string }>;
  externalData?: Record<string, unknown>;
}

export class PreconditionChecker {
  /**
   * Evaluate all preconditions for a step
   */
  async evaluateAll(
    preconditions: Precondition[],
    context: PreconditionContext
  ): Promise<{
    allPassed: boolean;
    results: PreconditionCheckResult[];
    blockers: string[];
  }> {
    const results: PreconditionCheckResult[] = [];
    const blockers: string[] = [];

    for (const precondition of preconditions) {
      const result = await this.evaluate(precondition, context);
      results.push(result);
      
      if (!result.passed) {
        blockers.push(result.errorMessage || `Precondition ${precondition.id} failed`);
      }
    }

    return {
      allPassed: results.every(r => r.passed),
      results,
      blockers,
    };
  }

  /**
   * Evaluate a single precondition
   */
  async evaluate(
    precondition: Precondition,
    context: PreconditionContext
  ): Promise<PreconditionCheckResult> {
    const { id, type, target, operator, value, errorMessage } = precondition;
    const { workflowRun, allSteps, artifacts, externalData } = context;

    try {
      switch (type) {
        case 'STEP_COMPLETE':
          return this.checkStepComplete(id, target, allSteps, errorMessage);

        case 'DATA_PRESENT':
          return this.checkDataPresent(id, target, operator, value, workflowRun, externalData, errorMessage);

        case 'APPROVAL_RECEIVED':
          return this.checkApprovalReceived(id, target, allSteps, errorMessage);

        case 'SIGNATURE_OBTAINED':
          return this.checkSignatureObtained(id, target, allSteps, errorMessage);

        case 'ARTIFACT_COMPLETE':
          return this.checkArtifactComplete(id, target, artifacts, workflowRun, errorMessage);

        case 'ROLE_ASSIGNED':
          return this.checkRoleAssigned(id, target, allSteps, errorMessage);

        case 'DEADLINE_NOT_PASSED':
          return this.checkDeadlineNotPassed(id, target, errorMessage);

        default:
          return {
            preconditionId: id,
            type,
            target,
            passed: false,
            errorMessage: `Unknown precondition type: ${type}`,
          };
      }
    } catch (error) {
      return {
        preconditionId: id,
        type,
        target,
        passed: false,
        errorMessage: error instanceof Error ? error.message : 'Evaluation error',
      };
    }
  }

  // ============================================================
  // INDIVIDUAL PRECONDITION CHECKERS
  // ============================================================

  private checkStepComplete(
    id: string,
    target: string,
    allSteps: WorkflowStep[],
    errorMessage?: string
  ): PreconditionCheckResult {
    const targetStep = allSteps.find(
      s => s.id === target || s.name === target || s.stepDefinitionId === target
    );

    if (!targetStep) {
      return {
        preconditionId: id,
        type: 'STEP_COMPLETE',
        target,
        passed: false,
        errorMessage: errorMessage || `Step "${target}" not found`,
      };
    }

    const passed = targetStep.status === 'COMPLETED';
    return {
      preconditionId: id,
      type: 'STEP_COMPLETE',
      target,
      passed,
      actualValue: targetStep.status,
      expectedValue: 'COMPLETED',
      errorMessage: passed ? undefined : (errorMessage || `Step "${targetStep.name}" is not complete (status: ${targetStep.status})`),
    };
  }

  private checkDataPresent(
    id: string,
    target: string,
    operator: string,
    value: unknown,
    workflowRun: WorkflowRun,
    externalData?: Record<string, unknown>,
    errorMessage?: string
  ): PreconditionCheckResult {
    // Check in workflow context first, then external data
    let actualValue = this.getNestedValue(workflowRun.context || {}, target);
    
    if (actualValue === undefined && externalData) {
      actualValue = this.getNestedValue(externalData, target);
    }

    const passed = this.evaluateOperator(operator, actualValue, value);

    return {
      preconditionId: id,
      type: 'DATA_PRESENT',
      target,
      passed,
      actualValue,
      expectedValue: value,
      errorMessage: passed ? undefined : (errorMessage || `Data "${target}" does not satisfy condition: ${operator} ${value}`),
    };
  }

  private checkApprovalReceived(
    id: string,
    target: string,
    allSteps: WorkflowStep[],
    errorMessage?: string
  ): PreconditionCheckResult {
    const targetStep = allSteps.find(
      s => s.id === target || s.name === target || s.stepDefinitionId === target
    );

    if (!targetStep) {
      return {
        preconditionId: id,
        type: 'APPROVAL_RECEIVED',
        target,
        passed: false,
        errorMessage: errorMessage || `Approval step "${target}" not found`,
      };
    }

    const approved = targetStep.completionData?.approved === true;
    return {
      preconditionId: id,
      type: 'APPROVAL_RECEIVED',
      target,
      passed: approved,
      actualValue: targetStep.completionData?.approved,
      expectedValue: true,
      errorMessage: approved ? undefined : (errorMessage || `Approval not received for "${targetStep.name}"`),
    };
  }

  private checkSignatureObtained(
    id: string,
    target: string,
    allSteps: WorkflowStep[],
    errorMessage?: string
  ): PreconditionCheckResult {
    const targetStep = allSteps.find(
      s => s.id === target || s.name === target || s.stepDefinitionId === target
    );

    if (!targetStep) {
      return {
        preconditionId: id,
        type: 'SIGNATURE_OBTAINED',
        target,
        passed: false,
        errorMessage: errorMessage || `Signature step "${target}" not found`,
      };
    }

    const signed = !!targetStep.completionData?.signatureId;
    return {
      preconditionId: id,
      type: 'SIGNATURE_OBTAINED',
      target,
      passed: signed,
      actualValue: !!targetStep.completionData?.signatureId,
      expectedValue: true,
      errorMessage: signed ? undefined : (errorMessage || `Signature not obtained for "${targetStep.name}"`),
    };
  }

  private checkArtifactComplete(
    id: string,
    target: string,
    artifacts?: Map<string, { id: string; status: string; version: string }>,
    workflowRun?: WorkflowRun,
    errorMessage?: string
  ): PreconditionCheckResult {
    // Check in artifacts map
    if (artifacts) {
      const artifact = artifacts.get(target);
      if (artifact && artifact.status === 'COMPLETE') {
        return {
          preconditionId: id,
          type: 'ARTIFACT_COMPLETE',
          target,
          passed: true,
          actualValue: artifact.status,
          expectedValue: 'COMPLETE',
        };
      }
    }

    // Check in workflow context
    const linkedArtifacts = workflowRun?.context?.linkedArtifacts || [];
    const found = linkedArtifacts.includes(target);

    return {
      preconditionId: id,
      type: 'ARTIFACT_COMPLETE',
      target,
      passed: found,
      actualValue: found,
      expectedValue: true,
      errorMessage: found ? undefined : (errorMessage || `Artifact "${target}" is not complete or not linked`),
    };
  }

  private checkRoleAssigned(
    id: string,
    target: string,
    allSteps: WorkflowStep[],
    errorMessage?: string
  ): PreconditionCheckResult {
    const targetStep = allSteps.find(
      s => s.id === target || s.name === target || s.stepDefinitionId === target
    );

    if (!targetStep) {
      return {
        preconditionId: id,
        type: 'ROLE_ASSIGNED',
        target,
        passed: false,
        errorMessage: errorMessage || `Step "${target}" not found`,
      };
    }

    const assigned = !!targetStep.assigneeUserId;
    return {
      preconditionId: id,
      type: 'ROLE_ASSIGNED',
      target,
      passed: assigned,
      actualValue: !!targetStep.assigneeUserId,
      expectedValue: true,
      errorMessage: assigned ? undefined : (errorMessage || `No assignee for step "${targetStep.name}"`),
    };
  }

  private checkDeadlineNotPassed(
    id: string,
    target: string,
    errorMessage?: string
  ): PreconditionCheckResult {
    const deadline = new Date(target);
    const now = new Date();
    const passed = now < deadline;

    return {
      preconditionId: id,
      type: 'DEADLINE_NOT_PASSED',
      target,
      passed,
      actualValue: now.toISOString(),
      expectedValue: target,
      errorMessage: passed ? undefined : (errorMessage || `Deadline has passed: ${target}`),
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private evaluateOperator(operator: string, actual: unknown, expected: unknown): boolean {
    switch (operator) {
      case 'EXISTS':
        return actual !== undefined && actual !== null;
      
      case 'EQUALS':
        return actual === expected;
      
      case 'NOT_EQUALS':
        return actual !== expected;
      
      case 'CONTAINS':
        if (typeof actual === 'string') {
          return actual.includes(String(expected));
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        return false;
      
      case 'NOT_CONTAINS':
        if (typeof actual === 'string') {
          return !actual.includes(String(expected));
        }
        if (Array.isArray(actual)) {
          return !actual.includes(expected);
        }
        return true;
      
      case 'GREATER_THAN':
        return Number(actual) > Number(expected);
      
      case 'GREATER_THAN_OR_EQUAL':
        return Number(actual) >= Number(expected);
      
      case 'LESS_THAN':
        return Number(actual) < Number(expected);
      
      case 'LESS_THAN_OR_EQUAL':
        return Number(actual) <= Number(expected);
      
      case 'NOT_EMPTY':
        if (actual === undefined || actual === null) return false;
        if (typeof actual === 'string') return actual.trim().length > 0;
        if (Array.isArray(actual)) return actual.length > 0;
        if (typeof actual === 'object') return Object.keys(actual).length > 0;
        return true;
      
      case 'IS_EMPTY':
        if (actual === undefined || actual === null) return true;
        if (typeof actual === 'string') return actual.trim().length === 0;
        if (Array.isArray(actual)) return actual.length === 0;
        if (typeof actual === 'object') return Object.keys(actual).length === 0;
        return false;
      
      case 'MATCHES_REGEX':
        try {
          const regex = new RegExp(String(expected));
          return regex.test(String(actual));
        } catch {
          return false;
        }
      
      case 'IN_LIST':
        if (Array.isArray(expected)) {
          return expected.includes(actual);
        }
        return false;
      
      case 'NOT_IN_LIST':
        if (Array.isArray(expected)) {
          return !expected.includes(actual);
        }
        return true;
      
      default:
        return false;
    }
  }

  /**
   * Get human-readable description of a precondition
   */
  describePrecon dition(precondition: Precondition): string {
    const { type, target, operator, value } = precondition;

    switch (type) {
      case 'STEP_COMPLETE':
        return `Step "${target}" must be completed`;
      
      case 'DATA_PRESENT':
        return `Data "${target}" must ${operator.toLowerCase().replace('_', ' ')} ${value || ''}`.trim();
      
      case 'APPROVAL_RECEIVED':
        return `Approval must be received for "${target}"`;
      
      case 'SIGNATURE_OBTAINED':
        return `Signature must be obtained for "${target}"`;
      
      case 'ARTIFACT_COMPLETE':
        return `Artifact "${target}" must be complete`;
      
      case 'ROLE_ASSIGNED':
        return `An assignee must be set for "${target}"`;
      
      case 'DEADLINE_NOT_PASSED':
        return `Current time must be before ${target}`;
      
      default:
        return `Unknown condition on "${target}"`;
    }
  }
}

// Export singleton
export const preconditionChecker = new PreconditionChecker();
export default PreconditionChecker;
