/**
 * Required sections come from the program's rule pack — one set for every gate.
 *
 * The first block pins the pure derivation. The second shows the gate reading
 * the live seeded ind:fda pack: an IND is asked for its plan, brochure and
 * environmental analysis, and NOT for a debarment certification, a clinical
 * summary or a tabular listing — the requirements the old hard-coded table
 * imposed on every application.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  FALLBACK_REQUIRED_MODULES,
  moduleOfSectionKey,
  requiredSectionsFromPack,
  resolveRequiredSections,
  type PackSection,
  type Queryable,
} from '../required-sections';

const ROOT = path.resolve(__dirname, '../../../..');

/** The live ind:fda pack as the migration seeds it (dollar-quoted JSON). */
function seededIndFdaPack(): { version: string; sections: PackSection[] } {
  const sql = fs.readFileSync(path.join(ROOT, 'migrations/20260902_ind_fda_outline_v2_2_initial_ind_flags.sql'), 'utf8');
  const m = /\(\s*'ind'\s*,\s*'fda'\s*,\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*\$(\w+)\$(\[[\s\S]*?\])\$\2\$::jsonb/.exec(sql);
  if (!m) throw new Error('ind:fda pack not found in the migration');
  return { version: m[1], sections: JSON.parse(m[3]) as PackSection[] };
}

function fakeClient(packs: Array<{ doc_type: string; agency: string; version: string; required_sections: unknown }>): Queryable & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async query(_text: string, params?: unknown[]) {
      calls.push(params ?? []);
      const [docType, agency] = params ?? [];
      const hit = packs.find((p) => p.doc_type === docType && p.agency === agency);
      return { rows: hit ? [{ version: hit.version, required_sections: hit.required_sections }] : [] } as never;
    },
  };
}

describe('requiredSectionsFromPack — leaf-most mandatory claims by module', () => {
  it('requires a mandatory node only when no descendant is mandatory', () => {
    const modules = requiredSectionsFromPack([
      { key: 'M3', parent_key: null, mandatory: true },
      { key: '3.2.S', parent_key: 'M3', mandatory: true },
      { key: '3.2.S.1', parent_key: '3.2.S', mandatory: true },
      { key: '3.2.S.2', parent_key: '3.2.S', mandatory: false },
      { key: '3.2.P', parent_key: 'M3', mandatory: true },
      { key: '3.2.P.1', parent_key: '3.2.P', mandatory: false },
    ]);
    const m3 = modules.find((m) => m.code === 'm3')!;
    expect(m3.requiredSections).toEqual(['3.2.P', '3.2.S.1']);
  });

  it('never requires a module container or an optional node', () => {
    const modules = requiredSectionsFromPack([
      { key: 'M1', parent_key: null, mandatory: true },
      { key: '1.2', parent_key: 'M1', mandatory: false },
    ]);
    expect(modules.every((m) => m.requiredSections.length === 0)).toBe(true);
  });

  it('groups by CTD module and always returns the five modules in order', () => {
    const modules = requiredSectionsFromPack([
      { key: '5.3.5.1', mandatory: true },
      { key: '1.2', mandatory: true },
      { key: '2.5', mandatory: true },
    ]);
    expect(modules.map((m) => m.code)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(modules[0].requiredSections).toEqual(['1.2']);
    expect(modules[4].requiredSections).toEqual(['5.3.5.1']);
    expect(moduleOfSectionKey('M1')).toBeNull();
    expect(moduleOfSectionKey('m3.2.S')).toBe('m3');
  });
});

describe('resolveRequiredSections — the seeded ind:fda pack decides what an IND must file', () => {
  const pack = seededIndFdaPack();

  it('reads the live pack for an FDA IND and reports its provenance', async () => {
    const client = fakeClient([{ doc_type: 'ind', agency: 'fda', version: pack.version, required_sections: pack.sections }]);
    const set = await resolveRequiredSections(client, { programType: 'ind', primaryAgency: 'FDA' });
    expect(set.provenance).toEqual({ source: 'rule_pack', docType: 'ind', agency: 'fda', packVersion: pack.version });
    const m1 = set.modules.find((m) => m.code === 'm1')!.requiredSections;
    // 21 CFR 312.23(a): forms, cover letter, plan, brochure, environmental analysis.
    expect(m1).toEqual(expect.arrayContaining(['1.1.1', '1.2', '1.20', '1.14.4.1', '1.12.14']));
    // What the old table demanded of an IND and FDA does not.
    const all = set.modules.flatMap((m) => m.requiredSections);
    expect(all).not.toContain('1.3.1');
    expect(all).not.toContain('1.3.3');
    expect(all).not.toContain('1.3.4');
    expect(all).not.toContain('2.7.1');
    expect(all).not.toContain('5.2');
    expect(all).not.toContain('3.2.R');
  });

  it('falls through the ICH pack when the agency has none, and says which pack it used', async () => {
    const client = fakeClient([{ doc_type: 'ind', agency: 'ich', version: pack.version, required_sections: pack.sections }]);
    const set = await resolveRequiredSections(client, { programType: 'ind', primaryAgency: 'PMDA' });
    expect(set.provenance.source).toBe('rule_pack');
    expect(set.provenance.agency).toBe('ich');
    expect(client.calls.map((c) => c[1])).toEqual(['pmda', 'ich']);
  });

  it('labels the baseline as a fallback, with the reason, when the program type is unknown', async () => {
    const client = fakeClient([]);
    const set = await resolveRequiredSections(client, { programType: null, primaryAgency: null });
    expect(set.provenance.source).toBe('fallback');
    expect(set.provenance.reason).toMatch(/program type is unknown/);
    expect(client.calls).toEqual([]);
    expect(set.modules).toEqual(FALLBACK_REQUIRED_MODULES);
  });

  it('labels the baseline as a fallback when no live pack exists or the store cannot be read', async () => {
    const none = await resolveRequiredSections(fakeClient([]), { programType: 'ind', primaryAgency: 'FDA' });
    expect(none.provenance.source).toBe('fallback');
    expect(none.provenance.reason).toMatch(/No live rule pack exists for ind at fda or ich/);

    const broken: Queryable = { query: async () => { throw new Error('relation "c2c_rule_packs" does not exist'); } };
    const unreadable = await resolveRequiredSections(broken, { programType: 'ind', primaryAgency: 'FDA' });
    expect(unreadable.provenance.source).toBe('fallback');
    expect(unreadable.provenance.reason).toMatch(/could not be read/);
  });

  it('the baseline Module 1 carries only what every FDA application files', () => {
    expect(FALLBACK_REQUIRED_MODULES.find((m) => m.code === 'm1')!.requiredSections).toEqual(['1.1', '1.2']);
  });
});
