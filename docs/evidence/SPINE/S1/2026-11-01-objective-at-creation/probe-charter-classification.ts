/**
 * Which filings New project can create, and whether the project charter can be
 * started for each (so its objective can be recorded). Read-only: it writes
 * nothing. Run from the repository root:
 *   npx tsx --tsconfig tsconfig.json docs/evidence/SPINE/S1/2026-11-01-objective-at-creation/probe-charter-classification.ts
 * A catalog entry counts as creatable when its pathway is a VALID_PROGRAM_TYPES
 * value and marketOfferGivenOutline offers it, the create route's first check.
 *
 * The grid (added at review, 2026-11-01) reads the agency the way POST
 * /api/c2c/projects hands it to the charter: as sent, unless the type is a
 * regional device class (projects.ts `primaryAgency`). It crosses every
 * VALID_PROGRAM_TYPES value with every agency the catalog names and the
 * spellings people send, and keeps the pairs the offer check offers.
 */
import { FILING_CATALOG, regionalDeviceApplicationClassOf } from '../../../../../shared/regulatory/filing-catalog';
import { VALID_PROGRAM_TYPES } from '../../../../../server/routes/c2c/project-intake';
import { charterClassification } from '../../../../../server/services/c2c/charter-objectives';
import { documentAgencyFor, marketOfferGivenOutline } from '../../../../../server/services/regulatory/market-support';

const ok: string[] = [];
const refused = new Map<string, number>();
let skipped = 0;
for (const e of FILING_CATALOG) {
  const t = String(e.pathwayKey ?? '').toLowerCase();
  const a = String(e.agency);
  if (!t || !VALID_PROGRAM_TYPES.has(t)) { skipped++; continue; }
  if (marketOfferGivenOutline({ applicationType: t, market: a, continuingLifecycle: false }, true).tier === 'not_offered') { skipped++; continue; }
  const doc = documentAgencyFor({ applicationType: t, market: a });
  try { charterClassification({ programType: t, primaryAgency: doc ?? a, productName: 'X' }); ok.push(`${t}@${a}`); }
  catch { const k = `${t}@${a}->${doc}`; refused.set(k, (refused.get(k) ?? 0) + 1); }
}
console.info('catalog entries', FILING_CATALOG.length, 'skipped (not creatable)', skipped);
console.info('CLASSIFIED', ok.length);
console.info('REFUSED', [...refused.values()].reduce((x, y) => x + y, 0), [...refused.keys()].join(' '));

const routeAgency = (t: string, sent: string) => (regionalDeviceApplicationClassOf(t)
  ? documentAgencyFor({ applicationType: t, market: sent }) ?? sent : sent);
const spellings = new Set<string>(['FDA', 'us', 'US', 'EMA', 'EU', 'EU / Notified Body', 'Notified Body', 'PMDA', 'Japan',
  'Health Canada', 'HC', 'health-canada', 'TGA', 'MHRA', 'ICH / Global', 'NMPA', 'MFDS', 'Registered certification body', 'Swissmedic']);
for (const e of FILING_CATALOG) spellings.add(String(e.agency));
let offered = 0;
const gridRefused: string[] = [];
for (const t of VALID_PROGRAM_TYPES) {
  for (const a of spellings) {
    if (marketOfferGivenOutline({ applicationType: t, market: a, continuingLifecycle: false }, true).tier === 'not_offered') continue;
    offered++;
    try { charterClassification({ programType: t, primaryAgency: routeAgency(t, a), productName: 'X' }); }
    catch { gridRefused.push(`${t}@${a}`); }
  }
}
console.info('GRID agency spellings', spellings.size, 'offered pairs', offered, 'classified', offered - gridRefused.length, 'refused', gridRefused.length);
