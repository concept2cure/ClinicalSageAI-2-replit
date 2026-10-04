/**
 * check_regulatory_compliance states which topics a section mentions — never
 * that it is compliant.
 *
 * It returned overallStatus 'compliant' when every keyword it looked for
 * appeared ("device", "predicate", "gspr"), each paired with a CFR paragraph as
 * though the cited requirement had been met. And for ich_e6, ich_e8, ich_e9 and
 * 21cfr_part11 — four of the seven frameworks in its own enum — it ran no
 * checks, and `[].every(...)` is true, so any text at all was "compliant".
 */
import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';

const run = async (input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler('check_regulatory_compliance')!(input, { organizationId: 'org_1' } as any));

describe('check_regulatory_compliance', () => {
  it('never returns a compliance verdict, even when every topic is mentioned', async () => {
    const out = await run({
      regulatory_framework: 'fda_510k',
      section_content: 'Device description. Intended use. Predicate and substantial equivalence.',
    });
    expect(out.overallStatus).toBe('keyword_scan_only');
    expect(JSON.stringify(out)).not.toMatch(/"compliant"/);
    expect(out.notMentionedCount).toBe(0);
  });

  it.each(['ich_e6', 'ich_e8', 'ich_e9', '21cfr_part11', 'fda_pma'])(
    'reports %s as not assessed — it has no scan, so it says nothing about compliance',
    async (framework) => {
      const out = await run({ regulatory_framework: framework, section_content: 'anything at all' });
      expect(out.overallStatus).toBe('not_assessed');
      expect(out.topics).toEqual([]);
    },
  );

  it('reports an unmentioned topic as not mentioned, not as a met requirement', async () => {
    const out = await run({ regulatory_framework: 'eu_mdr', section_content: 'Clinical evaluation summary.' });
    const gspr = out.topics.find((t: { topic: string }) => t.topic === 'GSPR mapping');
    expect(gspr.mentioned).toBe(false);
    expect(out.notMentionedCount).toBe(1);
  });
});
