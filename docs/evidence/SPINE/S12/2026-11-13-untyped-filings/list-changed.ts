/**
 * What removing the New project wizard's 'ctd' default changes, filing by filing. Read-only, no database:
 *   npx tsx docs/evidence/SPINE/S12/2026-11-13-untyped-filings/list-changed.ts
 * `before` is the type each catalog filing got with the default; `after` is the type it has without it ('' is none).
 * The verdict before is computed with every rule pack treated as present, at the filing's own agency.
 */
import { writeFileSync } from 'node:fs';
import { FILING_CATALOG } from '../../../../../shared/regulatory/filing-catalog';
import { NO_APPLICATION_TYPE, noProjectReason, programTypeFor } from '../../../../../shared/constants/domain/filing-application-type';
import { marketSupport, type ActiveRulePacks } from '../../../../../server/services/regulatory/market-support';

const packs: ActiveRulePacks = { find: (d, a) => ({ version: 'all-present', label: `${d}:${a}` }) };
const typeOf = (id: string, pathway: string) => programTypeFor({ id, label: id, pathway }, 'biotech');

const rows = FILING_CATALOG.map((e) => {
  const before = typeOf(e.id, e.pathwayKey || 'ctd');
  const after = typeOf(e.id, e.pathwayKey ?? '');
  const offer = marketSupport({ applicationType: before, market: e.agency }, packs, '2026-11-13').offer;
  return { id: e.id, name: e.displayName, agency: e.agency, segment: e.segment, category: e.category, before, after,
    tierBefore: offer.tier, reasonBefore: offer.reasonByFiling?.[e.registryId] ?? offer.reason,
    reasonAfter: after === NO_APPLICATION_TYPE ? noProjectReason(e) : null };
}).filter((r) => r.before !== r.after);

const noLongerCreatable = rows.filter((r) => r.after === NO_APPLICATION_TYPE && r.tierBefore !== 'not_offered');
const reasonOnly = rows.filter((r) => r.after === NO_APPLICATION_TYPE && r.tierBefore === 'not_offered');
const retyped = rows.filter((r) => r.after !== NO_APPLICATION_TYPE);
writeFileSync(new URL('./changed.json', import.meta.url), `${JSON.stringify({
  catalog: FILING_CATALOG.length, changed: rows.length,
  noLongerCreatable: noLongerCreatable.length, reasonOnly: reasonOnly.length, retyped: retyped.length,
  rows: { noLongerCreatable, reasonOnly, retyped },
}, null, 1)}\n`);
