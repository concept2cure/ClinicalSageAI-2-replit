/**
 * Tests for runProactiveDigest's preference gating — quiet hours, severity floor,
 * and signal muting — with the signal sources + notification sink mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDeadlineRadar = vi.fn();
const getOpenBlockersForOrg = vi.fn();
const getOpenContradictionsForOrg = vi.fn();
const createNotification = vi.fn();

vi.mock('../../ana/deadline-radar.js', () => ({
  getDeadlineRadar: (...a: unknown[]) => getDeadlineRadar(...a),
}));
vi.mock('../../ana/risk-watch.js', () => ({
  getOpenBlockersForOrg: (...a: unknown[]) => getOpenBlockersForOrg(...a),
  summarizeBlockers: (b: Array<{ severity?: string }>) => {
    const out = { critical: 0, high: 0, medium: 0, low: 0, total: b.length };
    for (const x of b) {
      const s = (x.severity ?? '').toLowerCase();
      if (s in out) (out as Record<string, number>)[s]++;
    }
    return out;
  },
}));
vi.mock('../../ana/contradiction-watch.js', () => ({
  getOpenContradictionsForOrg: (...a: unknown[]) => getOpenContradictionsForOrg(...a),
  summarizeContradictions: (c: Array<{ severity?: string; blocksPromotion?: boolean }>) => {
    const out = { critical: 0, high: 0, medium: 0, low: 0, blocksPromotion: 0, total: c.length };
    for (const x of c) {
      const s = (x.severity ?? '').toLowerCase();
      if (s in out) (out as Record<string, number>)[s]++;
      if (x.blocksPromotion) out.blocksPromotion++;
    }
    return out;
  },
}));
vi.mock('../../notifications/notification-service.js', () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}));

import { runProactiveDigest } from '../proactive-digest.js';
import { DEFAULT_DIGEST_PREFERENCES, type DigestPreferences } from '../digest-preferences.js';

const emptyRadar = { windowDays: 30, summary: { overdue: 0, due_soon: 0, upcoming: 0, total: 0 }, items: [] };
const overdueRadar = {
  windowDays: 30,
  summary: { overdue: 1, due_soon: 0, upcoming: 0, total: 1 },
  items: [{ id: 1, title: 'X', agency: 'FDA', dueDate: '2026-06-01T00:00:00Z', daysUntilDue: -5, bucket: 'overdue' }],
};

function prefs(over: Partial<DigestPreferences> = {}): DigestPreferences {
  return { ...DEFAULT_DIGEST_PREFERENCES, mutedSignals: [], ...over };
}

beforeEach(() => {
  getDeadlineRadar.mockReset().mockResolvedValue(emptyRadar);
  getOpenBlockersForOrg.mockReset().mockResolvedValue([]);
  getOpenContradictionsForOrg.mockReset().mockResolvedValue([]);
  createNotification.mockReset().mockResolvedValue(42);
});

describe('runProactiveDigest gating', () => {
  it('skips during quiet hours WITHOUT querying signals', async () => {
    const at2am = new Date(2026, 5, 17, 2, 0, 0);
    const res = await runProactiveDigest(1, prefs({ quietHours: { start: 22, end: 7 } }), at2am);
    expect(res).toEqual({ created: false, skipped: 'quiet_hours' });
    expect(getDeadlineRadar).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('skips when the rolled-up severity is below the floor', async () => {
    getDeadlineRadar.mockResolvedValue(overdueRadar); // overdue → critical
    // floor critical lets it through; floor higher than result is the skip case:
    getDeadlineRadar.mockResolvedValue({
      windowDays: 30,
      summary: { overdue: 0, due_soon: 1, upcoming: 0, total: 1 },
      items: [{ id: 1, title: 'Y', agency: 'FDA', dueDate: '2026-06-25T00:00:00Z', daysUntilDue: 8, bucket: 'due_soon' }],
    }); // due_soon → warning
    const res = await runProactiveDigest(1, prefs({ minSeverity: 'critical' }), new Date(2026, 5, 17, 9));
    expect(res.created).toBe(false);
    expect(res.skipped).toBe('below_severity_floor');
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('fires when severity meets the floor', async () => {
    getDeadlineRadar.mockResolvedValue(overdueRadar); // critical
    const res = await runProactiveDigest(1, prefs({ minSeverity: 'critical' }), new Date(2026, 5, 17, 9));
    expect(res.created).toBe(true);
    expect(res.notificationId).toBe(42);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('muting the only active signal yields nothing_material', async () => {
    getOpenContradictionsForOrg.mockResolvedValue([
      { id: 'f', title: 'c', severity: 'critical', contradictionType: 'x', authorityState: 'blocks_promotion', projectId: 1, createdAt: null, blocksPromotion: true },
    ]);
    const res = await runProactiveDigest(1, prefs({ mutedSignals: ['contradictions'] }), new Date(2026, 5, 17, 9));
    expect(res).toEqual({ created: false, skipped: 'nothing_material' });
  });
});
