import { describe, expect, it, vi } from 'vitest';
import { PredictiveIntelligenceEngine } from '../services/ai/PredictiveIntelligenceEngine';
import { createPredictiveIntelligenceService } from '../services/ai';
import { WorkflowExecutionEngine as PrototypeWorkflow, createWorkflowEngine } from '../services/workflow/WorkflowExecutionEngine';
import { WorkflowExecutionEngine as LegacyDatabaseWorkflow } from '../server/services/workflow/WorkflowExecutionEngine';

describe('retired parallel execution contracts', () => {
  it('refuses the unvalidated literal-rate predictor before any probability can be returned', () => {
    expect(() => new PredictiveIntelligenceEngine()).toThrowError(expect.objectContaining({ code: 'PREDICTIVE_ENGINE_UNAVAILABLE' }));
    expect(() => createPredictiveIntelligenceService({ monitoringEnabled: true })).toThrowError(expect.objectContaining({ code: 'PREDICTIVE_ENGINE_UNAVAILABLE' }));
  });
  it('refuses the prototype workflow factory before simulated notification/task/worker/lock effects can report completion', () => {
    const logger = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(() => new PrototypeWorkflow()).toThrowError(expect.objectContaining({ code: 'PARALLEL_WORKFLOW_RETIRED' }));
      expect(() => createWorkflowEngine()).toThrowError(expect.objectContaining({ code: 'PARALLEL_WORKFLOW_RETIRED' }));
      expect(logger).not.toHaveBeenCalled();
    } finally { logger.mockRestore(); }
  });
  it('refuses the legacy database workflow before any run, effect, audit or completed step is persisted', () => {
    const query = vi.fn(); const logger = { info: vi.fn(), error: vi.fn() };
    expect(() => new LegacyDatabaseWorkflow({ query }, logger)).toThrowError(expect.objectContaining({ code: 'PARALLEL_WORKFLOW_RETIRED' }));
    expect(query).not.toHaveBeenCalled(); expect(logger.info).not.toHaveBeenCalled();
  });
});
