/**
 * Contract: a baseline entry that stopped being reported is explained by the
 * reason that is actually true.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `scripts/ci/check-tables-against-live-schema.mjs` baselines tables the server
 * QUERIES that do not exist on a provisioned database. When a baselined name is
 * no longer in the current absent set it prints:
 *
 *     ✅ N baselined table(s) now exist — remove them from the baseline to
 *        ratchet down
 *
 * computed as `baselined.filter(t => !absent.includes(t))`. But a name leaves
 * the absent set for TWO different reasons:
 *
 *   1. it now RESOLVES on the live database — the table was created;
 *   2. it is no longer REFERENCED by any server SQL — the querying code was
 *      deleted, so it is out of scope and was never created.
 *
 * The message asserts (1) for both. Executed against the live database on
 * 2026-09-18 it reported nine tables as "now exist", and eight of them do not:
 *
 *     design_changes        DOES NOT EXIST
 *     design_inputs         DOES NOT EXIST
 *     design_outputs        DOES NOT EXIST
 *     design_plans          DOES NOT EXIST
 *     design_reviews        DOES NOT EXIST
 *     design_validations    DOES NOT EXIST
 *     design_verifications  DOES NOT EXIST
 *     risk_management_files DOES NOT EXIST
 *     vault.evidence_citations   ← the only one that genuinely exists
 *
 * The eight dropped out because commit 153481465 deleted `/api/design-risk` and
 * with it the code that queried them. Both are legitimate reasons to shrink the
 * baseline — the point of this gate — but they are different facts, and someone
 * acting on "now exist" would believe eight tables had been created that were
 * not. A verdict reported for a check that did not establish it.
 */
import { describe, it, expect } from 'vitest';
import { classifyBaselineDrift } from '../../scripts/ci/lib/baseline-drift.mjs';

describe('a baselined entry that left the absent set is explained correctly', () => {
  const baselined = new Set(['created_table', 'orphaned_table', 'still_absent']);
  // `referenced` is what server SQL still mentions. `orphaned_table` is gone
  // from it because the querying code was deleted.
  const referenced = new Set(['created_table', 'still_absent']);
  // `absent` is referenced-and-unresolvable. `created_table` resolves now.
  const absent = ['still_absent'];

  const drift = classifyBaselineDrift({ baselined, referenced, absent });

  it('reports a table that now resolves as now existing', () => {
    expect(drift.nowExists).toEqual(['created_table']);
  });

  it('does NOT claim an unreferenced table now exists', () => {
    // The whole defect in one assertion: `orphaned_table` was never created.
    expect(drift.nowExists).not.toContain('orphaned_table');
  });

  it('reports it as no longer referenced instead', () => {
    expect(drift.noLongerReferenced).toEqual(['orphaned_table']);
  });

  it('leaves a genuinely-absent entry in the baseline', () => {
    expect(drift.nowExists).not.toContain('still_absent');
    expect(drift.noLongerReferenced).not.toContain('still_absent');
  });

  it('accounts for every departed entry exactly once', () => {
    const departed = [...baselined].filter((t) => !absent.includes(t)).sort();
    const explained = [...drift.nowExists, ...drift.noLongerReferenced].sort();
    expect(explained).toEqual(departed);
  });
});
