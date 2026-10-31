/**
 * ci:one-product — CLAUDE.md RULE 4, enforced (2026-10-31).
 *
 * The founder: "We don't have apps. We don't have cards. We have one product. One canvas, one document
 * editor for every document type and every client type." That was decided on 2026-10-08
 * (docs/design/ONE_ANA_ONE_CANVAS.md) and written as principles, and screens kept being added beside it,
 * because a design record refuses nothing. This gate refuses.
 *
 * It holds two lists to a baseline that only shrinks (scripts/ci/one-product-baseline.json):
 *   - every surface in the registry (shared/constants/ui-surface-registry.ts UI_SURFACES);
 *   - every rail entry (client/src/concept2cure/v2/registryModel.ts RAIL_CORE).
 * A surface or rail entry not in the baseline fails the push. A capability a document type needs goes
 * into the one editor or the project's document start, which adds neither. Removing a surface or entry
 * is always allowed; --write records the removal (it never records an addition).
 *
 * The one door for an addition is `founderDecisions` in the baseline: the id, and the founder's recorded
 * decision (a P-number or a dated quote, at least 20 characters). A session cannot grant itself one.
 *
 * Usage:  npx tsx scripts/ci/check-one-product.ts [--write | --selftest]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UI_SURFACES } from '../../shared/constants/ui-surface-registry';
import { RAIL_CORE } from '../../client/src/concept2cure/v2/registryModel';

const BASELINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'one-product-baseline.json');

interface Baseline { surfaces: string[]; rail: string[]; founderDecisions: Record<string, string> }
interface Verdict { added: string[]; removed: string[]; badDecisions: string[] }

export function judge(current: { surfaces: string[]; rail: string[] }, baseline: Baseline): Verdict {
  const decided = (id: string) => (baseline.founderDecisions[id] ?? '').trim().length >= 20;
  const added = [
    ...current.surfaces.filter(id => !baseline.surfaces.includes(id) && !decided(`surface:${id}`)).map(id => `surface:${id}`),
    ...current.rail.filter(id => !baseline.rail.includes(id) && !decided(`rail:${id}`)).map(id => `rail:${id}`),
  ];
  const removed = [
    ...baseline.surfaces.filter(id => !current.surfaces.includes(id)).map(id => `surface:${id}`),
    ...baseline.rail.filter(id => !current.rail.includes(id)).map(id => `rail:${id}`),
  ];
  const badDecisions = Object.entries(baseline.founderDecisions).filter(([, why]) => why.trim().length < 20).map(([id]) => id);
  return { added, removed, badDecisions };
}

function current() {
  return { surfaces: UI_SURFACES.map(s => s.id).sort(), rail: (RAIL_CORE as ReadonlyArray<{ id: string }>).map(r => r.id).sort() };
}

function selftest(): void {
  const base: Baseline = { surfaces: ['projects', 'document-authoring'], rail: ['home'], founderDecisions: {} };
  const card = judge({ surfaces: ['projects', 'document-authoring', 'csr-card'], rail: ['home'] }, base);
  const rail = judge({ surfaces: ['projects', 'document-authoring'], rail: ['home', 'csr-workspace'] }, base);
  const gone = judge({ surfaces: ['projects'], rail: ['home'] }, base);
  const granted = judge({ surfaces: ['projects', 'document-authoring', 'x'], rail: ['home'] }, { ...base, founderDecisions: { 'surface:x': 'ok' } });
  const ok = card.added.join() === 'surface:csr-card' && rail.added.join() === 'rail:csr-workspace'
    && gone.added.length === 0 && gone.removed.join() === 'surface:document-authoring'
    && granted.added.join() === 'surface:x' && granted.badDecisions.join() === 'surface:x';
  console.log(ok ? 'ci:one-product selftest: refuses a new surface, a new rail entry and a reasonless grant; allows a removal.'
    : `ci:one-product selftest FAILED: ${JSON.stringify({ card, rail, gone, granted })}`);
  process.exit(ok ? 0 : 1);
}

function main(): void {
  if (process.argv.includes('--selftest')) return selftest();
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
  const now = current();
  const verdict = judge(now, baseline);
  if (process.argv.includes('--write')) {
    if (verdict.added.length) { console.error(`ci:one-product: --write never records an addition: ${verdict.added.join(', ')}`); process.exit(1); }
    const keep = (ids: string[], live: string[]) => ids.filter(id => live.includes(id));
    writeFileSync(BASELINE, `${JSON.stringify({ ...baseline, surfaces: keep(baseline.surfaces, now.surfaces), rail: keep(baseline.rail, now.rail) }, null, 2)}\n`);
    console.log(`ci:one-product: baseline shrunk by ${verdict.removed.length}.`);
    return;
  }
  if (verdict.added.length || verdict.badDecisions.length) {
    console.error('ci:one-product FAILED (CLAUDE.md RULE 4: one canvas, one editor, one project module; no cards, workspaces or apps).');
    for (const id of verdict.added) console.error(`  new ${id}: put what it does into the one editor or the project's document start instead.`);
    for (const id of verdict.badDecisions) console.error(`  ${id}: a founder decision needs its P-number or dated quote.`);
    process.exit(1);
  }
  const note = verdict.removed.length ? ` ${verdict.removed.length} removed (run with --write to shrink the baseline).` : '';
  console.log(`ci:one-product: ${now.surfaces.length} surfaces, ${now.rail.length} rail entries, none new.${note}`);
}

main();
