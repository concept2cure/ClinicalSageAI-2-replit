/**
 * Seed demo Clinical Regulatory Evidence for human testing.
 *
 * Populates the cre_* spine for ONE tenant so every CRE surface renders real data
 * on a fresh workspace: the CRL Library list, the CSR-workflow findings / coverage /
 * regulatory-outcome, the study-design coverage strip, and all five always-on AnA
 * tools (search_clinical_regulatory_evidence, compare_proposed_design_to_precedent,
 * explain_design_risk, stress_test_protocol, trace_design_recommendation).
 *
 * HONEST DEMO DATA. Everything is written TENANT-PRIVATE to the target org (never
 * the shared global_public FDA corpus) and is clearly labelled — the source titles
 * are prefixed "[DEMO]", the sponsor/product are fictional, and every row carries
 * metadata.demo = true. Nothing here is presented as a real FDA record, and nothing
 * leaks to another tenant. The findings are illustrative, written in the shape a
 * real CRL takes (a deficiency + the action FDA requested + the affected ICH E3 /
 * CTD location + a short verbatim-style excerpt), so the surfaces exercise the real
 * read paths rather than a mock.
 *
 * It also runs projectOrgCsrReports() to fold any of the tenant's OWN csr_reports
 * into the spine (the P0b path), so the coverage strip counts real structured
 * sources where they exist.
 *
 * Idempotent: gated on the demo CRL source (by application number). A second run
 * is a no-op unless --reset is passed.
 *
 * Usage:
 *   tsx scripts/cre/seed-demo-evidence.ts --org <id>
 *   tsx scripts/cre/seed-demo-evidence.ts --org-name concept2cure
 *   tsx scripts/cre/seed-demo-evidence.ts --org <id> --verify
 */

import { pool } from '../../server/db';
import {
  createSource,
  createFinding,
  createOutcome,
  upsertStudy,
  addRelationship,
  proposeDesignLesson,
  listSources,
  listFindings,
  listStudies,
  listOutcomes,
  listDesignLessons,
} from '../../server/services/clinical-regulatory-evidence/evidence-spine.service';
import { projectOrgCsrReports } from '../../server/services/clinical-regulatory-evidence/csr-adapter.service';
import { createScopedLogger } from '../../server/utils/logger';

const logger = createScopedLogger('cre-seed-demo');

const DEMO_APP = 'NDA-DEMO-CRE-001';
const DEMO_STUDY_KEY = 'DEMO-NSCLC-P3-001';

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

async function resolveOrg(): Promise<number> {
  const orgArg = argValue('org');
  if (orgArg && /^\d+$/.test(orgArg)) return parseInt(orgArg, 10);
  const name = argValue('org-name') ?? 'concept2cure';
  const { rows } = await pool.query(
    `SELECT id FROM organizations WHERE lower(name) = lower($1) OR lower(slug) = lower($1) ORDER BY id LIMIT 1`,
    [name],
  );
  if (rows.length === 0) {
    throw new Error(`No organization matched --org-name "${name}". Pass --org <id> explicitly.`);
  }
  return (rows[0] as { id: number }).id;
}

async function alreadySeeded(org: number): Promise<boolean> {
  const existing = await listSources(org, { sourceType: 'fda_crl', applicationNumber: DEMO_APP });
  return existing.length > 0;
}

async function verify(org: number): Promise<void> {
  const [sources, findings, studies, outcomes, lessons] = await Promise.all([
    listSources(org, {}),
    listFindings(org, { limit: 200 }),
    listStudies(org, { limit: 200 }),
    listOutcomes(org, { limit: 200 }),
    listDesignLessons(org, { limit: 200 }),
  ]);
  logger.info(
    `CRE corpus for org ${org}: ${sources.length} sources, ${findings.length} findings, ` +
      `${studies.length} studies, ${outcomes.length} outcomes, ${lessons.length} design lessons.`,
  );
}

/** The three illustrative deficiencies, written the way a CRL states them. */
const DEMO_FINDINGS = [
  {
    findingDomain: 'biostatistics',
    fdaReviewDiscipline: 'statistical',
    findingCategory: 'endpoint validity',
    severity: 'high',
    findingText:
      'The single Phase 3 trial did not control the family-wise Type I error rate across the ' +
      'co-primary endpoints (overall survival and progression-free survival).',
    normalizedSummary: 'No multiplicity control across co-primary OS/PFS endpoints.',
    requestedAction:
      'Provide a pre-specified multiplicity-adjustment strategy, or an additional adequate and ' +
      'well-controlled trial supporting effectiveness.',
    affectedIchE3Section: '11.4.2.1',
    affectedCtdSection: '2.7.3',
    sourcePage: 7,
    sourceExcerpt: 'did not control the overall Type I error rate',
  },
  {
    findingDomain: 'safety',
    fdaReviewDiscipline: 'safety',
    findingCategory: 'safety database size',
    severity: 'high',
    findingText:
      'The safety database is insufficient to characterize the incidence of Grade ≥3 ' +
      'hepatotoxicity at the proposed commercial dose.',
    normalizedSummary: 'Safety database inadequate to characterize Grade ≥3 hepatotoxicity.',
    requestedAction:
      'Expand the safety database consistent with ICH E1, or provide additional long-term ' +
      'exposure data at the proposed dose.',
    affectedIchE3Section: '12.3',
    affectedCtdSection: '2.7.4',
    sourcePage: 12,
    sourceExcerpt: 'insufficient to characterize the incidence',
  },
  {
    findingDomain: 'cmc',
    fdaReviewDiscipline: 'cmc',
    findingCategory: 'process validation',
    severity: 'medium',
    findingText:
      'The proposed commercial drug-substance manufacturing process was not validated at the ' +
      'intended commercial scale.',
    normalizedSummary: 'Drug-substance process not validated at commercial scale.',
    requestedAction: 'Provide process-validation data at the intended commercial scale.',
    affectedCtdSection: '3.2.S.2.5',
    sourcePage: 3,
    sourceExcerpt: 'not validated at the intended commercial scale',
  },
] as const;

async function seed(org: number): Promise<void> {
  logger.info(`Seeding demo CRE evidence for org ${org} (tenant-private, clearly labelled)…`);

  // 1. The demo CRL source (tenant-private; fictional sponsor/product).
  const crl = await createSource(org, {
    sourceType: 'fda_crl',
    visibilityClass: 'tenant_private',
    agency: 'FDA',
    applicationType: 'NDA',
    applicationNumber: DEMO_APP,
    title: '[DEMO] Complete Response Letter — Belantovir (illustrative)',
    sponsor: 'Demo Therapeutics, Inc.',
    product: 'Belantovir',
    indication: 'metastatic non-small cell lung cancer',
    therapeuticArea: 'oncology',
    phase: '3',
    documentDate: '2026-05-14',
    ingestionStatus: 'ingested',
    extractionStatus: 'extracted',
    metadata: { demo: true, note: 'Illustrative demo CRL — not a real FDA record.' },
  });

  // 2. The three findings + a verified CRL outcome.
  for (const f of DEMO_FINDINGS) {
    await createFinding(org, {
      sourceId: crl.id,
      visibilityClass: 'tenant_private',
      applicationIdentifier: DEMO_APP,
      explicitOrInferred: 'explicit',
      verificationStatus: 'source_verified',
      metadata: { demo: true },
      ...f,
    });
  }
  await createOutcome(org, {
    outcomeType: 'crl',
    visibilityClass: 'tenant_private',
    sourceId: crl.id,
    applicationIdentifier: DEMO_APP,
    outcomeDate: '2026-05-14',
    verificationStatus: 'verified',
    evidenceNote: 'Complete Response Letter issued (illustrative demo record).',
    metadata: { demo: true },
  });

  // 3. A demo CSR source + canonical study so the coverage strip counts a
  //    structured precedent, and the design lesson has a second support.
  const csr = await createSource(org, {
    sourceType: 'csr',
    visibilityClass: 'tenant_private',
    applicationType: 'NDA',
    title: '[DEMO] CSR — CA-209-NSCLC pivotal (illustrative)',
    sponsor: 'Demo Therapeutics, Inc.',
    product: 'Belantovir',
    indication: 'metastatic non-small cell lung cancer',
    therapeuticArea: 'oncology',
    phase: '3',
    ingestionStatus: 'ingested',
    extractionStatus: 'extracted',
    metadata: { demo: true },
  });
  const study = await upsertStudy(org, {
    canonicalStudyKey: DEMO_STUDY_KEY,
    visibilityClass: 'tenant_private',
    indication: 'metastatic non-small cell lung cancer',
    phase: '3',
    product: 'Belantovir',
    modality: 'small molecule',
    sponsor: 'Demo Therapeutics, Inc.',
    studyStatus: 'completed',
    metadata: { demo: true },
  });
  await addRelationship(org, {
    fromEntityType: 'source',
    fromEntityId: csr.id,
    toEntityType: 'study',
    toEntityId: study.id,
    relationshipType: 'describes_study',
  });

  // 4. A governed design lesson (≥2 supporting sources: the CRL + the CSR).
  await proposeDesignLesson(org, {
    visibilityClass: 'tenant_private',
    lessonStatement:
      'In metastatic NSCLC Phase 3 programs with co-primary OS/PFS endpoints, a pre-specified ' +
      'multiplicity-control strategy is expected; its absence has drawn FDA statistical deficiencies.',
    supportingSourceIds: [crl.id, csr.id],
    applicablePopulation: 'metastatic non-small cell lung cancer',
    applicablePhase: '3',
    endpointType: 'co-primary',
    minimumEvidenceCount: 2,
    derivationMethod: 'demo_seed',
    metadata: { demo: true },
  });

  // 5. Fold the tenant's OWN csr_reports into the spine (the P0b projection path).
  const projection = await projectOrgCsrReports(org, {});
  logger.info(
    `CSR projection: ${projection.projected} projected, ${projection.alreadyPresent} already present ` +
      `(of ${projection.total} of the tenant's own csr_reports).`,
  );

  logger.info('Demo CRE evidence seeded: 1 CRL (3 findings + outcome), 1 CSR + study, 1 design lesson.');
}

async function main(): Promise<void> {
  const org = await resolveOrg();

  if (hasFlag('verify')) {
    await verify(org);
    return;
  }

  if (await alreadySeeded(org)) {
    logger.info(`Demo CRE evidence already present for org ${org} (found ${DEMO_APP}). Nothing to do.`);
    await verify(org);
    return;
  }

  await seed(org);
  await verify(org);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error(`Failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(1);
  });
