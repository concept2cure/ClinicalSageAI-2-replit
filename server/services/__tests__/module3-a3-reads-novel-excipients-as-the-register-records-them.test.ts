/**
 * §3.2.A.3 reads a novel excipient as the excipient register records it, and
 * scans every excipient for human or animal origin, novel or not.
 *
 * What the code used to do (until 2026-10-15): the novel-excipient branch
 * selected excipients by `novel === true` and printed `function`,
 * `concentration` and `safetyStudies` — fields no mapper writes.
 * mapMaterialSpecPayload (the cmc_material_specs register, which the CMC
 * interview also commits to) writes `novelExcipient`, `functionInFormulation`
 * and `novelExcipientJustification`, so a novel excipient recorded in the
 * register never reached the branch. And when the branch was reached it
 * returned before the TSE/BSE scan, so a product with a novel excipient and a
 * bovine gelatin capsule shell said nothing about the gelatin's animal origin
 * or its missing certificate.
 */
import { describe, expect, it } from 'vitest';

import { mapMaterialSpecPayload } from '../cmc-write-through';
import { composeAppendices } from '../module3-extensions';

const src = (id: string, sourceType: string, sourcePayload: Record<string, unknown>) =>
  ({ id, sourceType, sourcePayload, sourceHash: 'h' }) as never;

const a3 = (sources: unknown[]) => composeAppendices(sources as never).find((s) => s.sectionKey === '3.2.A.3')!;

/** An excipient as the register maps it. */
const excipient = (over: Record<string, unknown> = {}) =>
  mapMaterialSpecPayload({
    materialRole: 'excipient',
    materialName: 'Polymer Z',
    functionInFormulation: 'Release-modifying polymer',
    supplier: 'Acme Polymers',
    origin: 'synthetic',
    status: 'specified',
    ...over,
  });

const novelTable = (section: ReturnType<typeof a3>) =>
  section.tables.find((t) => t.title.startsWith('Novel Excipients'));
const originTable = (section: ReturnType<typeof a3>) =>
  section.tables.find((t) => t.title.startsWith('Excipients of Human or Animal Origin'));

describe('§3.2.A.3 — a novel excipient recorded in the excipient register', () => {
  it('is reported as novel, with its recorded function and safety justification', () => {
    const section = a3([
      src('ex-1', 'excipient', excipient({
        novelExcipient: true,
        novelExcipientJustification: '13-week rat oral toxicity study, report TX-0042',
      })),
    ]);
    const table = novelTable(section);
    expect(table, 'a novel excipient recorded in the register did not reach the novel-excipient table').toBeDefined();
    expect(table!.rows).toEqual([
      ['Polymer Z', 'Release-modifying polymer', '13-week rat oral toxicity study, report TX-0042'],
    ]);
    expect(section.narrativeDraft).toContain('1 novel excipient(s)');
    expect(section.completeness).toBe(100);
  });

  it('with no recorded justification, its safety qualification is NOT ESTABLISHED', () => {
    const section = a3([src('ex-1', 'excipient', excipient({ novelExcipient: true }))]);
    expect(novelTable(section)?.rows[0][2], 'a register novel excipient with no justification was not reported').toBe(
      'not recorded',
    );
    expect(section.narrativeDraft).toMatch(/NOT ESTABLISHED/);
    expect(section.completeness).toBe(0);
  });

  it('an excipient the register does not flag novel is not listed as novel', () => {
    const section = a3([src('ex-1', 'excipient', excipient({ novelExcipient: false }))]);
    expect(novelTable(section)).toBeUndefined();
  });
});

describe('§3.2.A.3 — the TSE/BSE scan runs for every excipient, novel or not', () => {
  it("a bovine gelatin beside a novel excipient is declared, with its certificate's absence", () => {
    const section = a3([
      // `novel` is the key this branch used to read: carried here so the old
      // code reaches the early return it took before the scan.
      src('ex-1', 'excipient', { ...excipient({ novelExcipient: true, novelExcipientJustification: 'TX-0042' }), novel: true }),
      src('ex-2', 'excipient', excipient({
        materialName: 'Gelatin',
        functionInFormulation: 'Capsule shell',
        origin: 'bovine',
        tseCertificate: '',
      })),
    ]);
    const origin = originTable(section);
    expect(origin, "the novel-excipient branch returned before the gelatin's animal origin was scanned").toBeDefined();
    expect(JSON.stringify(origin!.rows)).toContain('Gelatin');
    expect(JSON.stringify(origin!.rows)).toContain('NOT RECORDED');
    expect(section.narrativeDraft).toContain('of human or animal origin have been identified');
    expect(novelTable(section)!.rows.map((r) => r[0])).toEqual(['Polymer Z']);
    expect(section.completeness).toBe(0);
  });

  it('is complete only when every novel excipient is justified and every origin is recorded and clear', () => {
    const section = a3([
      src('ex-1', 'excipient', excipient({ novelExcipient: true, novelExcipientJustification: 'TX-0042' })),
      src('ex-2', 'excipient', excipient({
        materialName: 'Microcrystalline cellulose',
        functionInFormulation: 'Diluent',
        origin: 'plant',
      })),
    ]);
    expect(section.narrativeDraft).toContain('No excipients of human or animal origin are used');
    expect(section.narrativeDraft).toContain('1 novel excipient(s)');
    expect(section.completeness).toBe(100);
    expect(section.missingInputs).toEqual([]);
  });

  it('a novel excipient whose origin is not recorded leaves the origin question open', () => {
    const section = a3([
      src('ex-1', 'excipient', excipient({ novelExcipient: true, novelExcipientJustification: 'TX-0042', origin: '' })),
    ]);
    expect(section.narrativeDraft).toMatch(/origin is NOT established/);
    expect(section.completeness).toBe(0);
  });
});
