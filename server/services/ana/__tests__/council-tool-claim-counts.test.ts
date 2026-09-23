/**
 * convene_drafting_council reports which numerical claims were checked.
 *
 * The council's Statistician marks a claim UNVERIFIABLE when no bound data
 * source answered it (multi-agent-council.ts). The tool used to report only
 * discrepancies and a corrections count, so a draft whose every figure went
 * unchecked came back as "0 corrections" — which the assistant could only
 * narrate as a clean check. The counts below let it say how many were checked.
 */
import { describe, it, expect, vi } from 'vitest';

const VERIFICATIONS = [
  { claim: '412 enrolled', claimedValue: '412', actualValue: '412', source: 'EDC', status: 'VERIFIED' },
  { claim: '2 deaths', claimedValue: '2', actualValue: '3', source: 'EDC', status: 'DISCREPANCY', correction: '3' },
  { claim: 'median age 54', claimedValue: '54', actualValue: null, source: 'demographics', status: 'UNVERIFIABLE' },
  { claim: '31 sites', claimedValue: '31', actualValue: null, source: 'CTMS', status: 'UNVERIFIABLE' },
];

vi.mock('../../../db.js', () => ({
  getPool: () => ({ query: async () => ({ rows: [{ n: 4 }] }) }),
}));
vi.mock('../../multi-agent-council.js', () => ({
  MultiAgentCouncilService: class {
    async initializeSession() {
      return 's1';
    }
    async executeCouncil() {
      return {
        id: 's1',
        sectionPath: '2.7.3',
        status: 'COMPLETED',
        draftText: 'draft',
        finalText: 'final',
        statisticianResult: { verifications: VERIFICATIONS, totalClaims: 4, discrepancyCount: 1 },
        criticResult: { issues: [], overallAssessment: 'REVISE' },
        corrections: 1,
        issues: 0,
      };
    }
  },
}));

import { getToolHandler } from '../AnaToolExecutor.js';

describe('convene_drafting_council — claim counts', () => {
  it('reports claims found, checked against data, and unverifiable', async () => {
    const out = JSON.parse(await getToolHandler('convene_drafting_council')!({ section_path: '2.7.3' }, {}));

    expect(out.status).toBe('completed');
    expect(out).toMatchObject({
      claims_found: 4,
      claims_checked_against_data: 2,
      claims_unverifiable: 2,
      corrections_applied: 1,
    });
    expect(out.discrepancies).toHaveLength(1);
  });
});
