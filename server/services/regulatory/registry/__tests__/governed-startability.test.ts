/**
 * The coverage report must not call a filing type ready when the product cannot
 * start it at all.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `readinessOf` derived its tier from the BLUEPRINT catalog alone — a static
 * section/task structure — and the blueprint catalog is not what the governed
 * editor uses. A governed document is created by
 * services/c2c/scaffold-project-documents through `resolveDocumentClass`, which
 * needs the program type in PROGRAM_TO_DOC_TYPE and the agency in
 * AGENCY_TO_CODE. AGENCY_TO_CODE deliberately excludes Swissmedic, ANVISA,
 * CDSCO, HSA, Notified_Body, ISO, IEC and IMDRF, because
 * `c2c_documents_agency_check` would reject them at insert time.
 *
 * So 54 registry entries read `buildable` or `production_ready` while a
 * governed document for them cannot be inserted under any circumstances — two
 * of them, BR_DDCM (ANVISA) and IN_CT04 (CDSCO), read the top tier
 * `production_ready`. Every one of the 234 active entries read `buildable` or
 * better and NONE read `catalog_only`, so the backlog view
 * (`getCatalogOnlyGaps`) was empty and the report showed no gap at all.
 *
 * This is not a mislabeled internal metric. `production_ready` is what a
 * customer, a salesperson and a CI gate all read as "this filing type works",
 * and for these entries nothing works — the wizard returns NO_RULE_PACK before
 * a row is written. document-class.ts already refuses to substitute a
 * near-neighbour agency for exactly this reason and says so at length; the
 * coverage report simply never asked it.
 *
 * The fix does not weaken the blueprint measurement, which is honest about what
 * it measures. It adds the fact the report was missing — whether a governed
 * document can be started — and refuses to award a readiness tier above
 * `catalog_only` when it cannot.
 */
import { describe, it, expect } from 'vitest';
import { computeCoverage, buildCoverageReport, getDocumentCoverage } from '../registryCoverage';
import { AGENCY_TO_CODE, PROGRAM_TO_DOC_TYPE } from '../../../c2c/document-class';

/** The same normalisation resolveDocumentClass applies to the wizard's agency. */
const agencyKey = (a: string) => String(a ?? '').toUpperCase().replace(/[\s-]/g, '_');

describe('coverage never claims readiness the governed path cannot deliver', () => {
  it('awards no tier above catalog_only to an entry whose agency cannot hold a governed document', () => {
    const offenders = computeCoverage()
      .filter((c) => !AGENCY_TO_CODE[agencyKey(c.agency)])
      .filter((c) => c.readiness !== 'catalog_only')
      .map((c) => `${c.id} (${c.agency}) = ${c.readiness}`);

    expect(
      offenders,
      `these types are reported ready but c2c_documents_agency_check would reject the insert:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('states startability as its own fact, so the blueprint measure stays readable', () => {
    const cov = computeCoverage();
    expect(cov.length).toBeGreaterThan(0);
    for (const c of cov) {
      expect(
        c.governedAuthoring,
        `${c.id} carries no governedAuthoring verdict`,
      ).toMatch(/^(supported|unmapped_agency|unmapped_program)$/);
    }
    // The blueprint tiers are still reported, unchanged in meaning.
    for (const c of cov) {
      expect(c.sectionBlueprint).toMatch(/^(dedicated|specific|generic)$/);
    }
  });

  it('an ANVISA and a CDSCO entry are the worked examples', () => {
    // Named because they were the two reading `production_ready`.
    for (const id of ['BR_DDCM', 'IN_CT04']) {
      const c = getDocumentCoverage(id);
      expect(c, `${id} missing from the registry`).toBeTruthy();
      expect(c!.governedAuthoring, `${id} should be unmapped`).toBe('unmapped_agency');
      expect(c!.readiness, `${id} still reports a tier it cannot deliver`).toBe('catalog_only');
    }
  });

  it('does not demote a filing the product genuinely supports', () => {
    // A positive control. US_IND is startable and must keep its tier, or the
    // repair would be "call everything catalog_only".
    const ind = getDocumentCoverage('US_IND');
    expect(ind, 'US_IND missing from the registry').toBeTruthy();
    expect(ind!.governedAuthoring).toBe('supported');
    expect(ind!.readiness).not.toBe('catalog_only');
  });

  it('surfaces the gap in the report summary instead of leaving it empty', () => {
    const report = buildCoverageReport();
    expect(report.summary.byGovernedAuthoring, 'the summary does not count startability').toBeTruthy();
    expect(report.summary.byGovernedAuthoring.supported).toBeGreaterThan(0);
    // The whole point: the backlog view was empty because every entry read
    // buildable or better. It must now show the types that cannot be started.
    expect(
      report.summary.byGovernedAuthoring.unmapped_agency,
      'no entry is reported unstartable, which is what the old report claimed',
    ).toBeGreaterThan(0);
    expect(report.summary.byReadiness.catalog_only).toBeGreaterThan(0);
  });

  it('does not invent a program-side verdict the registry cannot support', () => {
    /* resolveDocumentClass keys PROGRAM_TO_DOC_TYPE on the project's
       `program_type`, which the wizard supplies. The registry's nearest fields
       are `applicationFamily` ('clinical_trial' — a category) and
       `applicationType` ('IND' — a label); neither IS the program type. A first
       attempt derived `unmapped_program` from applicationFamily and demoted
       US_IND, which the positive control above caught. So nothing produces that
       verdict from the registry alone, and this pins that. */
    expect(computeCoverage().some((c) => c.governedAuthoring === 'unmapped_program')).toBe(false);
    // The value stays in the union for a caller that HAS the program type.
    expect(Object.keys(PROGRAM_TO_DOC_TYPE).length).toBeGreaterThan(0);
  });
});
