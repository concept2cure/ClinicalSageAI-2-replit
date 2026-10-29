// @vitest-environment jsdom
/**
 * The four Workbench panels — Tasks, Validation, Submissions, Templates — each
 * used to hold a set of example rows reached through sample mode.
 *
 * ── What was removed ─────────────────────────────────────────────────────────
 * `SUBMISSIONS` had to go regardless of gating. Its rows carried
 * `cover: 'signed'`, `esig: true`, a log line reading "Cover letter e-signed
 * (AUD-9104)" — an invented Part 11 signature id — and a "CLEARED · K254481"
 * decision against a clearance-shaped number, and they drove the transmission
 * gate the panel renders. The same fabrication was removed twice before, from
 * the v2 Submission Center and from the pathway audit and approvals panes.
 *
 * The other six row sets (TASKS, TASKS_METRICS, VALIDATION_SUMMARY,
 * VALIDATION_PROGRAMS, VALIDATION_RULES, TEMPLATES) were example content, and
 * gating plus a banner is the right treatment for that. Workbench rendered a
 * banner on the submissions panel ALONE, so tasks, validation findings and
 * templates appeared unmarked — indistinguishable from the tenant's own work.
 *
 * ── What this test pins ──────────────────────────────────────────────────────
 * The data module keeps no fabricated record. The Tasks panel and its three
 * live-read cases went with the fold into Tasks (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-device-tasks/); Tasks pins the same
 * failed-read-is-not-empty rule in taskBoardResponseShape.test.tsx. The Validation and
 * Submissions panels have their own tests beside this file.
 */
import { describe, it, expect } from 'vitest';

describe('the workbench data module carries no fabricated record', () => {
  it('holds no signature, clearance number or audit id', async () => {
    const mod = await import('../../data/workbench');
    const exported = Object.keys(mod);

    for (const gone of [
      'TASKS',
      'TASKS_METRICS',
      'VALIDATION_SUMMARY',
      'VALIDATION_PROGRAMS',
      'VALIDATION_RULES',
      'SUBMISSIONS',
      'TEMPLATES',
      // The task panel folded into Tasks (D2, 2026-10-29); its columns went with it.
      'TASKS_COLUMNS',
    ]) {
      expect(exported).not.toContain(gone);
    }

    /* The one that stays: the stages of a regulatory submission are real
       structure, not an assessment of anybody's work. */
    expect(exported).toContain('SUBMISSION_PIPELINE');

    /* Nothing reachable from the module serialises a signature or a decision. */
    const serialised = JSON.stringify(
      Object.fromEntries(exported.map((k) => [k, (mod as Record<string, unknown>)[k]])),
    );
    for (const marker of ['AUD-9104', 'K254481', 'e-signed', 'CLEARED']) {
      expect(serialised).not.toContain(marker);
    }
  });
});
