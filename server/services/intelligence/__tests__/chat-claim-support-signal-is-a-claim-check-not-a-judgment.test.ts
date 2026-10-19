/**
 * A chat turn's claim-support signal is filed as the deterministic check it is,
 * not as a judgment.
 *
 * interceptChatResponse filed the turn's supported-claim rate (claims the chat
 * path's citation check marked SUPPORTED, over claims made) as type 'judgment'.
 * 'judgment' is the judgment framework's model scores, and RIM computes its
 * trends over judgment signals only, as the one stable scoring definition
 * (getSignalSummary here; rim-change-impact and rim-cross-artifact likewise),
 * so every chat turn's claim rate was averaged into the project's judgment
 * trend. It is now 'claim_check' in the signal vocabulary (SignalType).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {} }));

import { interceptChatResponse } from '../rim-interceptors';
import { getSignalSummary, querySignals } from '../signal-capture';

const ORG = 5151;
const PROJECT = 77;

describe('the chat claim-support signal', () => {
  it("is a 'claim_check', and none reaches the judgment signals or their trend", () => {
    for (let turn = 0; turn < 12; turn++) {
      interceptChatResponse({
        organizationId: ORG,
        projectId: PROJECT,
        assistantMessage: 'The pharmacokinetic parameters were derived with validated methods.',
        claimCount: 4,
        supportedClaimRate: turn < 6 ? 0.25 : 1,
        model: 'm',
        provider: 'p',
      });
    }

    expect(querySignals({ organizationId: ORG, projectId: PROJECT, type: 'judgment' })).toEqual([]);
    const checks = querySignals({ organizationId: ORG, projectId: PROJECT, type: 'claim_check' });
    expect(checks).toHaveLength(12);
    expect(checks[0]).toMatchObject({ confidence: null, metadata: { source: 'chat_interceptor', claimCount: 4 } });

    // Twelve claim rates rising 25 -> 100 used to read as an "improving" judgment trend.
    const summary = getSignalSummary(ORG, PROJECT);
    expect(summary.trendSampleSize).toBe(0);
    expect(summary.overallTrend).toBeNull();
  });
});
