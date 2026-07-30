/**
 * Regulatory document coverage report.
 *
 * Prints the portfolio-wide readiness of every document type in the global
 * registry: which types have a real, region-specific authoring structure
 * (production-ready / buildable) vs. which are still catalog-only metadata.
 * Also prints the biotech lifecycle spine (Pre-IND → IND → NDA/BLA across the
 * primary regions) so a product owner can confirm end-to-end coverage at a
 * glance.
 *
 * Usage:
 *   tsx scripts/regulatory-coverage-report.ts            # human-readable report
 *   tsx scripts/regulatory-coverage-report.ts --json     # machine-readable JSON
 *   tsx scripts/regulatory-coverage-report.ts --gaps     # only catalog-only gaps
 *
 * @module scripts/regulatory-coverage-report
 */

import {
  buildCoverageReport,
  getLifecycleSpineStatus,
  getCatalogOnlyGaps,
} from '../server/services/regulatory/registry/registryCoverage.js';

const asJson = process.argv.includes('--json');
const gapsOnly = process.argv.includes('--gaps');

const report = buildCoverageReport();
const spine = getLifecycleSpineStatus();
const gaps = getCatalogOnlyGaps();

if (asJson) {
  process.stdout.write(JSON.stringify({ summary: report.summary, byRegion: report.byRegion, spine, gaps }, null, 2) + '\n');
  process.exit(0);
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`;
}

const line = (s = '') => process.stdout.write(s + '\n');

line('══════════════════════════════════════════════════════════════════');
line('  REGULATORY DOCUMENT COVERAGE REPORT');
line('══════════════════════════════════════════════════════════════════');
line();
line(`Total active document types: ${report.summary.total}`);
line(`  production_ready : ${report.summary.byReadiness.production_ready}  (${pct(report.summary.byReadiness.production_ready, report.summary.total)})  — dedicated section + task blueprints`);
line(`  buildable        : ${report.summary.byReadiness.buildable}  (${pct(report.summary.byReadiness.buildable, report.summary.total)})  — real section structure, generic tasks`);
line(`  catalog_only     : ${report.summary.byReadiness.catalog_only}  (${pct(report.summary.byReadiness.catalog_only, report.summary.total)})  — generic CTD fallback (backlog)`);
line();

if (!gapsOnly) {
  line('── Biotech lifecycle spine (Pre-IND → IND → NDA/BLA) ──────────────');
  line();
  for (const node of spine) {
    const mark = node.readiness === 'production_ready' ? '●' : node.readiness === 'buildable' ? '◐' : node.present ? '○' : '✗';
    line(`  ${mark}  ${node.region.padEnd(3)} ${node.id.padEnd(18)} ${node.readiness}`);
  }
  line();
  line('  ● production_ready   ◐ buildable   ○ catalog_only   ✗ missing');
  line();

  line('── Coverage by region ────────────────────────────────────────────');
  line();
  line('  region  agency          total  prod  build  catalog');
  for (const r of report.byRegion) {
    line(`  ${r.region.padEnd(7)} ${r.agency.padEnd(15)} ${String(r.total).padStart(4)}  ${String(r.productionReady).padStart(4)}  ${String(r.buildable).padStart(5)}  ${String(r.catalogOnly).padStart(6)}`);
  }
  line();
}

line(`── Catalog-only backlog (${gaps.length}) ─────────────────────────────────────`);
line();
const byRegion = new Map<string, string[]>();
for (const g of gaps) {
  const arr = byRegion.get(g.region) ?? [];
  arr.push(g.id);
  byRegion.set(g.region, arr);
}
for (const [region, ids] of [...byRegion.entries()].sort()) {
  line(`  ${region}: ${ids.join(', ')}`);
}
line();
line('These types are selectable in the catalog but resolve to a generic CTD');
line('outline. They are the prioritised backlog for dedicated section/task');
line('blueprints. Run with --json for machine-readable output.');
