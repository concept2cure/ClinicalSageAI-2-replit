/**
 * required-sections — "marks no section mandatory" must be true when said.
 *
 * `requiredSectionsFromPack` groups a rule pack's mandatory sections by CTD
 * module via `moduleOfSectionKey`, which accepts only `^m?[1-5]\.` and drops
 * everything else. That is correct for grouping — but it means an EMPTY grouped
 * result has two quite different causes:
 *
 *   (a) the pack genuinely marks nothing mandatory, or
 *   (b) the pack marks sections mandatory under keys that are not CTD-numbered,
 *       and every one of them was dropped.
 *
 * The medtech / EU packs (PMA, CTA, MDR, IVDR) are not CTD-numbered, so they all
 * land in (b) — and the resolver reported (a): "Rule pack <x> marks no section
 * mandatory", a statement the pack's own required_sections refutes, rendered
 * verbatim to the filer.
 *
 * (The substituted baseline is STRICTER than the pack, so nothing ships on a
 * fabricated pass; the defect is the false statement about the pack, and a
 * filer being told to draft CTD sections their submission does not use.)
 */
import { describe, it, expect } from 'vitest';
import {
  requiredSectionsFromPack,
  countMandatorySections,
  moduleOfSectionKey,
  resolveRequiredSections,
} from '../required-sections';
import type { Queryable } from '../required-sections';

/** A client returning one rule-pack row, as the resolver's SELECT would. */
function fakeClient(rows: unknown[]): Queryable {
  return { query: async () => ({ rows }) } as Queryable;
}

/** A non-CTD-numbered pack, in the shape the medtech packs actually use. */
const MDR_STYLE = [
  { key: 'A', parent_key: null, mandatory: true },
  { key: 'A.1', parent_key: 'A', mandatory: true },
  { key: 'GSPR-1', parent_key: null, mandatory: true },
  { key: 'CER', parent_key: null, mandatory: false },
] as any[];

const CTD_STYLE = [
  { key: '1.1', parent_key: null, mandatory: true },
  { key: '3.2.S.1', parent_key: null, mandatory: true },
] as any[];

describe('countMandatorySections vs. CTD grouping', () => {
  it('a non-CTD pack DOES mark sections mandatory even though grouping yields none', () => {
    expect(countMandatorySections(MDR_STYLE)).toBe(3);
    // ...and every one is dropped by the CTD grouper.
    expect(requiredSectionsFromPack(MDR_STYLE).every((m) => m.requiredSections.length === 0)).toBe(true);
    // which is exactly the ambiguity the count exists to resolve.
    expect(moduleOfSectionKey('GSPR-1')).toBeNull();
  });

  it('a pack that truly marks nothing mandatory counts zero', () => {
    expect(countMandatorySections([{ key: '1.1', parent_key: null, mandatory: false } as any])).toBe(0);
  });

  it('a CTD-numbered pack still groups normally', () => {
    const mods = requiredSectionsFromPack(CTD_STYLE);
    expect(mods.find((m) => m.code === 'm1')?.requiredSections).toContain('1.1');
    expect(mods.find((m) => m.code === 'm3')?.requiredSections).toContain('3.2.S.1');
    expect(countMandatorySections(CTD_STYLE)).toBe(2);
  });
});

describe('resolveRequiredSections — the reason string must match the pack', () => {
  it('does NOT claim a non-CTD pack "marks no section mandatory"', async () => {
    const set = await resolveRequiredSections(
      fakeClient([{ doc_type: 'ind', agency: 'fda', version: '9.9.9', required_sections: MDR_STYLE }]),
      { programType: 'ind', primaryAgency: 'FDA' },
    );
    const reason = String((set.provenance as any).reason ?? (set as any).reason ?? JSON.stringify(set.provenance));
    // The pre-fix sentence, which the pack's own required_sections refutes.
    expect(reason).not.toMatch(/marks no section mandatory/i);
    // It must instead say the requirements exist but could not be mapped.
    expect(reason).toMatch(/3 section\(s\) mandatory/i);
    expect(reason).toMatch(/could not be mapped/i);
    expect(reason).toMatch(/NOT reflected/i);
  });

  it('still says "marks no section mandatory" when that is actually true', async () => {
    const set = await resolveRequiredSections(
      fakeClient([
        { doc_type: 'ind', agency: 'fda', version: '9.9.9', required_sections: [{ key: '1.1', mandatory: false }] },
      ]),
      { programType: 'ind', primaryAgency: 'FDA' },
    );
    const reason = String((set.provenance as any).reason ?? (set as any).reason ?? JSON.stringify(set.provenance));
    expect(reason).toMatch(/marks no section mandatory/i);
  });
});
