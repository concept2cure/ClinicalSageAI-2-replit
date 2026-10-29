/**
 * The 16 US biotech filing identities of 2026-10-29
 * (docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md, interfaces item 1),
 * and US_BLA_SUPP's move onto its own record, through every existing owner:
 * the registry, the exact project section and task layers, the template outline
 * map, the filing document classes and the annual planner.
 *
 * The exact-identity rule under test: a subtype never resolves to its parent's
 * or the generic outline. Before this change every one of these ids was absent,
 * and a BLA report or change started from the wizard was created as a BLA.
 */
import { describe, expect, it } from 'vitest';
import { GLOBAL_REGISTRY, getApplicationType } from '../../shared/regulatory/global-document-registry';
import { filingDocumentClassForFiling } from '../../shared/regulatory/filing-document-classes';
import { getSectionBlueprintForEntry } from '../../shared/regulatory/project-bootstrap';
import {
  getExactSectionBlueprint, getResolvedSectionBlueprint, getSectionBlueprintContext, hasDedicatedSectionBlueprint,
} from '../../server/services/regulatory/sectionBlueprintCatalog';
import { getTaskBlueprint } from '../../server/services/regulatory/taskBlueprintCatalog';
import { getRegistryDocumentTemplate } from '../../server/services/market-specs/document-template-library';
import {
  LIFECYCLE_DOCUMENT_TYPES, US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID,
} from '../../server/services/ind/ctd/lifecycle-document-types';
import { planAnnualReport } from '../../server/services/post-approval/post-approval-knowledge';

/** [registry id, the exact task plan it resolves to]. */
const NEW_IDENTITIES = [
  ['US_TYPE_D_MEETING', 'meeting_package_with_request_tasks'],
  ['US_INTERACT', 'meeting_package_with_request_tasks'],
  ['US_EXPANDED_ACCESS_INDIVIDUAL', 'expanded_access_tasks'],
  ['US_EXPANDED_ACCESS_INTERMEDIATE', 'expanded_access_tasks'],
  ['US_EXPANDED_ACCESS_TREATMENT', 'expanded_access_tasks'],
  ['US_BLA_ANNUAL', 'bla_periodic_report_tasks'],
  ['US_BLA_PEDIATRIC_ANNUAL', 'bla_periodic_report_tasks'],
  ['US_BLA_PMR_ANNUAL', 'bla_periodic_report_tasks'],
  ['US_BLA_DISTRIBUTION', 'bla_periodic_report_tasks'],
  ['US_BPDR', 'biological_deviation_report_tasks'],
  ['US_EUA_THERAPEUTIC', 'eua_request_tasks'],
  ['US_BLA_CBE30', 'variation_supplement_tasks'],
  ['US_BLA_CBE0', 'variation_supplement_tasks'],
  ['US_CBER_MASTER_FILE', 'master_file_tasks'],
  ['US_CBER_LOT_RELEASE', 'lot_release_tasks'],
  ['US_BLA_PAE_REPORT', 'aggregate_safety_tasks'],
] as const;
const ALL = [...NEW_IDENTITIES.map(([id]) => id), 'US_BLA_SUPP'];

describe('the 16 identities are in the one filing registry', () => {
  it('each exists once, active, US/FDA, pharma_biotech, with no eCTD claimed by default where none applies', () => {
    expect(NEW_IDENTITIES).toHaveLength(16);
    for (const [id] of NEW_IDENTITIES) {
      expect(GLOBAL_REGISTRY.filter(e => e.id === id), id).toHaveLength(1);
      const e = getApplicationType(id)!;
      expect(e).toMatchObject({ region: 'US', agency: 'FDA', segment: 'pharma_biotech', active: true });
      expect(e.description, id).toBeTruthy();
      expect(e.moduleAuthority, id).toMatch(/recall|21 CFR|FD&C Act/i);
    }
    // Letters and forms are not eCTD dossiers.
    for (const id of ['US_TYPE_D_MEETING', 'US_INTERACT', 'US_BPDR', 'US_BLA_PAE_REPORT', 'US_BLA_DISTRIBUTION', 'US_CBER_LOT_RELEASE']) {
      expect(getApplicationType(id)!.dossierStandard, id).toBe('none');
    }
    // The device EUA stays its own identity.
    expect(getApplicationType('US_EUA')!.segment).toBe('medical_devices');
    expect(getApplicationType('US_EUA_THERAPEUTIC')!.productClass).not.toContain('medical_device');
  });

  it('each BLA-licence filing names US_BLA as its parent and a biologic product class', () => {
    for (const id of ['US_BLA_ANNUAL', 'US_BLA_PEDIATRIC_ANNUAL', 'US_BLA_PMR_ANNUAL', 'US_BLA_DISTRIBUTION', 'US_BPDR', 'US_BLA_PAE_REPORT', 'US_BLA_CBE30', 'US_BLA_CBE0', 'US_CBER_LOT_RELEASE']) {
      const e = getApplicationType(id)!;
      expect(e.parentApplicationType, id).toBe('US_BLA');
      expect(e.productClass, id).not.toContain('small_molecule');
      expect(filingDocumentClassForFiling(id)?.productTypeByFiling?.[id], id).toBe('biologic');
    }
  });
});

describe('exact identity beats the parent and the generic fallback', () => {
  it.each(ALL)('%s resolves to its own record\'s sections, not default_sections', id => {
    const entry = getApplicationType(id)!;
    const record = LIFECYCLE_DOCUMENT_TYPES.find(r => r.id === US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID[id])!;
    expect(record.registryId).toBe(id);
    // The shared layer alone would have served the generic CTD (or the NDA PAS heading copy for US_BLA_SUPP).
    expect(hasDedicatedSectionBlueprint(id)).toBe(true);
    const exact = getExactSectionBlueprint(id)!;
    expect(exact.id).toBe(entry.defaultSectionBlueprint);
    expect(getResolvedSectionBlueprint(entry)).toBe(exact);
    expect(exact.sections.map(s => [s.code, s.title, s.required, s.contentType])).toEqual(
      record.components.map(c => [c.code, c.title, c.required, c.contentType]));
    expect(exact.sections.map(s => s.code)).not.toEqual(getSectionBlueprintForEntry(entry).sections.map(s => s.code));
    const ctx = getSectionBlueprintContext(id);
    expect(ctx.basis).toMatchObject({ confidence: 'recall' });
    expect(ctx.limitations.join(' ')).toContain('only narrative parts are AnA-eligible');
  });

  it.each(NEW_IDENTITIES)('%s has its own task plan (%s), never the generic default', async (id, plan) => {
    const tasks = await getTaskBlueprint(id);
    expect(tasks.id).toBe(plan);
    expect(tasks.milestones.length).toBeGreaterThan(0);
  });

  it('Type D and INTERACT submit the package with the request, not ahead of a later meeting', async () => {
    const tasks = await getTaskBlueprint('US_TYPE_D_MEETING');
    const titles = tasks.milestones.flatMap(m => m.tasks.map(t => t.title));
    expect(titles).toContain('Submit Request with Package');
    expect(titles).not.toContain('Submit Briefing Package');
  });

  it.each(ALL)('%s is served its own record as its template outline and has its own filing class', async id => {
    const outline = (await getRegistryDocumentTemplate(id))!;
    expect(outline.outlineSource).toMatchObject({ kind: 'lifecycle-record', registryId: id,
      record: `LIFECYCLE_DOCUMENT_TYPES:${US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID[id]}` });
    expect(outline.outlineLimitations?.join(' ')).not.toContain('NDA Prior Approval Supplement record');
    const cls = filingDocumentClassForFiling(id)!;
    expect(cls.registryIds).toEqual([id]);
    expect(['ind', 'nda', 'bla', 'pas', 'cbe', 'briefing', 'annual_report', 'pader', 'dmf']).not.toContain(cls.docType);
  });
});

describe('the annual planner reads a licensed biologic\'s own report (post-approval-knowledge.ts)', () => {
  const blaRecord = LIFECYCLE_DOCUMENT_TYPES.find(r => r.id === 'us_bla_annual_report')!;

  it('a biologic gets the 601.12(d) parts from the BLA annual-report record, not NDA sections with a note', () => {
    const plan = planAnnualReport({ modality: 'biologic', biologicLicense: true });
    expect(plan.annualReportContents.regime).toBe('BLA 21 CFR 601.12(d)');
    expect(plan.annualReportContents.sourceRecord).toBe('LIFECYCLE_DOCUMENT_TYPES:us_bla_annual_report');
    expect(plan.annualReportContents.requiredSections).toHaveLength(blaRecord.components.length);
    blaRecord.components.forEach((c, i) => expect(plan.annualReportContents.requiredSections[i]).toContain(c.title));
    expect(plan.annualReportContents.requiredSections.join(' ')).not.toContain('314.81');
    expect(plan.citations.map(c => c.reference).join(' ')).not.toContain('314.70(d)');
    expect(plan.guidance.join(' ')).toContain('601.70');
  });

  it('an unstated licence follows the modality and says so; an NDA product keeps the NDA report', () => {
    const inferred = planAnnualReport({ modality: 'vaccine' });
    expect(inferred.annualReportContents.regime).toBe('BLA 21 CFR 601.12(d)');
    expect(inferred.guidance.join(' ')).toContain('biologicLicense: false');
    const nda = planAnnualReport({ modality: 'small_molecule' });
    expect(nda.annualReportContents.regime).toBe('NDA 21 CFR 314.81(b)(2)');
    expect(nda.annualReportContents.sourceRecord).toBeNull();
    expect(nda.annualReportContents.requiredSections[0]).toContain('314.81');
    expect(planAnnualReport({ modality: 'biologic', biologicLicense: false }).annualReportContents.regime).toBe('NDA 21 CFR 314.81(b)(2)');
  });

  it('a minor change on a BLA is noted under 601.12(d)', () => {
    const plan = planAnnualReport({ modality: 'biologic', changes: [{ changeArea: 'manufacturing_site' as never, description: 'x', assertedCategory: 'Annual Report' }] });
    expect(plan.annualReportContents.reportableChanges[0].note).toContain('601.12(d)');
  });
});
