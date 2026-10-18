/**
 * Change-impact enrichment states what the signal history shows, and no more
 * (finding 31, 2026-10-15).
 *
 * What the code used to do:
 *   - any high/critical action seen in two or more runs became an insight
 *     titled "Unresolved: …" whose detail ended "It remains unresolved." The
 *     latest run and any resolution were never checked, and the history is
 *     per-process memory.
 *   - a section with signal history but too few judgment signals for a trend
 *     reported sectionTrend 'stable'.
 */
import { describe, expect, it } from 'vitest';

import { enrichChangeImpact } from '../rim-change-impact';
import { captureSignal } from '../signal-capture';

const ORG = 91;

function highRisk(projectId: number, runId: string) {
  captureSignal({
    type: 'compliance_scan',
    provenance: { judgmentFrameworkVersion: 't', patternRegistryVersion: 't', runId, runType: 'pattern_scan' },
    organizationId: ORG,
    projectId,
    sectionCode: '2.7.4',
    riskLevel: 'critical',
    reviewerSensitivity: 'likely_question',
    defensibilityVerdict: 'at_risk',
    score: 20,
    confidence: null,
    action: 'Reconcile adverse event counts with Module 5',
    patternIds: [],
    metadata: {},
  });
}

describe('enrichChangeImpact', () => {
  it('an action seen in two runs is "flagged in 2 runs", not "unresolved"', () => {
    highRisk(92, 'run-a');
    highRisk(92, 'run-b');
    const enrichment = enrichChangeImpact(ORG, 92, '2.7.4');
    const issue = enrichment.insights.find(i => i.type === 'persisting_issue');
    expect(issue).toBeDefined();
    expect(`${issue!.title} ${issue!.detail}`).not.toMatch(/unresolved/i);
    expect(issue!.title).toBe('Flagged in 2 runs: Reconcile adverse event counts with Module 5');
    expect(issue!.detail).toMatch(/resolution not checked/);
  });

  it('history with too few judgment signals states no section trend', () => {
    highRisk(93, 'run-c');
    const enrichment = enrichChangeImpact(ORG, 93, '2.7.4');
    expect(enrichment.priorSignalCount).toBe(1);
    expect(enrichment.sectionTrend).toBeNull();
    expect(enrichment.sectionTrendConfidence).toBe('insufficient');
  });
});
