/**
 * Vault coverage: what the Vault holds against what the program's rule pack
 * requires (VR-15, row D2).
 *
 * Nothing showed it. The count comes from the one resolver every gate uses
 * (resolveRequiredSections), names where the list came from, counts only a
 * CONFIRMED filing (a suggestion is the classifier's guess, and unfiled is
 * nothing), and is never a percentage or a readiness figure.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { coverageOf, readVaultCoverage } from '../vault-coverage';
import type { Queryable, RequiredSectionSet } from '../../ectd/required-sections';

const packSet = (sections: Record<string, string[]>): RequiredSectionSet => ({
  modules: (['m1', 'm2', 'm3', 'm4', 'm5'] as const).map((code) => ({ code, name: code.toUpperCase(), requiredSections: sections[code] ?? [] })),
  provenance: { source: 'rule_pack', docType: 'ind', agency: 'FDA', packVersion: '2.1' },
});

describe('coverageOf (pure)', () => {
  it('counts a confirmed filing and nothing else: a suggestion is not coverage', () => {
    const set = packSet({ m2: ['2.5'], m3: ['3.2.P.8'], m5: ['5.3.5.3'] });
    const c = coverageOf(set, [
      { ctdSection: '3.2.p.8', placementStatus: 'confirmed' },
      { ctdSection: '2.5', placementStatus: 'suggested' },
    ]);
    expect(c.covered).toBe(1);
    expect(c.required).toBe(3);
    expect(c.modules.flatMap((m) => m.covered)).toEqual(['3.2.P.8']);
    expect(c.modules.flatMap((m) => m.missing)).toEqual(['2.5', '5.3.5.3']);
  });

  it('a document filed deeper covers the section above it, never the reverse', () => {
    const set = packSet({ m3: ['3.2.S'], m5: ['5.3.5.1'] });
    const c = coverageOf(set, [
      { ctdSection: '3.2.S.4.2', placementStatus: 'confirmed' },
      { ctdSection: '5.3.5', placementStatus: 'confirmed' },
    ]);
    expect(c.modules.flatMap((m) => m.covered)).toEqual(['3.2.S']);
    expect(c.modules.flatMap((m) => m.missing)).toEqual(['5.3.5.1']);
  });

  it('carries no percentage', () => {
    const c = coverageOf(packSet({ m1: ['1.1'] }), []);
    expect(JSON.stringify(c)).not.toMatch(/percent|pct|%/i);
  });
});

/** A client whose rule-pack reads answer `packs` and whose filing read answers `filings`. */
function client(opts: { packs?: () => unknown[]; filings?: () => unknown[] }): Queryable {
  return {
    async query<T>(sql: string) {
      if (/c2c_rule_packs/.test(sql)) return { rows: (opts.packs ?? (() => []))() as T[] };
      if (/vault\.documents/.test(sql)) return { rows: (opts.filings ?? (() => []))() as T[] };
      return { rows: [] as T[] };
    },
  };
}
const INPUT = { view: 'pharma' as const, programType: 'ind', primaryAgency: 'FDA', programId: 'p', organizationId: 7 };

describe('readVaultCoverage', () => {
  it('a program with no program type reports the fallback with its reason, never as its own list', async () => {
    const c = await readVaultCoverage(client({}), { ...INPUT, programType: null });
    expect(c.state).toBe('available');
    if (c.state !== 'available') return;
    expect(c.provenance.source).toBe('fallback');
    expect(c.provenance.reason).toMatch(/filing type is unknown/);
  });

  it('a rule-pack store that cannot be read is unavailable with the reason, never "0 of m"', async () => {
    const c = await readVaultCoverage(
      client({ packs: () => { throw new Error('connection terminated'); } }),
      INPUT,
    );
    expect(c).toMatchObject({ state: 'unavailable' });
    if (c.state === 'unavailable') expect(c.reason).toMatch(/connection terminated/);
  });

  it("filings that cannot be read are unavailable too, not zero", async () => {
    const c = await readVaultCoverage(
      client({ packs: () => [{ version: '2.1', required_sections: [{ key: '1.1', mandatory: true }] }], filings: () => { throw new Error('timeout'); } }),
      INPUT,
    );
    expect(c).toMatchObject({ state: 'unavailable' });
  });

  // Added 2026-10-18: a CSR's E3 §5.1 or a protocol's M11 §5.2 is not CTD 5.1.
  it("a filing document class is not a CTD dossier: it says so, and counts nothing", async () => {
    for (const programType of ['csr', 'pas', 'briefing']) {
      const c = await readVaultCoverage(client({}), { ...INPUT, programType });
      expect(c.state, programType).toBe('not_applicable');
      if (c.state === 'not_applicable') expect(c.reason, programType).toMatch(/not a CTD dossier/);
      expect(JSON.stringify(c), programType).not.toMatch(/"required"|"covered"/);
    }
  });

  it("a view that is not CTD-numbered shows why, and no figure", async () => {
    for (const view of ['device', 'ivd', 'service'] as const) {
      const c = await readVaultCoverage(client({}), { ...INPUT, view });
      expect(c.state, view).toBe('not_applicable');
      expect(JSON.stringify(c), view).not.toMatch(/"required"|"covered"/);
    }
  });

  it.each(['hde', 'mdl', 'ivd_licence', 'shonin', 'ninsho', 'todokede', 'ivd_approval', 'jp_cdx'])('%s counts no medicinal CTD requirement even in a pharma view', async programType => {
    const query = vi.fn(async () => ({ rows: [] }));
    const result = await readVaultCoverage({ query } as never, { ...INPUT, programType });
    expect(result).toMatchObject({ state: 'not_applicable', reason: expect.stringMatching(/not a CTD dossier/) });
    expect(query).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/"required"|"covered"/);
  });

  it('counts from the live pack when one applies, and names it', async () => {
    const c = await readVaultCoverage(
      client({
        packs: () => [{ version: '2.1', required_sections: [{ key: '1.1', mandatory: true }, { key: '2.5', mandatory: true }] }],
        filings: () => [{ ctd_section: '1.1', placement_status: 'confirmed' }],
      }),
      INPUT,
    );
    expect(c).toMatchObject({ state: 'available', required: 2, covered: 1, provenance: { source: 'rule_pack', packVersion: '2.1' } });
  });
});

describe('Vault coverage feeds no readiness figure', () => {
  it('is imported by the Vault read model only', () => {
    const root = path.resolve(__dirname, '../../../..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (e === 'node_modules' || e === '__tests__' || e.startsWith('.')) continue;
        const p = path.join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e) && /vault-coverage/.test(readFileSync(p, 'utf8'))) hits.push(path.relative(root, p));
      }
    };
    walk(path.join(root, 'server'));
    expect(hits.sort()).toEqual(['server/routes/c2c/project-vault.ts', 'server/services/vault/vault-coverage.ts']);
  });
});
