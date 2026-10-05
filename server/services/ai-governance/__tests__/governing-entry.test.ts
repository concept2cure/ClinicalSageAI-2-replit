/**
 * governingEntry: the approved-models entry a registry row IS, by identity.
 *
 * It is the one test of "this model may be selected" (CLAUDE.md Rule 2) for a
 * caller's pin, the picker and the cost-tier default. It used to take the
 * served-model lookup's first hit (approvedEntryFor: the first entry for the
 * provider whose pinned version OR id is the wire model) and then check
 * identity on that hit alone. So the verdict depended on the order of
 * APPROVED_MODELS: a row that is exactly an entry was refused when an earlier
 * entry for its provider had an id, or a pinned version, equal to the row's
 * wire model (review objection 4). Nothing in today's list does that, and
 * nothing forbids it, so the cases below use synthetic entries through the
 * `entries` parameter and the real list for today's verdicts.
 */
import { describe, expect, it } from 'vitest';

import { APPROVED_MODELS, governingEntry, type ApprovedModel } from '../approved-models';
import { DEFAULT_MODELS } from '../../ai-gateway/gateway';

const SONNET = APPROVED_MODELS.find((e) => e.id === 'claude-sonnet-4')!;
/** The row that is SONNET: its id, provider and pinned version. */
const SONNET_ROW = { id: SONNET.id, provider: SONNET.provider, model: SONNET.pinnedVersion };

describe('governingEntry — found by identity, not by list order', () => {
  it('the governed data is what these cases assume', () => {
    expect(SONNET).toBeDefined();
    // The alias id and the pinned version differ, so an entry named after the
    // pinned version is a distinct, plausible future entry.
    expect(SONNET.id).not.toBe(SONNET.pinnedVersion);
  });

  it("finds a row's own entry when an earlier entry for its provider has an id equal to the row's wire model", () => {
    // A later model gets the id the alias currently pins, and is listed first.
    const renamed: ApprovedModel = { ...SONNET, id: SONNET.pinnedVersion, pinnedVersion: `${SONNET.pinnedVersion}-2027` };
    expect(governingEntry(SONNET_ROW, [renamed, SONNET])).toBe(SONNET);
    expect(governingEntry(SONNET_ROW, [SONNET, renamed])).toBe(SONNET);
    const renamedRow = { id: renamed.id, provider: renamed.provider, model: renamed.pinnedVersion };
    expect(governingEntry(renamedRow, [renamed, SONNET])).toBe(renamed);
  });

  it('finds a row\'s own entry when an earlier entry for its provider pins the same version', () => {
    const twin: ApprovedModel = { ...SONNET, id: `${SONNET.id}-twin` };
    expect(governingEntry(SONNET_ROW, [twin, SONNET])).toBe(SONNET);
    expect(governingEntry({ ...SONNET_ROW, id: twin.id }, [twin, SONNET])).toBe(twin);
  });

  it('still holds a row to identity: the entry\'s id, provider and pinned version', () => {
    expect(governingEntry(SONNET_ROW)).toBe(SONNET);
    expect(governingEntry({ ...SONNET_ROW, model: SONNET.id })).toBeUndefined(); // wire is the alias id
    expect(governingEntry({ ...SONNET_ROW, id: 'claude-sonnet-house' })).toBeUndefined(); // an id no entry carries
    expect(governingEntry({ ...SONNET_ROW, provider: 'bedrock' })).toBeUndefined(); // another placement
    expect(governingEntry({ ...SONNET_ROW, model: `${SONNET.pinnedVersion}-20990101` })).toBeUndefined(); // drifted
  });

  it("gives every row of today's registry its own entry, whatever the order of the list", () => {
    const reversed = [...APPROVED_MODELS].reverse();
    expect(DEFAULT_MODELS.length).toBeGreaterThan(0);
    for (const m of DEFAULT_MODELS) {
      expect(governingEntry(m)?.id, m.id).toBe(m.id);
      expect(governingEntry(m, reversed), m.id).toBe(governingEntry(m));
    }
  });
});
