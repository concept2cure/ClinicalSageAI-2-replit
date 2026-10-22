/**
 * A demonstration names the tenant's own records, or says there are none —
 * never a seeded one. 2026-10-15.
 *
 * The Live Drive talking points named the launch-demo pack's programs —
 * "[Demo · Biotech] C2C-101", an anti-IL-23 antibody IND, and
 * "[Demo · MDX] NeuroPanel-Dx", an IVD 510(k) — and start_product_demo hands
 * those talking points to AnA on every tenant. A real tenant has neither, so
 * the demonstration described programs the customer does not have.
 *
 * The seeded names are read from the packs themselves (the program-name
 * constants and DEMO_PREFIX), so a renamed pack is still caught.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEMO_SCRIPTS } from '../demo-scripts';

const LAUNCH_DEMO = path.resolve(__dirname, '../../../scripts/demo/launch-demo');

/** Every name a launch-demo pack gives its records: each prefix, each program and its code. */
function seededNames(): string[] {
  const names = new Set<string>();
  const lib = readFileSync(path.join(LAUNCH_DEMO, 'lib.mjs'), 'utf8');
  const prefixes = /DEMO_PREFIX\s*=\s*\{([^}]*)\}/.exec(lib)?.[1] ?? '';
  for (const m of prefixes.matchAll(/'([^']+)'/g)) names.add(m[1]);
  for (const f of readdirSync(path.join(LAUNCH_DEMO, 'packs'))) {
    const src = readFileSync(path.join(LAUNCH_DEMO, 'packs', f), 'utf8');
    for (const m of src.matchAll(/PROGRAM_NAME\s*=\s*'([^']+)'/g)) {
      names.add(m[1]);
      names.add(m[1].split(' ')[0]); // the program code alone: "C2C-101", "NeuroPanel-Dx"
    }
  }
  return [...names];
}

describe('demonstration talking points', () => {
  const seeded = seededNames();

  it('the seeded names were found (the check below is not vacuous)', () => {
    expect(seeded).toEqual(expect.arrayContaining(['[Demo · Biotech]', '[Demo · MDX]', 'C2C-101', 'NeuroPanel-Dx']));
  });

  it('no script names a record a launch-demo pack seeds', () => {
    const named: string[] = [];
    for (const s of DEMO_SCRIPTS) {
      const texts = [s.title, s.description, s.audience, ...s.steps.map((st) => st.say)];
      texts.forEach((t, i) => {
        for (const n of seeded) if (t.includes(n)) named.push(`${s.id} text ${i}: "${n}"`);
        if (/demo workspace/i.test(t)) named.push(`${s.id} text ${i}: "demo workspace"`);
      });
    }
    expect(named, named.join('\n')).toEqual([]);
  });

  it('a stop that describes the portfolio says what to do when it holds no program', () => {
    for (const id of ['training-orientation', 'sales-flagship']) {
      const script = DEMO_SCRIPTS.find((s) => s.id === id)!;
      const portfolio = script.steps.find((st) => st.navigate?.target === 'projects')!;
      expect(portfolio.say, `${id}: ${portfolio.say}`).toMatch(/empty/i);
    }
  });
});
