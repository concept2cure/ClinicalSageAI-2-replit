/**
 * The review corrections of 2026-10-18 reach the US filings they correct, and
 * no other filing (review critic, 2026-10-18).
 *
 * The FD&C Act 506 designation nodes and the 21 CFR 316.20(b) orphan nodes were
 * first written into blueprint arrays that EU PRIME, EU accelerated assessment,
 * Sakigake, UK ILAP, the Breakthrough Device request, Priority Review and the EU
 * orphan request also read. PRIME's own criterion (unmet medical need) became
 * optional and cited a US statute, and an EU orphan request was told to answer
 * 316.20. The US requests now have their own arrays; the shared ones are what
 * they were.
 */
import { describe, expect, it } from 'vitest';
import { getRegistryDocumentTemplate, type TemplateSection } from '../../server/services/market-specs/document-template-library';

const every = (s: TemplateSection[]): TemplateSection[] => s.flatMap((x) => [x, ...every(x.subsections ?? [])]);
const outline = async (id: string) => {
  const t = await getRegistryDocumentTemplate(id);
  if (!t) throw new Error(`${id} has no outline`);
  return every([...(t.frontMatter ?? []), ...t.sections]);
};

describe('the designation and orphan corrections stay with the US requests', () => {
  it.each(['EU_PRIME', 'EU_ACCEL_ASSESS', 'JP_SAKIGAKE', 'UK_ILAP', 'US_BREAKTHROUGH_DEVICE', 'US_PRIORITY_REVIEW'])(
    '%s keeps its jurisdiction-neutral outline: unmet need required, no FD&C Act 506 node',
    async (id) => {
      const s = await outline(id);
      expect(s.find((x) => x.number === '4')).toMatchObject({ heading: 'Unmet Medical Need Analysis', required: true });
      expect(s.map((x) => x.number)).toEqual(['1', '2', '3', '4', '5', '6']);
      expect(JSON.stringify(s)).not.toMatch(/FD&C Act 506/);
    },
  );

  it.each(['US_BTD', 'US_FAST_TRACK', 'US_RMAT'])('%s carries one node per FD&C Act 506 criterion', async (id) => {
    const s = await outline(id);
    expect(s.map((x) => x.number)).toEqual(['1', '2', '3', '4', '5', '7', '8', '6']);
    expect(s.find((x) => x.number === '7')?.heading).toMatch(/Substantial Improvement .*\(Breakthrough\)/);
    expect(s.find((x) => x.number === '4')?.required).toBe(false);
  });

  it('the EU orphan request carries no 21 CFR 316.20 node; the US request does', async () => {
    const eu = await outline('EU_ORPHAN');
    expect(eu.map((x) => x.number)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(JSON.stringify(eu)).not.toMatch(/316\.20/);
    const us = await outline('US_ORPHAN');
    expect(us.find((x) => x.number === '5')?.required).toBe(true);
    expect(us.map((x) => x.number)).toEqual(['1', '2', '3', '4', '5', '7', '8', '6']);
  });
});
