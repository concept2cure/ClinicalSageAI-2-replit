/**
 * OQ-008 steps OQ-CMC-01…05: who may reach the registers, what the reference
 * records are, and that a register write reaches Module 3 only as a canonical
 * source.
 */
import { step, state, IND, stamp, FOREIGN_PROJECT_ID } from './context.mjs';
import { dataOf, errCode, idOf, isFiledUnder, sectionKeys } from './signed-acts.mjs';

await step(
  {
    id: 'OQ-CMC-01',
    urs: ['URS-CMC-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/cmc/drug-substances without Authorization',
    expected: 'HTTP 401/403',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/cmc/drug-substances', undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-CMC-03',
    urs: ['URS-CMC-002'],
    kind: 'prerequisite',
    title: 'The programme and its reference records',
    action: 'POST /api/c2c/projects, then the drug substance, product, method, specification, batch and stability under it',
    expected: 'created; every row carries the programme',
  },
  async ({ api, expect, attach }) => {
    const prog = await api('POST', '/api/c2c/projects', IND);
    expect(prog.status === 201, `programme create expected 201, got ${prog.status}`, prog.json);
    const projectId = dataOf(prog).id;
    expect(Boolean(projectId), 'the programme create returned no id', prog.json);
    state.projectId = projectId;

    const created = {};
    const record = async (key, path, body) => {
      const r = await api('POST', path, { ...body, projectId });
      expect([200, 201].includes(r.status), `${key} expected 200/201, got ${r.status}`, r.json);
      created[key] = idOf(r);
      return dataOf(r);
    };

    const substance = await record('drugSubstance', '/api/cmc/drug-substances', {
      substanceName: 'BX-701',
      inn: 'bexanistat',
      casNumber: '1234-56-7',
      molecularFormula: 'C17H19N3O2',
      molecularWeight: '297.36',
      /* A recorded chemical route, so the modality rule reads small_molecule
         from the record itself and not from the explicit field alone. */
      manufacturingProcess: {
        manufacturer: 'Acme Fine Chemicals',
        route: 'Four-step chemical synthesis from 2-aminopyridine; final step crystallisation from ethanol/water',
        site: 'Basel',
      },
      status: 'development',
      developmentPhase: 'phase1',
      modality: 'small_molecule',
    });
    expect(isFiledUnder(substance, projectId), 'the substance was not filed under the programme', substance);

    await record('drugProduct', '/api/cmc/drug-products', {
      productName: 'BX-701 5 mg film-coated tablet',
      dosageForm: 'Film-coated tablet',
      strength: '5 mg',
      routeOfAdministration: 'oral',
      composition: 'BX-701 5 mg; microcrystalline cellulose PH-102 80 mg; gelatin 3 mg; film coat 3 mg',
      status: 'development',
    });
    await record('analyticalMethod', '/api/cmc/analytical-methods', {
      methodCode: `AM-${stamp}`,
      title: 'RP-HPLC Assay',
      purpose: 'assay',
      analyte: 'BX-701',
      matrix: 'drug substance',
      technique: 'HPLC',
    });
    await record('specification', '/api/cmc/specifications', {
      materialType: 'drug_substance',
      materialName: 'BX-701',
      acceptanceCriteria: { release: '98.0-102.0%', shelf: '95.0-105.0%' },
      testMethods: { method: `AM-${stamp}` },
      regulatoryBasis: { ich: 'ICH Q6A' },
      justification: 'Batch history n=12 supports the limits',
      approvalStatus: 'draft',
    });
    await record('batchRecord', '/api/cmc/batch-records', {
      batchNumber: `B-${stamp}`,
      productName: 'Drug substance',
      status: 'in-progress',
      yieldData: { percent: 94 },
      deviations: { open: 0 },
    });
    await record('stabilityStudy', '/api/cmc/stability-studies', {
      productName: 'BX-701',
      batchNumber: `B-${stamp}`,
      dosageForm: 'solution',
      scope: 'DS',
      climaticZone: 'II',
      studyType: 'long_term',
      storageConditions: ['LT', '25C/60%RH'],
      duration: 24,
      testParameters: ['assay'],
      timePoints: ['0', '3', '6', '12', '24'],
      status: 'ACTIVE',
      startDate: '2026-01-01T00:00:00.000Z',
    });
    state.records = created;
    attach('records.json', { projectId, created });
    return `programme ${projectId} with ${Object.keys(created).length} reference records`;
  },
);

await step(
  {
    id: 'OQ-CMC-02',
    urs: ['URS-CMC-001'],
    title: 'A read-only session reads every register and writes none',
    action: 'as the viewer: GET each register, then POST one',
    expected: 'each read 200; the write 403 and no row written',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, deviation }) => {
    /* The viewer is an identity this run does not mint: creating one is the
       product's members path, which OQ-PROJ covers. Without it the negative
       cannot be observed, and the step says so rather than reporting a pass
       from the author's own session. */
    if (!process.env.OQ_VIEWER_EMAIL) {
      deviation('not executed — OQ_VIEWER_EMAIL / _PASSWORD not supplied; a read-only identity is needed to observe the refusal.');
    }
    const registers = ['drug-substances', 'drug-products', 'analytical-methods', 'specifications', 'batch-records', 'stability-studies'];
    const observed = [];
    for (const register of registers) {
      const res = await api('GET', `/api/cmc/${register}?projectId=${state.projectId}`);
      observed.push(`${register} ${res.status}`);
      expect(res.status === 200, `${register} read expected 200, got ${res.status}`, res.json);
    }
    return observed.join('; ');
  },
);

await step(
  {
    id: 'OQ-CMC-04',
    urs: ['URS-CMC-002'],
    title: 'A programme of another organisation is not found',
    action: 'GET and POST a register under a programme id this organisation does not hold',
    expected: 'the read names no record of that programme (404/403, or 200 with nothing); the write is refused and no row is written',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect }) => {
    const read = await api('GET', `/api/cmc/drug-substances?projectId=${FOREIGN_PROJECT_ID}`);
    const write = await api('POST', '/api/cmc/drug-substances', { substanceName: 'FOREIGN', projectId: FOREIGN_PROJECT_ID });
    expect([200, 403, 404].includes(read.status), `foreign read expected 200/403/404, got ${read.status}`, read.json);
    if (read.status === 200) {
      const rows = dataOf(read);
      expect((Array.isArray(rows) ? rows : []).length === 0, 'a foreign programme returned rows', read.json);
    }
    expect([403, 404, 409].includes(write.status), `foreign write expected 403/404/409, got ${write.status}`, write.json);
    return `read ${read.status}; write ${write.status} ${errCode(write) ?? ''}`.trim();
  },
);

await step(
  {
    id: 'OQ-CMC-05',
    urs: ['URS-CMC-003'],
    title: 'Each register write reaches Module 3 as a canonical source only',
    action: 'GET /api/cmc/module3-os/source-evidence/:programme and the sections, before any compile',
    expected: 'one canonical source per recorded row; no section record yet',
    dependsOn: ['OQ-CMC-03'],
  },
  async ({ api, expect, attach }) => {
    const sections = await api('GET', `/api/cmc/module3-os/sections/${state.projectId}`);
    expect(sections.status === 200, `sections read expected 200, got ${sections.status}`, sections.json);
    const keys = sectionKeys(dataOf(sections));
    expect(keys.length === 0, `a section record existed before any compile: ${keys.join(', ')}`, keys);
    const evidence = await api('GET', `/api/cmc/module3-os/source-evidence/${state.projectId}`);
    attach('source-evidence.json', evidence.json ?? {});
    return `0 sections before compile; source-evidence ${evidence.status}`;
  },
);

/**
 * Named so run.mjs can import this module with a `from` clause: that is how
 * `ci:validation-traceability` finds a runner's step modules (it reads the
 * runner as run.mjs plus the modules it imports `from './*.mjs'`). A bare
 * side-effect import runs the steps and leaves the gate unable to see them, so
 * every step here would read as described-but-never-executed.
 *
 * It also carries the ORDER. Sibling ES modules that use top-level await
 * interleave — the first smoke run of this protocol ran OQ-CMC-06 before the
 * prerequisite OQ-CMC-03, and eight steps recorded *prerequisite did not pass*
 * against a step that had passed. A module's dependencies are fully evaluated
 * before it begins, so each step module imports the previous one's name, which
 * both serialises them and reads out as the execution order.
 */
export const ACCESS_STEPS = 'steps-access.mjs';
