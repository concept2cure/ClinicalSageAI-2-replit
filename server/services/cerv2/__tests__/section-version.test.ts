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
    const insert = calls.find(c => /INSERT INTO cerv2_section_versions/i.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert!.params[2]).toBe(1);
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
    const insert = calls.find(c => /INSERT INTO cerv2_section_versions/i.test(c.sql))!;
    const previous = JSON.parse(String(insert.params[9]));
    expect(previous.content).toBe('OLD body text');
    // And the new state is recorded alongside, so a diff is reconstructable.
    expect(insert.params[5]).toBe('NEW body text');
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
    const insert = calls.find(c => /INSERT INTO cerv2_section_versions/i.test(c.sql))!;
    expect(insert.params[4]).toBe('Reworked per FDA AI letter item 3');
  });

  it('SOURCE: the AnA tool writes its version row inside a transaction', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'ana', 'AnaToolExecutor.ts'),
      'utf8',
    );
    const i = src.indexOf('UPDATE cerv2_510k_sections');
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(Math.max(0, i - 3000), i + 3000);
    // Content and history must be on the same client, or one can land without
    // the other — which is the whole point of the fix.
    expect(block).toContain('recordCerv2SectionVersion');
    expect(block).toContain("client.query('BEGIN')");
    expect(block).toContain("client.query('COMMIT')");
    expect(block).toContain('FOR UPDATE');
  });
});
