import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const route = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ pool: { query } }));
vi.mock('../../ai-gateway/gateway', () => ({
  getGateway: () => ({ getEnabledProviders: () => [], route }),
}));

import {
  STUDY_TWIN_DISCLAIMER,
  HISTORY_UPLOAD_REQUEST,
  buildSimulationPrompt,
  composeSimulationResult,
  simulateStudyTwin,
} from '../study-twin-service';

const design: any = {
  title: 'X',
  phase: '2',
  indication: 'NSCLC',
  framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo' },
  endpoints: [{ name: 'ORR', role: 'primary', type: 'binary', definition: 'objective response rate' }],
  statisticalPlan: {
    alpha: 0.05,
    power: 0.9,
    plannedSampleSize: 300,
    plannedAnalyses: [],
    powerAssumptions: { effectSize: 0.15 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
});

describe('buildSimulationPrompt', () => {
  it('includes phase, indication, endpoint and a no-history note when ungrounded', () => {
    const { system, user } = buildSimulationPrompt(design, '');
    expect(system).toContain('predict');
    expect(user).toContain('NSCLC');
    expect(user).toContain('ORR');
    expect(user).toMatch(/No client-uploaded historical evidence/i);
  });
  it('embeds grounding text when present', () => {
    const { user } = buildSimulationPrompt(design, 'Prior CSR: ORR 18% in line 2.');
    expect(user).toContain('Prior CSR: ORR 18%');
  });
});

describe('composeSimulationResult — disclaimer + upload prompt', () => {
  it('ALWAYS attaches the disclaimer', () => {
    expect(composeSimulationResult('pred', true, '2', 'NSCLC').disclaimer).toBe(STUDY_TWIN_DISCLAIMER);
    expect(composeSimulationResult('pred', false, '2', 'NSCLC').disclaimer).toBe(STUDY_TWIN_DISCLAIMER);
  });
  it('requests a history upload only when there is no history', () => {
    const ungrounded = composeSimulationResult('p', false, '2', 'x');
    expect(ungrounded.needsHistoryUpload).toBe(true);
    expect(ungrounded.historyRequest).toBe(HISTORY_UPLOAD_REQUEST);
    const grounded = composeSimulationResult('p', true, '2', 'x');
    expect(grounded.needsHistoryUpload).toBe(false);
    expect(grounded.historyRequest).toBeUndefined();
  });
});

describe('simulateStudyTwin', () => {
  it('always returns a disclaimer; degrades gracefully with no provider and asks for upload', async () => {
    const r = await simulateStudyTwin({ design, organizationId: 1 });
    expect(r.disclaimer).toBe(STUDY_TWIN_DISCLAIMER);
    expect(r.needsHistoryUpload).toBe(true);
    expect(r.historyRequest).toBe(HISTORY_UPLOAD_REQUEST);
    expect(r.prediction).toBeTruthy();
    expect(route).not.toHaveBeenCalled(); // no enabled provider → no model call
  });
  it('treats supplied grounding text as history (no upload request)', async () => {
    const r = await simulateStudyTwin({ design, organizationId: 1 }, 'Prior CSR data...');
    expect(r.needsHistoryUpload).toBe(false);
    expect(r.grounded).toBe(true);
  });
  it('marks grounded when csr_reports exist for the org', async () => {
    query.mockResolvedValue({ rows: [{ ok: 1 }] });
    const r = await simulateStudyTwin({ design, organizationId: 1 });
    expect(r.grounded).toBe(true);
    expect(r.needsHistoryUpload).toBe(false);
  });
});
