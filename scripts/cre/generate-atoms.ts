/**
 * Backfill — materialize Clinical Regulatory Evidence retrieval atoms for an org.
 *
 * Populates lumen_data_atoms (the corpus AnA searches via advancedRAGPipeline →
 * ragRouter) with the nine CRE atom types, so regulatory evidence is discoverable
 * by meaning alongside the rest of a tenant's knowledge:
 *   - CRE-native atoms (FDA findings, requested actions, regulatory outcomes,
 *     human-approved design lessons, contradictory precedents) via
 *     generateAtomsForOrg;
 *   - per-CSR study-design-feature atoms via atomizeCsrReport.
 *
 * Embedding routes through the governed embedding seam (1536-d) and is best-effort:
 * an embedding failure never loses an atom (the row is written and stays
 * backfillable by scripts/embed-atoms.ts). Idempotent — safe to re-run.
 *
 * Usage:
 *   tsx scripts/cre/generate-atoms.ts --org <id> [--limit <n>] [--no-embed]
 */

import { generateAtomsForOrg } from '../../server/services/clinical-regulatory-evidence/retrieval-atoms.service';
import {
  atomizeCsrReport,
  projectOrgCsrReports,
} from '../../server/services/clinical-regulatory-evidence/csr-adapter.service';
import { listSources } from '../../server/services/clinical-regulatory-evidence/evidence-spine.service';
import { createScopedLogger } from '../../server/utils/logger';

const logger = createScopedLogger('cre-generate-atoms');

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

async function main(): Promise<void> {
  const orgArg = argValue('org');
  const org = Number(orgArg);
  if (!orgArg || !Number.isInteger(org) || org <= 0) {
    logger.error('Usage: tsx scripts/cre/generate-atoms.ts --org <id> [--limit <n>] [--no-embed]');
    process.exit(1);
  }
  const limit = argValue('limit') ? Number(argValue('limit')) : undefined;
  // undefined → the gateway-backed embedder (default); null → skip embedding.
  const embed = hasFlag('no-embed') ? null : undefined;

  logger.info(`Materializing CRE retrieval atoms for org ${org}${embed === null ? ' (embedding disabled)' : ''}…`);

  const native = await generateAtomsForOrg(org, { embed, limit });
  logger.info(
    `CRE-native: ${native.total} atoms (${native.embedded} embedded, ${native.skippedUnsupported} skipped) ` +
      JSON.stringify(native.byType),
  );

  // Project the org's CSR reports into the spine FIRST. atomizeCsrReport reads
  // from cre 'csr' sources, which only exist once adaptCsrReport has run — on a
  // fresh tenant listSources('csr') is empty, so without this the loop below is a
  // silent no-op (audit P0b). Idempotent: already-projected CSRs are skipped.
  const projection = await projectOrgCsrReports(org, { limit });
  logger.info(
    `CSR projection: ${projection.projected} newly projected, ${projection.alreadyPresent} already present, ` +
      `${projection.failed} failed (of ${projection.total} scanned).`,
  );

  const csrSources = await listSources(org, { sourceType: 'csr', limit });
  let csrTotal = 0;
  let csrReports = 0;
  for (const s of csrSources) {
    if (!s.linkedCsrReportId) continue;
    const r = await atomizeCsrReport(org, s.linkedCsrReportId, { embed });
    if (r) {
      csrTotal += r.total;
      csrReports += 1;
    }
  }
  logger.info(`CSR design features: ${csrTotal} atoms across ${csrReports} CSR(s).`);
  logger.info(`Done. Total CRE atoms materialized for org ${org}: ${native.total + csrTotal}.`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
