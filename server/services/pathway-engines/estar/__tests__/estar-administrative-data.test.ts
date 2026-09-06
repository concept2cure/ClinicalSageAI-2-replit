import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsSync from 'fs';
import path from 'path';
import {
  ESTAR_ADMINISTRATIVE_SOURCES,
  projectEstarAdministrativeData,
  resolveOfficialEstarFields,
  reportOfficialEstarFill,
  loadEstarAdministrativeInputs,
  type EstarAdministrativeInputs,
} from '../estar-administrative-data';
import { ESTAR_FIELD_MAPS } from '../estar-field-map';
import { fillEstarSubmission } from '../estar-fill';
import { readXfaDatasetsValues } from '../../../forms/fill-official-pdf';
import type { RequestDb } from '../../../../db/requestDb';
import { clientWorkspaces, fda510kProjects, organizations, projects } from '../../../../../shared/schema';
import { regulatoryPrograms } from '../../../../../shared/schema/programs';
import { estarRegistrations } from '../../../../../shared/schema/estar-registration';

// The Phase 3 homes (which key lives on which store, declaredSource, the
// loader's column lists, the new homes reaching their SOM paths) are pinned in
// ./estar-administrative-data.governed-homes.test.ts.

const DEVICE_MAP = ESTAR_FIELD_MAPS['510k-device'];

/** A fully populated set of governed records — every one of the 20 mapped keys has a value. */
function fullInputs(): EstarAdministrativeInputs {
  return {
    program: {
      productName: 'AcuSense CGM System',
      productCode: 'NBW',
      predicateDevices: [{ id: 'p1', name: 'Predicate One', kNumber: 'K203456' }],
      commonName: 'Continuous glucose monitor',
      classificationName: 'Glucose test system',
      regulationNumber: '21 CFR 862.1355',
      associatedProductCodes: 'QBJ, MDS',
      indicationsForUseCitation: 'Attachment 4, page 1',
    },
    organization: { name: 'Concept2Cure, Inc.' },
    registration: {
      correspondentCompanyName: 'Regulatory Partners LLC',
      correspondentContactEmail: 'corr@partners.example',
      correspondentTelephone: '+1 555 0199',
      // The Declaration of Conformity's name and address are ONE entity's, so a
      // fully populated set holds both on this row — the address alone resolves
      // to nothing (see the DoC-pair cases in
      // ./estar-administrative-data.governed-homes.test.ts).
      declarationCompanyName: 'Declaring Entity GmbH',
      declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
    },
    workspace: { name: 'Acme Devices', contactEmail: 'ra@acme.example', contactPhone: '+1 555 0100' },
    fda510kProject: { deviceName: 'AcuSense (GA row)', regulationNumber: '862.1355', productCode: 'QBJ' },
  };
}

/** What projecting fullInputs() must yield: key → [value, store.column]. */
const FULL_PROJECTION: Record<string, [string, string]> = {
  deviceTradeName: ['AcuSense CGM System', 'regulatory_programs.product_name'],
  deviceCommonName: ['Continuous glucose monitor', 'regulatory_programs.common_name'],
  deviceClassificationName: ['Glucose test system', 'regulatory_programs.classification_name'],
  regulationNumber: ['21 CFR 862.1355', 'regulatory_programs.regulation_number'],
  productCodes: ['NBW', 'regulatory_programs.product_code'],
  associatedProductCodes: ['QBJ, MDS', 'regulatory_programs.associated_product_codes'],
  applicantCompanyName: ['Acme Devices', 'client_workspaces.name'],
  applicantContactEmail: ['ra@acme.example', 'client_workspaces.contact_email'],
  applicantContactTelephone: ['+1 555 0100', 'client_workspaces.contact_phone'],
  applicantSummaryEmail: ['ra@acme.example', 'client_workspaces.contact_email'],
  correspondentCompanyName: ['Regulatory Partners LLC', 'estar_registrations.correspondent_company_name'],
  correspondentContactEmail: ['corr@partners.example', 'estar_registrations.correspondent_contact_email'],
  correspondentTelephone: ['+1 555 0199', 'estar_registrations.correspondent_telephone'],
  correspondentSummaryEmail: ['corr@partners.example', 'estar_registrations.correspondent_contact_email'],
  predicateSubmissionNumber: ['K203456', 'regulatory_programs.predicate_devices[0].kNumber'],
  predicateDeviceTradeName: ['Predicate One', 'regulatory_programs.predicate_devices[0].name'],
  declarationCompanyName: ['Declaring Entity GmbH', 'estar_registrations.declaration_company_name'],
  declarationCompanyAddress: ['1 Device Way, Boston, MA 02110', 'estar_registrations.declaration_company_address'],
  declarationDeviceTradeName: ['AcuSense CGM System', 'regulatory_programs.product_name'],
  indicationsForUseCitation: ['Attachment 4, page 1', 'regulatory_programs.indications_for_use_citation'],
};

describe('ESTAR_ADMINISTRATIVE_SOURCES — the reviewable table', () => {
  it('declares a source-or-none for EVERY key of the 510k-device field map (and the IVD map)', () => {
    for (const key of Object.keys(DEVICE_MAP)) {
      expect(ESTAR_ADMINISTRATIVE_SOURCES, `missing declaration for "${key}"`).toHaveProperty(key);
    }
    for (const key of Object.keys(ESTAR_FIELD_MAPS['510k-ivd'])) {
      expect(ESTAR_ADMINISTRATIVE_SOURCES, `missing declaration for "${key}"`).toHaveProperty(key);
    }
  });

  it('names no key the device field map does not have (no orphan sources)', () => {
    for (const key of Object.keys(ESTAR_ADMINISTRATIVE_SOURCES)) {
      expect(DEVICE_MAP, `"${key}" is declared but not mapped`).toHaveProperty(key);
    }
  });

  it('every declared source (and fallback) has a reader — projecting full inputs does not throw', () => {
    expect(() => projectEstarAdministrativeData(fullInputs())).not.toThrow();
  });

  it('no null (user-supplied-only) source remains for any key of the 510k-device or 510k-ivd map', () => {
    for (const descriptorId of ['510k-device', '510k-ivd'] as const) {
      for (const key of Object.keys(ESTAR_FIELD_MAPS[descriptorId])) {
        expect(ESTAR_ADMINISTRATIVE_SOURCES[key], `${descriptorId}.${key} has no governed home`).not.toBeNull();
      }
    }
    expect(Object.values(ESTAR_ADMINISTRATIVE_SOURCES).filter((v) => v === null)).toEqual([]);
  });
});

describe('projectEstarAdministrativeData — never invents', () => {
  it('projects every governed value with store.column provenance', () => {
    const { values, provenance } = projectEstarAdministrativeData(fullInputs());
    expect(values).toEqual(Object.fromEntries(Object.entries(FULL_PROJECTION).map(([k, [v]]) => [k, v])));
    expect(provenance).toEqual(Object.fromEntries(Object.entries(FULL_PROJECTION).map(([k, [, p]]) => [k, p])));
    // Every value has provenance and vice versa, and every mapped key is covered.
    expect(Object.keys(provenance).sort()).toEqual(Object.keys(values).sort());
    expect(Object.keys(values).sort()).toEqual(Object.keys(DEVICE_MAP).sort());
  });

  it('absent inputs ⇒ absent keys (never "")', () => {
    expect(projectEstarAdministrativeData({})).toEqual({ values: {}, provenance: {} });
    expect(
      projectEstarAdministrativeData({ program: null, organization: null, workspace: null, fda510kProject: null }),
    ).toEqual({ values: {}, provenance: {} });
  });

  it('an empty program ⇒ no predicate keys; "" and whitespace at the source ⇒ absent', () => {
    const { values } = projectEstarAdministrativeData({
      program: { productName: '   ', productCode: '', predicateDevices: [] },
      organization: { name: '' },
      workspace: { name: ' ', contactEmail: '', contactPhone: null },
      fda510kProject: { deviceName: '', regulationNumber: '  ', productCode: null },
    });
    expect(values).toEqual({});
    expect(Object.values(values)).not.toContain('');
  });

  it('a predicate without a kNumber yields only its name; a malformed list yields nothing', () => {
    const named = projectEstarAdministrativeData({ program: { predicateDevices: [{ id: 'p', name: 'Only Name' }] } });
    expect(named.values).toEqual({ predicateDeviceTradeName: 'Only Name' });
    expect(named.provenance.predicateDeviceTradeName).toBe('regulatory_programs.predicate_devices[0].name');

    const asJson = projectEstarAdministrativeData({
      program: { predicateDevices: JSON.stringify([{ id: 'p', name: 'Parsed', kNumber: 'K1' }]) },
    });
    expect(asJson.values.predicateSubmissionNumber).toBe('K1');

    for (const bad of ['not json', { id: 'x' }, 42, null, [null], ['string']]) {
      const r = projectEstarAdministrativeData({ program: { predicateDevices: bad } });
      expect(r.values.predicateSubmissionNumber).toBeUndefined();
      expect(r.values.predicateDeviceTradeName).toBeUndefined();
    }
  });

  it('never derives a contact from anything but the workspace (no org-level e-mail or phone)', () => {
    const { values } = projectEstarAdministrativeData({
      organization: { name: 'Org Only' },
      fda510kProject: { deviceName: 'GA Device' },
    });
    expect(values.applicantContactEmail).toBeUndefined();
    expect(values.applicantContactTelephone).toBeUndefined();
    expect(values.applicantSummaryEmail).toBeUndefined();
  });

});

describe('projectEstarAdministrativeData — fallback order', () => {
  {
    it('deviceTradeName: program.product_name wins; fda_510k_projects.device_name only when it is absent', () => {
      const primary = projectEstarAdministrativeData({
        program: { productName: 'Program Name' },
        fda510kProject: { deviceName: 'GA Name' },
      });
      expect(primary.values.deviceTradeName).toBe('Program Name');
      expect(primary.provenance.deviceTradeName).toBe('regulatory_programs.product_name');
      expect(primary.values.declarationDeviceTradeName).toBe('Program Name');

      const fallback = projectEstarAdministrativeData({
        program: { productName: '' },
        fda510kProject: { deviceName: 'GA Name' },
      });
      expect(fallback.values.deviceTradeName).toBe('GA Name');
      expect(fallback.provenance.deviceTradeName).toBe('fda_510k_projects.device_name');
      expect(fallback.provenance.declarationDeviceTradeName).toBe('fda_510k_projects.device_name');

      const neither = projectEstarAdministrativeData({ program: {}, fda510kProject: {} });
      expect(neither.values.deviceTradeName).toBeUndefined();
    });

    it('productCodes: program.product_code wins; fda_510k_projects.product_code only when it is absent', () => {
      const primary = projectEstarAdministrativeData({
        program: { productCode: 'NBW' },
        fda510kProject: { productCode: 'QBJ' },
      });
      expect(primary.values.productCodes).toBe('NBW');
      expect(primary.provenance.productCodes).toBe('regulatory_programs.product_code');

      const fallback = projectEstarAdministrativeData({
        program: { productCode: null },
        fda510kProject: { productCode: 'QBJ' },
      });
      expect(fallback.values.productCodes).toBe('QBJ');
      expect(fallback.provenance.productCodes).toBe('fda_510k_projects.product_code');
    });

    it('applicant/declaration company: the anchor workspace wins; organizations.name only without one', () => {
      const withWorkspace = projectEstarAdministrativeData({
        organization: { name: 'The Org' },
        workspace: { name: 'The Workspace' },
      });
      expect(withWorkspace.values.applicantCompanyName).toBe('The Workspace');
      expect(withWorkspace.values.declarationCompanyName).toBe('The Workspace');
      expect(withWorkspace.provenance.applicantCompanyName).toBe('client_workspaces.name');

      const noAnchor = projectEstarAdministrativeData({ organization: { name: 'The Org' }, workspace: null });
      expect(noAnchor.values.applicantCompanyName).toBe('The Org');
      expect(noAnchor.provenance.applicantCompanyName).toBe('organizations.name');
      expect(noAnchor.provenance.declarationCompanyName).toBe('organizations.name');
    });

    it('trims the stored value but never manufactures one', () => {
      const r = projectEstarAdministrativeData({ program: { productName: '  Padded  ' } });
      expect(r.values.deviceTradeName).toBe('Padded');
    });
  }
});

describe('resolveOfficialEstarFields — governed wins, request fills gaps, the rest is reported', () => {
  const governed = projectEstarAdministrativeData({
    program: { productName: 'Program Name' },
    organization: { name: 'The Org' },
  });

  it('governed wins over a colliding request value, and the collision is reported', () => {
    const r = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed,
      requestData: { deviceTradeName: 'Client Says Otherwise' },
      honourRequestOverGoverned: false,
    });
    expect(r.data.deviceTradeName).toBe('Program Name');
    expect(r.fields.find((f) => f.key === 'deviceTradeName')).toMatchObject({
      value: 'Program Name',
      source: 'regulatory_programs.product_name',
    });
    expect(r.ignoredRequestKeys).toEqual(['deviceTradeName']);
  });

  it('a request value fills ONLY a key with no governed value, with source "request"', () => {
    const r = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed,
      requestData: { deviceCommonName: 'Continuous glucose monitor' },
      honourRequestOverGoverned: false,
    });
    expect(r.data.deviceCommonName).toBe('Continuous glucose monitor');
    expect(r.fields.find((f) => f.key === 'deviceCommonName')).toMatchObject({
      value: 'Continuous glucose monitor',
      source: 'request',
    });
    expect(r.ignoredRequestKeys).toEqual([]);
  });

  it('unknown request keys are dropped from the data and reported', () => {
    const r = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed,
      requestData: { deviceName: 'legacy key', applicantName: 'legacy key' },
      honourRequestOverGoverned: false,
    });
    expect(r.data).not.toHaveProperty('deviceName');
    expect(r.data).not.toHaveProperty('applicantName');
    expect(r.ignoredRequestKeys.sort()).toEqual(['applicantName', 'deviceName']);
  });

  it('an empty / non-string request value is not written, and is reported', () => {
    const r = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed,
      requestData: { deviceCommonName: '   ', regulationNumber: 42 },
      honourRequestOverGoverned: false,
    });
    expect(r.data).not.toHaveProperty('deviceCommonName');
    expect(r.data).not.toHaveProperty('regulationNumber');
    expect(r.ignoredRequestKeys.sort()).toEqual(['deviceCommonName', 'regulationNumber']);
  });

  it('emits one row per mapped key, in field-map order, with caption + SOM path; a blank key is null/null but still names its declared home', () => {
    const r = resolveOfficialEstarFields({ fieldMap: DEVICE_MAP, governed, honourRequestOverGoverned: false });
    expect(r.fields.map((f) => f.key)).toEqual(Object.keys(DEVICE_MAP));
    const blank = r.fields.find((f) => f.key === 'indicationsForUseCitation')!;
    expect(blank).toEqual({
      key: 'indicationsForUseCitation',
      caption: DEVICE_MAP.indicationsForUseCitation.caption,
      xfaSomPath: DEVICE_MAP.indicationsForUseCitation.xfaSomPath,
      value: null,
      source: null,
      declaredSource: 'regulatory_programs.indications_for_use_citation',
      // The template does not recompute this cell, so nothing takes it away.
      rebuildOutcome: 'reproduces',
      rebuildNote: null,
    });
    // `data` carries exactly the written keys — nothing blank, nothing extra.
    expect(Object.keys(r.data).sort()).toEqual(
      r.fields.filter((f) => f.value !== null).map((f) => f.key).sort(),
    );
  });
});

describe('reportOfficialEstarFill — what was actually written', () => {
  it('reads filled/blank off the fill result, not off whether a value existed', () => {
    const resolved = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed: projectEstarAdministrativeData({ program: { productName: 'P', productCode: 'C' } }),
      requestData: { deviceCommonName: 'common', bogus: 'x' },
      honourRequestOverGoverned: false,
    });
    // The template "skipped" productCodes even though a value existed.
    const { fieldReport, fieldSources } = reportOfficialEstarFill(resolved, [
      'deviceTradeName',
      'declarationDeviceTradeName',
      'deviceCommonName',
    ]);
    expect(fieldReport.mappedCount).toBe(Object.keys(DEVICE_MAP).length);
    expect(fieldReport.filledCount).toBe(3);
    expect(fieldReport.blankCount).toBe(Object.keys(DEVICE_MAP).length - 3);
    expect(fieldReport.blankKeys).toContain('productCodes');
    expect(fieldReport.fields.find((f) => f.key === 'productCodes')).toEqual({
      key: 'productCodes',
      caption: 'Product Code(s)',
      filled: false,
      source: null,
      // Blank on the form, but the report still says where the durable home is.
      declaredSource: 'regulatory_programs.product_code',
    });
    expect(fieldReport.ignoredRequestKeys).toEqual(['bogus']);
    expect(fieldSources).toEqual({
      deviceTradeName: 'regulatory_programs.product_name',
      declarationDeviceTradeName: 'regulatory_programs.product_name',
      deviceCommonName: 'request',
    });
  });

  it('a request value the template then skipped is reported as ignored, not merely blank (the caller’s value was dropped)', () => {
    const resolved = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed: projectEstarAdministrativeData({}),
      requestData: { deviceCommonName: 'common', correspondentCompanyName: 'Corr Co', bogus: 'x' },
      honourRequestOverGoverned: false,
    });
    // Resolution accepted both mapped request keys; only the unmapped one is ignored so far.
    expect(resolved.ignoredRequestKeys).toEqual(['bogus']);
    // The template wrote deviceCommonName but skipped correspondentCompanyName: resolution's
    // list first, then the skipped request key — the caller learns its value was dropped.
    const { fieldReport, fieldSources } = reportOfficialEstarFill(resolved, ['deviceCommonName']);
    expect(fieldReport.fields.find((f) => f.key === 'correspondentCompanyName')).toMatchObject({ filled: false, source: null });
    expect(fieldReport.ignoredRequestKeys).toEqual(['bogus', 'correspondentCompanyName']);
    expect(fieldSources).toEqual({ deviceCommonName: 'request' });
    expect(resolved.ignoredRequestKeys, 'input not mutated').toEqual(['bogus']);
    // A key resolution already listed is listed once, in its original position.
    const alreadyListed = { ...resolved, ignoredRequestKeys: ['correspondentCompanyName', 'bogus'] };
    expect(reportOfficialEstarFill(alreadyListed, ['deviceCommonName']).fieldReport.ignoredRequestKeys).toEqual(['correspondentCompanyName', 'bogus']);
    // A GOVERNED value the template skipped is blank but is not a request key, so it is not listed.
    const governedOnly = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed: projectEstarAdministrativeData({ program: { productName: 'P' } }),
      honourRequestOverGoverned: false,
    });
    expect(reportOfficialEstarFill(governedOnly, []).fieldReport.ignoredRequestKeys).toEqual([]);
  });
});

// ── DB loader against a fake Drizzle client ──────────────────────────────────

type Table = object;
interface FakeDbOptions {
  rows: Map<Table, unknown[]>;
  /** Throw `error` for any select `when(table, selection)` matches. */
  trap?: { when: (table: Table, selection: Record<string, unknown>) => boolean; error: unknown };
}

/** One recorded select; `orderBy` holds the `.orderBy(...)` arguments, undefined when the query did not order. */
type FakeQuery = { table: Table; where: unknown; orderBy?: unknown[] };

function fakeDb(opts: FakeDbOptions): RequestDb & { queries: FakeQuery[] } {
  const queries: FakeQuery[] = [];
  const db = {
    queries,
    select: (fields: Record<string, unknown>) => ({
      from: (table: Table) => ({
        where: (where: unknown) => {
          const q: FakeQuery = { table, where };
          const limit = async () => {
            queries.push(q);
            if (opts.trap?.when(table, fields)) throw opts.trap.error;
            return opts.rows.get(table) ?? [];
          };
          const orderBy = (...order: unknown[]) => { q.orderBy = order; return { limit }; };
          return { limit, orderBy };
        },
      }),
    }),
  };
  return db as unknown as RequestDb & { queries: typeof queries };
}

describe('loadEstarAdministrativeInputs', () => {
  const programRow = { productName: 'Program Name', productCode: 'NBW', predicateDevices: [], commonName: 'Common', regulationNumber: null };
  const orgRow = { name: 'The Org' };
  const regRow = { correspondentCompanyName: 'Corr Co', correspondentContactEmail: null, declarationCompanyAddress: '1 Device Way' };
  const wsRow = { name: 'The Workspace', contactEmail: 'ra@ws.example', contactPhone: null };
  const fdaRow = { deviceName: 'GA Device', regulationNumber: '862.1355', productCode: null, projectId: 77 };

  it('numeric ident: fda row → its project (workspace) → the project’s program; plus the org’s registration row', async () => {
    const db = fakeDb({
      rows: new Map<Table, unknown[]>([
        [fda510kProjects, [fdaRow]],
        [projects, [{ id: 77, clientWorkspaceId: 5, regulatoryProgramId: 'prog-uuid' }]],
        [regulatoryPrograms, [programRow]],
        [organizations, [orgRow]],
        [estarRegistrations, [regRow]],
        [clientWorkspaces, [wsRow]],
      ]),
    });
    const r = await loadEstarAdministrativeInputs(db, { organizationId: 2, programUuid: null, fda510kProjectId: 33 });
    expect(r).toEqual({
      program: programRow,
      organization: orgRow,
      registration: regRow,
      workspace: wsRow,
      fda510kProject: { deviceName: 'GA Device', regulationNumber: '862.1355', productCode: null },
    });
    // Every read carried a where-clause (org-scoped predicates are built there).
    expect(db.queries.every((q) => q.where !== undefined)).toBe(true);
  });

  it('uuid ident: program → anchor project (workspace) → the fda row on that project', async () => {
    const db = fakeDb({
      rows: new Map<Table, unknown[]>([
        [projects, [{ id: 77, clientWorkspaceId: 5 }]],
        [fda510kProjects, [fdaRow]],
        [regulatoryPrograms, [programRow]],
        [organizations, [orgRow]],
        [clientWorkspaces, [wsRow]],
      ]),
    });
    const r = await loadEstarAdministrativeInputs(db, { organizationId: 2, programUuid: 'prog-uuid', fda510kProjectId: null });
    expect(r.program).toEqual(programRow);
    expect(r.workspace).toEqual(wsRow);
    expect(r.fda510kProject).toEqual({ deviceName: 'GA Device', regulationNumber: '862.1355', productCode: null });
  });

  it('a missing projects.regulatory_program_id column (42703) is "no anchor", never a throw', async () => {
    const undefinedColumn = Object.assign(new Error('column "regulatory_program_id" does not exist'), { code: '42703' });
    // uuid path: the anchor lookup is the projects query whose WHERE names the missing column.
    const byUuid = fakeDb({
      rows: new Map<Table, unknown[]>([
        [regulatoryPrograms, [programRow]],
        [organizations, [orgRow]],
        [fda510kProjects, [fdaRow]],
        [projects, [{ id: 77, clientWorkspaceId: 5 }]],
      ]),
      trap: { when: (table) => table === projects, error: undefinedColumn },
    });
    const r1 = await loadEstarAdministrativeInputs(byUuid, { organizationId: 2, programUuid: 'prog-uuid', fda510kProjectId: null });
    expect(r1.program).toEqual(programRow);
    expect(r1.organization).toEqual(orgRow);
    expect(r1.workspace).toBeNull();
    expect(r1.fda510kProject).toBeNull();

    // numeric path: the fda row and its project resolve; only the program link is unreadable.
    const byNumber = fakeDb({
      rows: new Map<Table, unknown[]>([
        [fda510kProjects, [fdaRow]],
        [projects, [{ id: 77, clientWorkspaceId: 5 }]],
        [regulatoryPrograms, [programRow]],
        [organizations, [orgRow]],
        [clientWorkspaces, [wsRow]],
      ]),
      // numeric path: only the SELECT that names the column fails; id + workspace still read.
      trap: {
        when: (_table, selection) => Object.values(selection).includes(projects.regulatoryProgramId),
        error: undefinedColumn,
      },
    });
    const r2 = await loadEstarAdministrativeInputs(byNumber, { organizationId: 2, programUuid: null, fda510kProjectId: 33 });
    expect(r2.program).toBeNull();
    expect(r2.workspace).toEqual(wsRow);
    expect(r2.fda510kProject?.deviceName).toBe('GA Device');
  });

  it('any other database error propagates (fail closed, never a silent blank form)', async () => {
    const db = fakeDb({
      rows: new Map(),
      trap: { when: (table) => table === projects, error: Object.assign(new Error('boom'), { code: '57014' }) },
    });
    await expect(
      loadEstarAdministrativeInputs(db, { organizationId: 2, programUuid: 'prog-uuid', fda510kProjectId: null }),
    ).rejects.toThrow('boom');
  });

  it('nothing resolvable ⇒ only the organization row (no workspace, no program, no fda row, no registration)', async () => {
    const db = fakeDb({ rows: new Map<Table, unknown[]>([[organizations, [orgRow]]]) });
    const r = await loadEstarAdministrativeInputs(db, { organizationId: 2, programUuid: null, fda510kProjectId: 33 });
    expect(r).toEqual({ program: null, organization: orgRow, registration: null, workspace: null, fda510kProject: null });
  });
});

describe('loadEstarAdministrativeInputs — the anchor row is chosen deterministically', () => {
  it('uuid ident: the anchor lookup is ORDERED BY projects.id — regulatory_program_id is not unique, so LIMIT 1 alone is arbitrary', async () => {
    const db = fakeDb({ rows: new Map<Table, unknown[]>([[projects, [{ id: 77, clientWorkspaceId: 5 }]]]) });
    await loadEstarAdministrativeInputs(db, { organizationId: 2, programUuid: 'prog-uuid', fda510kProjectId: null });
    const anchorLookup = db.queries.find((q) => q.table === projects);
    expect(anchorLookup?.orderBy, 'ORDER BY is present on the anchor lookup').toHaveLength(1);
    // asc(projects.id): the ordering names the id column, ascending — the same
    // row ensureProgramProjectAnchor's `ORDER BY id LIMIT 1` links to.
    const chunks = (anchorLookup!.orderBy![0] as { queryChunks: Array<{ value?: unknown }> }).queryChunks;
    expect(chunks).toContain(projects.id);
    expect(chunks.map((c) => (Array.isArray(c?.value) ? c.value.join('') : '')).join('')).toMatch(/\basc\b/);
    // (the rows for regulatory_programs / organizations are irrelevant here and left empty)
  });
});

// ── The real vendored nIVD template ──────────────────────────────────────────
//
// Skipped when the official template is absent (the drop-point may be pointed
// out of tree — see assets/estar-templates/README.md), like estar-fill.test.ts.

const NIVD_TEMPLATE = path.resolve(process.cwd(), 'assets/estar-templates', 'eSTAR-510k-non-ivd.pdf');

describe.skipIf(!fsSync.existsSync(NIVD_TEMPLATE))(
  'governed values reach their SOM paths in the official nIVD eSTAR v7.0',
  () => {
    const REAL_DIR = path.dirname(NIVD_TEMPLATE);
    let dirBefore: string | undefined;
    beforeAll(() => {
      dirBefore = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = REAL_DIR;
    });
    afterAll(() => {
      if (dirBefore === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = dirBefore;
    });

    it('writes every one of the 20 governed values at its mapped path — none is user-supplied-only any more', async () => {
      const governed = projectEstarAdministrativeData(fullInputs());
      const resolved = resolveOfficialEstarFields({
        fieldMap: DEVICE_MAP,
        governed,
        requestData: { deviceCommonName: 'ignored', deviceTradeName: 'ignored' },
        honourRequestOverGoverned: false,
      });
      const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: resolved.data });
      expect(r.filled).toBe(true);
      expect(r.templateKind).toBe('dynamic-xfa');
      expect(r.blockers).toEqual([]);

      const paths = Object.values(DEVICE_MAP).map((s) => s.xfaSomPath!);
      const back = await readXfaDatasetsValues(r.pdfBytes!, paths);
      for (const [key, [value]] of Object.entries(FULL_PROJECTION)) {
        expect(back[DEVICE_MAP[key].xfaSomPath!], `${key} @ ${DEVICE_MAP[key].xfaSomPath}`).toBe(value);
      }
      // The governed values, not the colliding request values, are in the form.
      expect(back[DEVICE_MAP.deviceTradeName.xfaSomPath!]).toBe('AcuSense CGM System');
      expect(back[DEVICE_MAP.deviceCommonName.xfaSomPath!]).toBe('Continuous glucose monitor');

      const { fieldReport } = reportOfficialEstarFill(resolved, r.filledFields);
      expect(fieldReport.filledCount).toBe(20);
      expect(fieldReport.blankCount).toBe(0);
      expect(fieldReport.ignoredRequestKeys).toEqual(['deviceCommonName', 'deviceTradeName']);
    });
  },
);

describe('predicate devices beyond the first', () => {
  it('writes the first predicate and SAYS the others were not written', () => {
    // The mapped predicate fields hold one device, and the program's list has
    // no primary designation. The first was written and the rest dropped
    // silently; a sponsor with a reference device entered first read a filled
    // form naming the wrong predicate and nothing else.
    const r = projectEstarAdministrativeData({
      program: {
        predicateDevices: [
          { id: 'p1', name: 'Primary Predicate', kNumber: 'K203456' },
          { id: 'p2', name: 'Reference Device', kNumber: 'K198765' },
        ],
      },
    });
    expect(r.values.predicateSubmissionNumber).toBe('K203456');
    expect(r.advisories).toHaveLength(1);
    expect(r.advisories![0]).toMatch(/2 predicate devices are on file/);
    expect(r.advisories![0]).toContain('K203456');
  });

  it('a single predicate raises no advisory', () => {
    const r = projectEstarAdministrativeData({
      program: { predicateDevices: [{ id: 'p1', name: 'Only One', kNumber: 'K1' }] },
    });
    expect(r.advisories).toBeUndefined();
  });

  it('the advisory reaches the field report', () => {
    const governed = projectEstarAdministrativeData({
      program: { predicateDevices: [{ id: 'a', kNumber: 'K1' }, { id: 'b', kNumber: 'K2' }] },
    });
    const resolved = resolveOfficialEstarFields({
      fieldMap: { predicateSubmissionNumber: { xfaSomPath: 'root.x', type: 'text', caption: 'Predicate' } },
      governed,
    });
    const { fieldReport } = reportOfficialEstarFill(resolved, ['predicateSubmissionNumber']);
    expect(fieldReport.advisories).toHaveLength(1);
    expect(fieldReport.advisories[0]).toMatch(/only the first \(K1\)/);
  });
});
