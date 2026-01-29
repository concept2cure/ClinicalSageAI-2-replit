/**
 * Auto-Advance Service
 * 
 * Monitors workflow steps and automatically advances them when
 * preconditions are met. Implements the autonomous aspect of
 * Workflow-as-Contract pillar.
 */

import { WorkflowExecutionEngine } from './WorkflowExecutionEngine';
import { PreconditionChecker } from './PreconditionChecker';
import type { WorkflowRun } from '../../database/schema/workflow-runs';
import type { WorkflowStep } from '../../database/schema/workflow-steps';

export interface AutoAdvanceConfig {
  enabled: boolean;
  checkIntervalMs: number;
  maxConcurrentChecks: number;
  enableLogging: boolean;
  systemUserId: string;
}

export interface AutoAdvanceResult {
  stepId: string;
  stepName: string;
  advanced: boolean;
  reason: string;
  timestamp: Date;
}

const DEFAULT_CONFIG: AutoAdvanceConfig = {
  enabled: true,
  checkIntervalMs: 5000, // 5 seconds
  maxConcurrentChecks: 10,
  enableLogging: true,
  systemUserId: 'system-auto-advance',
};

export class AutoAdvanceService {
  private config: AutoAdvanceConfig;
  private engine: WorkflowExecutionEngine;
  private checker: PreconditionChecker;
  private activeChecks: Map<string, NodeJS.Timeout> = new Map();
  private running: boolean = false;

  constructor(
    engine: WorkflowExecutionEngine,
    config: Partial<AutoAdvanceConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.engine = engine;
    this.checker = new PreconditionChecker();
  }

  // ============================================================
  // SERVICE LIFECYCLE
  // ============================================================

  /**
   * Start monitoring a workflow run for auto-advance opportunities
   */
  startMonitoring(workflowRun: WorkflowRun, allSteps: WorkflowStep[]): void {
    if (!this.config.enabled) return;
    
    const runId = workflowRun.id;
    
    if (this.activeChecks.has(runId)) {
      this.log(`Already monitoring workflow ${runId}`);
      return;
    }

    this.log(`Starting auto-advance monitoring for workflow ${runId}`);
    
    const intervalId = setInterval(() => {
      this.checkAndAdvance(workflowRun, allSteps);
    }, this.config.checkIntervalMs);

    this.activeChecks.set(runId, intervalId);
  }

  /**
   * Stop monitoring a workflow run
   */
  stopMonitoring(workflowRunId: string): void {
    const intervalId = this.activeChecks.get(workflowRunId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activeChecks.delete(workflowRunId);
      this.log(`Stopped monitoring workflow ${workflowRunId}`);
    }
  }

  /**
   * Stop all monitoring
   */
  stopAll(): void {
    this.activeChecks.forEach((intervalId, runId) => {
      clearInterval(intervalId);
      this.log(`Stopped monitoring workflow ${runId}`);
    });
    this.activeChecks.clear();
    this.running = false;
  }

  // ============================================================
  // AUTO-ADVANCE LOGIC
  // ============================================================

  /**
   * Check all eligible steps and advance if preconditions met
   */
  async checkAndAdvance(
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<AutoAdvanceResult[]> {
    const results: AutoAdvanceResult[] = [];

    // Find steps that are ready for auto-advance
    const eligibleSteps = allSteps.filter(step => 
      step.isAutoAdvance &&
      (step.status === 'READY' || step.status === 'PENDING') &&
      !step.slaBreached
    );

    this.log(`Checking ${eligibleSteps.length} eligible steps for auto-advance`);

    for (const step of eligibleSteps) {
      try {
        const result = await this.attemptAutoAdvance(step, workflowRun, allSteps);
        results.push(result);

        if (result.advanced) {
          this.log(`✅ Auto-advanced step: ${step.name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          stepId: step.id,
          stepName: step.name,
          advanced: false,
          reason: `Error: ${errorMessage}`,
          timestamp: new Date(),
        });
        this.log(`❌ Error checking step ${step.name}: ${errorMessage}`);
      }
    }

    // Check if workflow is complete
    const allComplete = allSteps.every(
      s => s.status === 'COMPLETED' || s.status === 'SKIPPED'
    );
    if (allComplete) {
      this.stopMonitoring(workflowRun.id);
      this.log(`Workflow ${workflowRun.id} completed, stopping monitoring`);
    }

    return results;
  }

  /**
   * Attempt to auto-advance a single step
   */
  private async attemptAutoAdvance(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<AutoAdvanceResult> {
    // Evaluate preconditions
    const { allPassed, results, blockers } = await this.checker.evaluateAll(
      step.preconditions || [],
      {
        workflowRun,
        allSteps,
        currentStep: step,
      }
    );

    if (!allPassed) {
      return {
        stepId: step.id,
        stepName: step.name,
        advanced: false,
        reason: `Preconditions not met: ${blockers.join(', ')}`,
        timestamp: new Date(),
      };
    }

    // All preconditions met - advance the step
    const advanceResult = await this.engine.advanceStep(
      step,
      workflowRun,
      allSteps,
      { notes: 'Auto-advanced by system' },
      this.config.systemUserId
    );

    if (advanceResult.success) {
      return {
        stepId: step.id,
        stepName: step.name,
        advanced: true,
        reason: 'All preconditions met, step completed automatically',
        timestamp: new Date(),
      };
    } else {
      return {
        stepId: step.id,
        stepName: step.name,
        advanced: false,
        reason: advanceResult.error || 'Failed to advance step',
        timestamp: new Date(),
      };
    }
  }

  // ============================================================
  // SLA MONITORING
  // ============================================================

  /**
   * Check for SLA breaches and trigger escalations
   */
  async checkSlaBreaches(
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<{
    breached: WorkflowStep[];
    atRisk: WorkflowStep[];
    escalationsTriggered: number;
  }> {
    const now = new Date();
    const warningThresholdHours = 8;
    const breached: WorkflowStep[] = [];
    const atRisk: WorkflowStep[] = [];
    let escalationsTriggered = 0;

    for (const step of allSteps) {
      // Skip completed or skipped steps
      if (step.status === 'COMPLETED' || step.status === 'SKIPPED') continue;
      if (!step.slaDueAt) continue;

      const dueAt = new Date(step.slaDueAt);
      const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (hoursRemaining < 0) {
        // SLA breached
        if (!step.slaBreached) {
          step.slaBreached = true;
          step.slaBreachedAt = now;
        }
        breached.push(step);

        // Trigger escalation
        await this.triggerEscalation(step, workflowRun, 'BREACH');
        escalationsTriggered++;

      } else if (hoursRemaining <= warningThresholdHours) {
        // At risk
        atRisk.push(step);

        // Warning escalation
        if (step.escalationLevel === 0) {
          await this.triggerEscalation(step, workflowRun, 'WARNING');
          escalationsTriggered++;
        }
      }
    }

    return { breached, atRisk, escalationsTriggered };
  }

  /**
   * Trigger an escalation for a step
   */
  private async triggerEscalation(
    step: WorkflowStep,
    workflowRun: WorkflowRun,
    level: 'WARNING' | 'BREACH'
  ): Promise<void> {
    const escalationRules = step.escalationRules || [];
    
    for (const rule of escalationRules) {
      const shouldTrigger = level === 'BREACH' 
        ? rule.action === 'NOTIFY' || rule.action === 'ESCALATE_MANAGER'
        : rule.action === 'NOTIFY';

      if (shouldTrigger) {
        this.log(`🚨 Escalation triggered for step ${step.name}: ${rule.action}`);
        
        // In real implementation, send notifications
        // await notificationService.send({
        //   recipients: rule.recipients,
        //   message: rule.message || `SLA ${level} for step: ${step.name}`,
        //   type: 'ESCALATION',
        // });

        step.escalationLevel += 1;
      }
    }
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Get current monitoring status
   */
  getStatus(): {
    running: boolean;
    activeWorkflows: number;
    workflowIds: string[];
  } {
    return {
      running: this.config.enabled && this.activeChecks.size > 0,
      activeWorkflows: this.activeChecks.size,
      workflowIds: Array.from(this.activeChecks.keys()),
    };
  }

  /**
   * Force check a specific workflow (outside normal interval)
   */
  async forceCheck(
    workflowRun: WorkflowRun,
    allSteps: WorkflowStep[]
  ): Promise<AutoAdvanceResult[]> {
    this.log(`Force checking workflow ${workflowRun.id}`);
    return this.checkAndAdvance(workflowRun, allSteps);
  }

  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[AutoAdvance] ${message}`);
    }
  }
}

// Export factory function
export function createAutoAdvanceService(
  engine: WorkflowExecutionEngine,
  config?: Partial<AutoAdvanceConfig>
): AutoAdvanceService {
  return new AutoAdvanceService(engine, config);
}

export default AutoAdvanceService;
