/**
 * `cerv2_510k_sections` history — AnA must not be able to destroy prior text.
 *
 * WHAT WAS WRONG. That table has no version trigger, so preserving a section's
 * prior content is an application responsibility — and only one of its two
 * writers accepted it. The human PATCH route wrote a rich
 * `cerv2_section_versions` row; AnA's `write_kit_section` tool overwrote
 * `content` in place with no version row, no reason and no snapshot. AnA could
 * therefore destroy a section's earlier text with no recoverable history, on
 * the surface where that text becomes a 510(k).
 *
 * WHAT IS LOCKED HERE. `recordCerv2SectionVersion` is now the single way a
 * change to that table becomes history, and:
 *   • it captures the state BEFORE the change — the part that makes the row
 *     history rather than a duplicate of the current content;
 *   • it runs on the CALLER'S transaction, so content and history commit
 *     together or not at all;
 *   • version numbers append rather than restart;
 *   • it never invents a reason for a change nobody explained.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { recordCerv2SectionVersion } from '../section-version';

/** A fake transaction client that records the statements run on it. */
function fakeExec(maxVersion = 0) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/MAX\(version_number\)/i.test(sql)) {
      return { rows: [{ max_version: maxVersion }] };
    }
    return { rows: [] };
  });
  return { exec: { query }, calls };
}

/**
 * Read an INSERT parameter by COLUMN NAME rather than by position. Positional
 * assertions silently re-target when a column is added to the writer's list —
 * `params[9]` meant previous_values until `field_data` was inserted ahead of it,
 * after which the same index asserted a different column and the test's subject
 * changed without the test changing. Parse the column list instead.
 */
function insertedColumn(
  calls: Array<{ sql: string; params: unknown[] }>,
  column: string,
): unknown {
  const insert = calls.find(c => /INSERT INTO cerv2_section_versions/i.test(c.sql));
  if (!insert) throw new Error('no INSERT INTO cerv2_section_versions was run');
  const columns = insert.sql
    .slice(insert.sql.indexOf('(') + 1, insert.sql.indexOf(')'))
    .split(',')
    .map(c => c.trim());
  const i = columns.indexOf(column);
  if (i === -1) throw new Error(`writer does not insert a "${column}" column; it inserts: ${columns.join(', ')}`);
  return insert.params[i];
}

const BASE = {
  sectionId: 11,
  organizationId: 7,
  changeType: 'edited',
  changeSummary: 'Drafted by AnA (no summary supplied)',
  content: 'NEW body text',
  status: 'drafting',
  completionPercentage: 60,
  previousValues: { content: 'OLD body text', status: 'todo', completion_percentage: 10 },
};

beforeEach(() => vi.clearAllMocks());

describe('recordCerv2SectionVersion', () => {
  it('writes version 1 for a section with no history', async () => {
    const { exec, calls } = fakeExec(0);
    const v = await recordCerv2SectionVersion(exec, BASE);
    expect(v).toBe(1);
    expect(insertedColumn(calls, 'version_number')).toBe(1);
  });

  it('appends rather than restarting when history exists', async () => {
    const { exec } = fakeExec(4);
    await expect(recordCerv2SectionVersion(exec, BASE)).resolves.toBe(5);
  });

  it('REGRESSION: the prior content is what gets preserved', async () => {
    // The defect was that AnA's overwrite kept nothing. A version row holding
    // only the NEW content would be a copy, not history.
    const { exec, calls } = fakeExec(0);
    await recordCerv2SectionVersion(exec, BASE);
    const previous = JSON.parse(String(insertedColumn(calls, 'previous_values')));
    expect(previous.content).toBe('OLD body text');
    // And the new state is recorded alongside, so a diff is reconstructable.
    expect(insertedColumn(calls, 'content')).toBe('NEW body text');
  });

  it('records field_data when given it, and NULL — not "{}" — when not', async () => {
    // The column holds every field value as of this version. A writer that
    // dropped it left the dedicated column NULL while the values sat only in
    // the diff columns, so a reader could not tell an empty section from an
    // unrecorded one.
    const withData = fakeExec(0);
    await recordCerv2SectionVersion(withData.exec, { ...BASE, fieldData: { device_name: 'ACME X1' } });
    expect(JSON.parse(String(insertedColumn(withData.calls, 'field_data')))).toEqual({ device_name: 'ACME X1' });

    const without = fakeExec(0);
    await recordCerv2SectionVersion(without.exec, BASE);
    expect(insertedColumn(without.calls, 'field_data')).toBeNull();
  });

  it('scopes the version lookup to the section AND the organization', async () => {
    const { exec, calls } = fakeExec(0);
    await recordCerv2SectionVersion(exec, BASE);
    const max = calls.find(c => /MAX\(version_number\)/i.test(c.sql))!;
    expect(max.sql).toContain('organization_id');
    expect(max.params).toEqual([11, 7]);
  });

  it('runs every statement on the caller transaction, opening none of its own', async () => {
    const { exec, calls } = fakeExec(0);
    await recordCerv2SectionVersion(exec, BASE);
    // A BEGIN here would create a second transaction and defeat the atomicity
    // the caller is relying on.
    expect(calls.some(c => /^\s*BEGIN/i.test(c.sql))).toBe(false);
    expect(calls.some(c => /^\s*COMMIT/i.test(c.sql))).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('records the reason it was given, verbatim', async () => {
    const { exec, calls } = fakeExec(0);
    await recordCerv2SectionVersion(exec, {
      ...BASE,
      changeSummary: 'Reworked per FDA AI letter item 3',
    });
    expect(insertedColumn(calls, 'change_summary')).toBe('Reworked per FDA AI letter item 3');
  });

  it('SOURCE: the one kit-section writer records the version row beside the content, and the AnA tool runs it inside a transaction', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    /* The UPDATE, the FOR UPDATE read and the version row moved out of
       AnaToolExecutor into the ONE kit-section writer (kit-section-write.ts);
       the transaction stays with the caller. This assertion used to look for
       all four in AnaToolExecutor and went red the moment the writer was
       shared — it now checks each half where it lives. */
    const writer = fs.readFileSync(path.resolve(__dirname, '..', 'kit-section-write.ts'), 'utf8');
    const u = writer.indexOf('UPDATE cerv2_510k_sections');
    expect(u).toBeGreaterThan(-1);
    const wblock = writer.slice(Math.max(0, u - 3000), u + 3000);
    // Content and history must be on the same client, or one can land without
    // the other — which is the whole point of the fix.
    expect(wblock).toContain('recordCerv2SectionVersion');
    expect(wblock).toContain('FOR UPDATE');

    const ana = fs.readFileSync(path.resolve(__dirname, '..', '..', 'ana', 'AnaToolExecutor.ts'), 'utf8');
    const c = ana.indexOf('writeKitSectionTx(');
    expect(c).toBeGreaterThan(-1);
    const ablock = ana.slice(Math.max(0, c - 3000), c + 3000);
    expect(ablock).toContain("client.query('BEGIN')");
    expect(ablock).toContain("client.query('COMMIT')");
  });
});
