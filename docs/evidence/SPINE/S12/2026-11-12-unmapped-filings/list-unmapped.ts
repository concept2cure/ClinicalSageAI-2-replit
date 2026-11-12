/**
 * Lists every catalog filing that reaches an application type only through the New project wizard's `|| 'ctd'`
 * default (Projects.tsx), with what it resolves to today and what the market verdict says at its own agency.
 * Read-only; no database (the verdict is computed with every rule pack treated as present, so "offered" here means
 * "the platform would offer this application type at this agency when its pack is active").
 *
 *   npx tsx docs/evidence/SPINE/S12/2026-11-12-unmapped-filings/list-unmapped.ts   (writes unmapped.json beside itself)
 */
import { writeFileSync } from 'node:fs';
import { FILING_CATALOG } from '../../../../../shared/regulatory/filing-catalog';
import { programTypeFor } from '../../../../../shared/constants/domain/filing-application-type';
import { filingDocumentClassForFiling } from '../../../../../shared/regulatory/filing-document-classes';
import { marketSupport } from '../../../../../server/services/regulatory/market-support';

const packs = { find: () => ({ version: '1', label: 'present' }) };
const rows = [];
const seen = new Set<string>();
for (const e of FILING_CATALOG as Array<Record<string, unknown>>) {
  const id = String(e.id);
  if (seen.has(id)) continue; seen.add(id);
  if (e.pathwayKey || filingDocumentClassForFiling(id.toLowerCase())) continue;
  const today = programTypeFor({ id, label: id, pathway: 'ctd' }, 'biotech');
  const withoutDefault = programTypeFor({ id, label: id, pathway: '' }, 'biotech');
  const reachesByIdAlone = today === withoutDefault;
  const verdict = marketSupport({ applicationType: today, market: String(e.agency ?? '') }, packs, '2026-11-12') as Record<string, unknown>;
  rows.push({ id, name: e.displayName ?? e.name ?? null, segment: e.segment ?? null, agency: e.agency ?? null, region: e.region ?? null,
    resolvesToday: today, withoutCtdDefault: withoutDefault, reachesByIdAlone,
    offerTier: (verdict.offer as { tier?: string } | undefined)?.tier ?? null, offerReason: (verdict.offer as { reason?: string } | undefined)?.reason ?? null });
}
writeFileSync(new URL('./unmapped.json', import.meta.url), JSON.stringify({ catalog: seen.size, unmapped: rows.length, rows }, null, 1) + '\n');
process.exit(0);
