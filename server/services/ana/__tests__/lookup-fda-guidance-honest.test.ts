/**
 * lookup_fda_guidance names no FDA guidance it cannot stand behind.
 *
 * It answered from a three-entry map: "510(k)", "biocompatibility" and
 * "software", each with a docket number nothing verified, requirements typed
 * from memory ("Software level of concern determination", which the 2023
 * device-software guidance replaced) and a stale "21 CFR 820.30(g)". Any other
 * topic with regulation_type '21cfr' got a fixed list of CFR parts. It now
 * returns the dated facts the verified currency registry holds for the topic,
 * and says plainly that no FDA guidance index is connected.
 */
import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const run = async (input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler('lookup_fda_guidance')!(input, { organizationId: 1 } as any));

describe('lookup_fda_guidance', () => {
  it.each(['510(k)', 'biocompatibility', 'software'])(
    'answers "%s" with no invented docket number, title or requirement',
    async (topic) => {
      const out = await run({ topic });
      const text = JSON.stringify(out);
      expect(text).not.toMatch(/FDA-20\d\d-D-\d+/);
      expect(text).not.toMatch(/level of concern|820\.30\(g\)|keyRequirements/i);
      expect(text).not.toMatch(/FDA Guidance Database/);
      expect(out.guidanceIndex).toBe('not_connected');
    },
  );

  it('returns the dated registry fact for a topic the registry holds, with its source', async () => {
    const out = await run({ topic: '510(k)' });
    expect(out.status).toBe('registry_facts');
    const estar = out.facts.find((f: { id: string }) => f.id === 'fda-estar-510k-mandatory');
    expect(estar).toMatchObject({ status: 'in_force', effectiveDate: '2023-10-01' });
    expect(estar.sourceUrl).toMatch(/^https:\/\/www\.fda\.gov\//);
    expect(typeof estar.verificationStale).toBe('boolean');
  });

  it('says nothing is indexed for a topic the registry does not hold', async () => {
    const out = await run({ topic: 'biocompatibility', regulation_type: '21cfr' });
    expect(out.status).toBe('not_indexed');
    expect(out.facts).toEqual([]);
    expect(out).not.toHaveProperty('relatedRegulations');
  });

  it('asks for a topic instead of throwing', async () => {
    const out = await run({});
    expect(out.error).toMatch(/topic/);
  });

  it('does not promise document numbers or requirements in its definition', () => {
    const def = ALL_ANA_TOOLS.find((t) => t.name === 'lookup_fda_guidance');
    expect(def).toBeDefined();
    expect(def!.description).not.toMatch(/document number|key requirements|citation-ready/i);
    expect(def!.description).toMatch(/no FDA guidance index/i);
  });
});
