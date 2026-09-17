/**
 * Figures the MDX kit presents as measured must actually be measured.
 *
 * Two defects of one shape, both found by auditing every export of the 19
 * modules under mdx/data for fabricated content:
 *
 *   vaultKpisForFiles()  Three of its four KPIs are derived from the file list
 *                        it is handed. The fourth asserted `metric: '3'` — a
 *                        literal — under the meta line "Approaching 15-year
 *                        minimum · audit before purge". It sat between three
 *                        real figures, in the same card row, indistinguishable
 *                        from them, and no retention date exists anywhere on
 *                        VaultFile to derive it from. A real tenant with real
 *                        artifacts was told to audit three of them before purge.
 *
 *   PMA_PHASES           Carried a hand-written position (100/100/100/85/61/40/
 *                        25/0/0/0, 'Module assembly' blocked) alongside the ten
 *                        canonical phase labels. PmaSurface's derivePhases
 *                        overwrites pct and status for every row from the active
 *                        program, so those numbers were reachable through one
 *                        path only — no program selected — where the grid drew
 *                        an invented programme's progress for a user who had
 *                        chosen nothing.
 *
 * The first test is a property rather than an assertion about the literal 3:
 * hand two genuinely different file sets to the KPI builder and every numeric
 * figure must differ. A figure that does not move when its inputs move is not
 * being computed from them, whatever it is called. That catches the next
 * hardcoded KPI as well as this one.
 */
import { describe, expect, it } from 'vitest';
import { vaultKpisForFiles, type VaultFile } from '../data/vault';
import { PMA_PHASES } from '../data/pma';

const file = (over: Partial<VaultFile>): VaultFile => ({
  id: 'f', name: 'n', kind: 'k', type: 'pdf', size: '1.0', prog: 'p', folder: 'root',
  ver: 'v1', versions: 1, status: 'draft', updated: 'now', author: 'a', linked: 0,
  esig: false, hash: 'h', ...over,
} as VaultFile);

/* Two sets chosen so that count, sealed count and total size all differ. */
const SMALL: VaultFile[] = [
  file({ id: 'a', status: 'final',  size: '2.0', esig: true }),
  file({ id: 'b', status: 'review', size: '1.0' }),
];
const LARGE: VaultFile[] = [
  file({ id: 'a', status: 'final',  size: '4.0', esig: true }),
  file({ id: 'b', status: 'locked', size: '3.0', esig: true }),
  file({ id: 'c', status: 'locked', size: '2.5' }),
  file({ id: 'd', status: 'review', size: '1.5' }),
];

const numeric = (m: string) => /^\d+(\.\d+)?$/.test(m);

describe('vault KPIs are computed from the artifacts, not asserted', () => {
  it('moves every numeric figure when the artifacts change', () => {
    const small = vaultKpisForFiles(SMALL);
    const large = vaultKpisForFiles(LARGE);
    expect(small).toHaveLength(large.length);

    const stuck: string[] = [];
    small.forEach((s, i) => {
      const l = large[i];
      expect(l.label).toBe(s.label);
      if (numeric(s.metric) && numeric(l.metric) && s.metric === l.metric) stuck.push(s.label);
    });
    // A numeric figure identical across two different vaults is a literal.
    expect(stuck).toEqual([]);
  });

  it('says a figure it cannot derive is unknown, rather than naming one', () => {
    const kpis = vaultKpisForFiles(LARGE);
    const retention = kpis.find((k) => /retention/i.test(k.label));
    expect(retention).toBeTruthy();
    // VaultFile carries no record date and no retention clock, so there is
    // nothing to count. An em dash is this codebase's mark for unknown, as
    // against 0 for genuinely zero.
    expect(numeric(retention!.metric)).toBe(false);
    expect(retention!.metric).toBe('—');
    // And it must not instruct the reader to act on a count it does not have.
    expect(retention!.meta).not.toMatch(/before purge/i);
  });

  it('still derives the figures it genuinely can', () => {
    const kpis = vaultKpisForFiles(LARGE);
    expect(kpis.find((k) => /artifacts/i.test(k.label))!.metric).toBe('4');
    expect(kpis.find((k) => /locked/i.test(k.label))!.metric).toBe('3');
    expect(kpis.find((k) => /vault size/i.test(k.label))!.metric).toBe('11.0');
  });
});

describe('the PMA phase list is a taxonomy, not a programme', () => {
  it('names the ten phases', () => {
    expect(PMA_PHASES).toHaveLength(10);
    expect(PMA_PHASES.map((p) => p.id)).toContain('pivotal');
    expect(PMA_PHASES.every((p) => p.label.length > 0)).toBe(true);
  });

  it('carries no position — that comes from the active program', () => {
    // Reachable verbatim whenever no program is selected.
    expect(PMA_PHASES.every((p) => p.pct === 0)).toBe(true);
    expect(PMA_PHASES.every((p) => p.status === 'idle')).toBe(true);
  });
});

/**
 * The same defect one layer up, found by an adversarial verifier checking a
 * different finding on this surface.
 *
 * PmaSurface's header read, with no PMA program in the tenant's list:
 *
 *   PMA pathway · CV-330 Implantable Monitor
 *   Phase 1 of 10 — Pre-submission · PMA filing Q3 2026
 *
 * An invented device, an invented filing date, and a phase claimed as current —
 * written as inline JSX literals rather than imported from a data module, so no
 * fixture audit and no import-based gate could see them. The phase claim was the
 * quietest: `Math.max(activeIdx, 0)` turns "no active phase" (-1) into "phase 1"
 * and prints it beside ten bars all reading 0%.
 *
 * Asserted against the source because rendering this surface pulls in the eSTAR
 * export chain, the pathway panes and the official filing panel, none of which
 * this is about. What matters is that the literals are not there to render.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('the PMA surface names nothing the program did not supply', () => {
  const src = readFileSync(
    path.join(process.cwd(), 'client/src/concept2cure/mdx/surfaces/PmaSurface.tsx'),
    'utf8',
  );
  /* Comments quote the removed literals on purpose, to record what shipped. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

  it('carries no invented device name or filing date', () => {
    expect(code).not.toMatch(/CV-330/);
    expect(code).not.toMatch(/PMA filing Q[1-4]\s*20\d\d/);
  });

  it('does not claim a current phase when no program is selected', () => {
    // The phase line must be reached only on the program branch.
    expect(code).toMatch(/program\s*\n?\s*\?\s*`Phase \$\{/);
  });
});
