/**
 * WO-8 Phase 3 — every administrative field of the official eSTAR has a
 * governed, audited home.
 *
 * Pins, for estar-administrative-data.ts:
 *   - WHICH store.column each Phase 3 key lives on (device facts on
 *     regulatory_programs, correspondent / Declaration of Conformity facts on
 *     estar_registrations), and the regulationNumber fallback order;
 *   - `declaredSource` — the PRIMARY home a resolved field names whether its
 *     value is governed, a fallback, request-supplied or blank, and null only
 *     for a key the table does not declare;
 *   - the loader's column lists (the five program columns, the five
 *     registration columns, org-scoped);
 *   - the Declaration of Conformity's name/address pair: both off the ONE
 *     registration row, with the pre-existing workspace → organization
 *     resolution kept behind the name so nothing already filed changes;
 *   - a partial fill of the REAL vendored nIVD template: the new homes reach
 *     their SOM paths and the blank ones stay unwritten, each naming its home.
 *
 * The module's general contract (never invents, governed wins, the report
 * reads off the fill result, the loader's anchor rules) stays in
 * ./estar-administrative-data.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fsSync from 'fs';
import path from 'path';
import {
  ESTAR_ADMINISTRATIVE_SOURCES,
  declaredSourceFor,
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
import { projects } from '../../../../../shared/schema';
import { regulatoryPrograms } from '../../../../../shared/schema/programs';
import { estarRegistrations } from '../../../../../shared/schema/estar-registration';

const DEVICE_MAP = ESTAR_FIELD_MAPS['510k-device'];

const home = (k: string) => `${ESTAR_ADMINISTRATIVE_SOURCES[k]!.store}.${ESTAR_ADMINISTRATIVE_SOURCES[k]!.column}`;

describe('the Phase 3 homes', () => {
  it.each([
    ['deviceCommonName', 'regulatory_programs.common_name'],
    ['deviceClassificationName', 'regulatory_programs.classification_name'],
    ['regulationNumber', 'regulatory_programs.regulation_number'],
    ['associatedProductCodes', 'regulatory_programs.associated_product_codes'],
    ['indicationsForUseCitation', 'regulatory_programs.indications_for_use_citation'],
    ['correspondentCompanyName', 'estar_registrations.correspondent_company_name'],
    ['correspondentContactEmail', 'estar_registrations.correspondent_contact_email'],
    ['correspondentSummaryEmail', 'estar_registrations.correspondent_contact_email'],
    ['correspondentTelephone', 'estar_registrations.correspondent_telephone'],
    ['declarationCompanyName', 'estar_registrations.declaration_company_name'],
    ['declarationCompanyAddress', 'estar_registrations.declaration_company_address'],
  ])('%s lives on %s', (key, expected) => {
    expect(home(key)).toBe(expected);
    expect(declaredSourceFor(key)).toBe(expected);
  });

  it('regulationNumber keeps the GA row as a fallback only', () => {
    expect(ESTAR_ADMINISTRATIVE_SOURCES.regulationNumber!.fallback).toEqual({
      store: 'fda_510k_projects',
      column: 'regulation_number',
    });
  });

  it('the DoC name falls back to the workspace then the organization — in that order, neither dropped', () => {
    expect(ESTAR_ADMINISTRATIVE_SOURCES.declarationCompanyName!.fallback).toEqual([
      { store: 'client_workspaces', column: 'name' },
      { store: 'organizations', column: 'name' },
    ]);
  });

  it('declaredSourceFor is null for a key the table does not declare (never a guessed home)', () => {
    expect(declaredSourceFor('deviceTradeName')).toBe('regulatory_programs.product_name');
    expect(declaredSourceFor('deviceName')).toBeNull();
  });
});

describe('projecting the Phase 3 homes', () => {
  it('a registration row alone yields exactly the correspondent/declaration keys; an empty one yields nothing', () => {
    const r = projectEstarAdministrativeData({
      registration: { correspondentCompanyName: 'Corr Co', correspondentContactEmail: 'c@corr.example' },
    });
    expect(r.values).toEqual({
      correspondentCompanyName: 'Corr Co',
      correspondentContactEmail: 'c@corr.example',
      correspondentSummaryEmail: 'c@corr.example',
    });
    expect(r.provenance.correspondentSummaryEmail).toBe('estar_registrations.correspondent_contact_email');
    expect(
      projectEstarAdministrativeData({
        registration: { correspondentCompanyName: ' ', correspondentContactEmail: '', correspondentTelephone: null },
      }).values,
    ).toEqual({});
  });

  it('regulationNumber: program.regulation_number wins; fda_510k_projects.regulation_number only when it is absent', () => {
    const primary = projectEstarAdministrativeData({
      program: { regulationNumber: '21 CFR 862.1355' },
      fda510kProject: { regulationNumber: '862.1355' },
    });
    expect(primary.values.regulationNumber).toBe('21 CFR 862.1355');
    expect(primary.provenance.regulationNumber).toBe('regulatory_programs.regulation_number');

    const fallback = projectEstarAdministrativeData({
      program: { regulationNumber: '  ' },
      fda510kProject: { regulationNumber: '862.1355' },
    });
    expect(fallback.values.regulationNumber).toBe('862.1355');
    expect(fallback.provenance.regulationNumber).toBe('fda_510k_projects.regulation_number');

    expect(projectEstarAdministrativeData({ program: {}, fda510kProject: {} }).values.regulationNumber).toBeUndefined();
  });
});

/**
 * The Declaration of Conformity is a signed statement by ONE legal entity, so
 * its company NAME and company ADDRESS must name the same company. The address
 * lives on estar_registrations; the name used to be read from
 * client_workspaces.name (a store with no address at all), so an org filing for
 * several clients — what client workspaces exist to model — got one entity's
 * name beside another entity's address on a signed form. The name now leads
 * from the same row, with the old two-step resolution kept behind it so an org
 * that has not filled it in is unchanged.
 */
describe('declarationCompanyName — the DoC names one legal entity', () => {
  const WORKSPACE = { name: 'Client Workspace Ltd' };
  const ORG = { name: 'Concept2Cure, Inc.' };

  it('the registration name wins over the workspace and the organization, and pairs with the address on that row', () => {
    const r = projectEstarAdministrativeData({
      registration: {
        declarationCompanyName: 'Declaring Entity GmbH',
        declarationCompanyAddress: '1 Device Way, Boston, MA 02110',
      },
      workspace: WORKSPACE,
      organization: ORG,
    });
    expect(r.values.declarationCompanyName).toBe('Declaring Entity GmbH');
    expect(r.provenance.declarationCompanyName).toBe('estar_registrations.declaration_company_name');
    // The point of the column: name and address come off ONE row, so they
    // cannot describe two different legal entities.
    expect(r.provenance.declarationCompanyAddress).toBe('estar_registrations.declaration_company_address');
    // The APPLICANT is still the workspace — the two keys are different facts.
    expect(r.values.applicantCompanyName).toBe('Client Workspace Ltd');
  });

  it('a blank or whitespace registration name falls through to the workspace — never an empty string', () => {
    for (const declarationCompanyName of ['', '   ', null, undefined]) {
      const r = projectEstarAdministrativeData({
        registration: { declarationCompanyName, declarationCompanyAddress: '1 Device Way' },
        workspace: WORKSPACE,
        organization: ORG,
      });
      expect(r.values.declarationCompanyName).toBe('Client Workspace Ltd');
      expect(r.provenance.declarationCompanyName).toBe('client_workspaces.name');
    }
  });

  it('with no registration name and no workspace it is the organization name — the second fallback is not dropped', () => {
    const r = projectEstarAdministrativeData({ registration: {}, organization: ORG });
    expect(r.values.declarationCompanyName).toBe('Concept2Cure, Inc.');
    expect(r.provenance.declarationCompanyName).toBe('organizations.name');

    const noRegistrationRow = projectEstarAdministrativeData({ organization: ORG });
    expect(noRegistrationRow.values.declarationCompanyName).toBe('Concept2Cure, Inc.');
    expect(noRegistrationRow.provenance.declarationCompanyName).toBe('organizations.name');
  });

  it('holds nothing when no store in the chain holds a name', () => {
    const r = projectEstarAdministrativeData({
      registration: { declarationCompanyName: ' ' },
      workspace: { name: '' },
      organization: { name: null },
    });
    expect(r.values.declarationCompanyName).toBeUndefined();
    expect(r.provenance.declarationCompanyName).toBeUndefined();
  });

  it('declaredSource stays the registration column at every step of the chain', () => {
    for (const input of [
      { registration: { declarationCompanyName: 'Declaring Entity GmbH' } },
      { workspace: WORKSPACE },
      { organization: ORG },
      {},
    ] as EstarAdministrativeInputs[]) {
      const r = resolveOfficialEstarFields({
        fieldMap: DEVICE_MAP,
        governed: projectEstarAdministrativeData(input),
        honourRequestOverGoverned: false,
      });
      const row = r.fields.find((f) => f.key === 'declarationCompanyName')!;
      expect(row.declaredSource).toBe('estar_registrations.declaration_company_name');
    }
  });
});

describe('resolveOfficialEstarFields — declaredSource names the governed home', () => {
  it('declaredSource is the PRIMARY home whatever the value came from — governed, fallback, request or blank', () => {
    const r = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed: projectEstarAdministrativeData({
        program: { productName: '' },
        fda510kProject: { deviceName: 'GA Name' },
        registration: { correspondentTelephone: '+1 555 0199' },
      }),
      requestData: { deviceCommonName: 'typed' },
      honourRequestOverGoverned: false,
    });
    const byKey = Object.fromEntries(r.fields.map((f) => [f.key, f]));
    // Fallback value: source names the fallback, declaredSource still the primary.
    expect(byKey.deviceTradeName).toMatchObject({
      value: 'GA Name',
      source: 'fda_510k_projects.device_name',
      declaredSource: 'regulatory_programs.product_name',
    });
    expect(byKey.correspondentTelephone).toMatchObject({
      value: '+1 555 0199',
      source: 'estar_registrations.correspondent_telephone',
      declaredSource: 'estar_registrations.correspondent_telephone',
    });
    expect(byKey.deviceCommonName).toMatchObject({
      value: 'typed',
      source: 'request',
      declaredSource: 'regulatory_programs.common_name',
    });
    expect(byKey.declarationCompanyAddress).toMatchObject({
      value: null,
      source: null,
      declaredSource: 'estar_registrations.declaration_company_address',
    });
    // Every mapped key of the device map has a declared home; none is null.
    expect(r.fields.filter((f) => f.declaredSource === null)).toEqual([]);
  });

  it('a mapped key the sources table does not declare has declaredSource null', () => {
    const r = resolveOfficialEstarFields({
      fieldMap: { deviceName: { acroField: 'DeviceName', type: 'text' } },
      governed: { values: {}, provenance: {} },
      requestData: { deviceName: 'Acme Monitor' },
      honourRequestOverGoverned: false,
    });
    expect(r.fields).toEqual([
      { key: 'deviceName', caption: 'deviceName', xfaSomPath: null, value: 'Acme Monitor', source: 'request', declaredSource: null },
    ]);
  });

  it('the fill report carries declaredSource on filled and blank rows alike', () => {
    const resolved = resolveOfficialEstarFields({
      fieldMap: DEVICE_MAP,
      governed: projectEstarAdministrativeData({ program: { commonName: 'Common' } }),
      honourRequestOverGoverned: false,
    });
    const { fieldReport } = reportOfficialEstarFill(resolved, ['deviceCommonName']);
    const byKey = Object.fromEntries(fieldReport.fields.map((f) => [f.key, f]));
    expect(byKey.deviceCommonName).toEqual({
      key: 'deviceCommonName',
      caption: 'Common Name',
      filled: true,
      source: 'regulatory_programs.common_name',
      declaredSource: 'regulatory_programs.common_name',
    });
    expect(byKey.correspondentCompanyName).toMatchObject({
      filled: false,
      source: null,
      declaredSource: 'estar_registrations.correspondent_company_name',
    });
  });
});

// ── The loader reads the new columns, org-scoped ─────────────────────────────

/** A minimal recording client: every select answers no rows and records what it selected. */
function recordingDb() {
  const reads: Array<{ table: object; selection: Record<string, unknown>; where: unknown }> = [];
  const db = {
    select: (selection: Record<string, unknown>) => ({
      from: (table: object) => ({
        where: (where: unknown) => {
          const limit = async () => {
            reads.push({ table, selection, where });
            return [];
          };
          return { limit, orderBy: () => ({ limit }) };
        },
      }),
    }),
  };
  return { db: db as unknown as RequestDb, reads };
}

describe('loadEstarAdministrativeInputs — the Phase 3 columns', () => {
  it('the program read names the five new columns and the registration read the five, org-scoped', async () => {
    const { db, reads } = recordingDb();
    await loadEstarAdministrativeInputs(db, { organizationId: 2, programUuid: 'prog-uuid', fda510kProjectId: null });
    const programRead = reads.find((q) => q.table === regulatoryPrograms);
    const registrationRead = reads.find((q) => q.table === estarRegistrations);
    expect(programRead, 'the program row is read').toBeDefined();
    expect(registrationRead, 'the org’s registration row is read').toBeDefined();
    for (const col of [
      regulatoryPrograms.commonName,
      regulatoryPrograms.classificationName,
      regulatoryPrograms.regulationNumber,
      regulatoryPrograms.associatedProductCodes,
      regulatoryPrograms.indicationsForUseCitation,
    ]) {
      expect(Object.values(programRead!.selection)).toContain(col);
    }
    for (const col of [
      estarRegistrations.correspondentCompanyName,
      estarRegistrations.correspondentContactEmail,
      estarRegistrations.correspondentTelephone,
      estarRegistrations.declarationCompanyName,
      estarRegistrations.declarationCompanyAddress,
    ]) {
      expect(Object.values(registrationRead!.selection)).toContain(col);
    }
    // Org-scoped: the registration's where-clause names organization_id.
    const whereChunks = (registrationRead!.where as { queryChunks: unknown[] }).queryChunks;
    expect(whereChunks).toContain(estarRegistrations.organizationId);
    // The anchor lookup still runs (and is the one that orders).
    expect(reads.some((q) => q.table === projects)).toBe(true);
  });

  it('the registration is read even when the ident resolves no program (it is an org-level fact)', async () => {
    const { db, reads } = recordingDb();
    const r = await loadEstarAdministrativeInputs(db, { organizationId: 2, programUuid: null, fda510kProjectId: 33 });
    expect(reads.some((q) => q.table === estarRegistrations)).toBe(true);
    expect(r.registration).toBeNull();
  });
});

// ── The real vendored nIVD template ──────────────────────────────────────────

const NIVD_TEMPLATE = path.resolve(process.cwd(), 'assets/estar-templates', 'eSTAR-510k-non-ivd.pdf');

describe.skipIf(!fsSync.existsSync(NIVD_TEMPLATE))(
  'the Phase 3 homes reach their SOM paths in the official nIVD eSTAR v7.0',
  () => {
    let dirBefore: string | undefined;
    beforeAll(() => {
      dirBefore = process.env.ESTAR_TEMPLATE_DIR;
      process.env.ESTAR_TEMPLATE_DIR = path.dirname(NIVD_TEMPLATE);
    });
    afterAll(() => {
      if (dirBefore === undefined) delete process.env.ESTAR_TEMPLATE_DIR;
      else process.env.ESTAR_TEMPLATE_DIR = dirBefore;
    });

    it('writes governed + request values at their paths and leaves blank keys unwritten, each naming its home', async () => {
      const partial: EstarAdministrativeInputs = {
        program: { productName: 'AcuSense CGM System', productCode: 'NBW', regulationNumber: '21 CFR 862.1355' },
        organization: { name: 'Concept2Cure, Inc.' },
        registration: { correspondentTelephone: '+1 555 0199', declarationCompanyAddress: '1 Device Way' },
      };
      const resolved = resolveOfficialEstarFields({
        fieldMap: DEVICE_MAP,
        governed: projectEstarAdministrativeData(partial),
        requestData: { deviceCommonName: 'Continuous glucose monitor', deviceTradeName: 'ignored' },
        honourRequestOverGoverned: false,
      });
      const r = await fillEstarSubmission({ type: '510k', variant: 'device', data: resolved.data });
      expect(r.filled).toBe(true);
      expect(r.blockers).toEqual([]);

      const back = await readXfaDatasetsValues(r.pdfBytes!, Object.values(DEVICE_MAP).map((s) => s.xfaSomPath!));
      for (const f of resolved.fields) {
        const at = back[f.xfaSomPath!];
        if (f.value !== null) expect(at, `${f.key} @ ${f.xfaSomPath}`).toBe(f.value);
        else expect(at ?? '', `${f.key} should be blank`).toBe('');
      }
      expect(back[DEVICE_MAP.regulationNumber.xfaSomPath!]).toBe('21 CFR 862.1355');
      expect(back[DEVICE_MAP.correspondentTelephone.xfaSomPath!]).toBe('+1 555 0199');
      expect(back[DEVICE_MAP.declarationCompanyAddress.xfaSomPath!]).toBe('1 Device Way');
      expect(back[DEVICE_MAP.correspondentCompanyName.xfaSomPath!] ?? '').toBe('');

      // productName ×2, productCode, regulation number, org name ×2, telephone,
      // address + the request common name.
      const { fieldReport } = reportOfficialEstarFill(resolved, r.filledFields);
      expect(fieldReport.filledCount).toBe(9);
      expect(fieldReport.blankCount).toBe(11);
      expect(fieldReport.ignoredRequestKeys).toEqual(['deviceTradeName']);
      for (const f of fieldReport.fields.filter((x) => !x.filled)) {
        expect(f.declaredSource, `${f.key} names its home`).toMatch(
          /^(regulatory_programs|estar_registrations|client_workspaces|fda_510k_projects)\./,
        );
      }
    });
  },
);
