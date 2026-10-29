/**
 * How a review route's round is said, for any subject, Vault or QMS (RR2 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.10, §2.12, §3; the neutral module
 * v2/reviewRoute/):
 *
 *   - the naming history says who added a reviewer to an open route, when and why.
 */
import { describe, expect, it } from 'vitest';
import { historyLine } from '../reviewRoute/RouteHistory';
import type { RouteHistoryEntryView } from '../reviewRoute/routeRound';

describe('the naming history (RR2, §2.10, §2.12)', () => {
  it('says who added a reviewer to the open route, when and why', () => {
    const added: RouteHistoryEntryView = {
      action: 'add', at: '2026-10-29T14:02:00.000Z', actorId: 3, actorName: 'Sam Sender', reason: 'Biostatistics must see the PK tables',
      role: 'reviewer', toName: 'Rob Reviewer',
    };
    expect(historyLine(added)).toBe('Sam Sender added Rob Reviewer as a reviewer · 2026-10-29 14:02:00 UTC · Biostatistics must see the PK tables');
  });
});
