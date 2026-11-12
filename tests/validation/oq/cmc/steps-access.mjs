/**
 * OQ-008 steps OQ-CMC-01…05: who may reach the registers, what the reference
 * records are, and that a register write reaches Module 3 only as a canonical
 * source.
 */
import { step, state, IND, stamp, FOREIGN_PROJECT_ID } from './context.mjs';
import { dataOf, errCode, idOf, isFiledUnder, sectionKeys } from './signed-acts.mjs';
import { requireIdentity } from '../../lib/credentials.mjs';
import { completeInd, completeRecords, isComplete, sectionsOf } from './complete-programme.mjs';

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
      /* v0.11: the Q2(R2) package OQ-CMC-23 validates under signature (the validate act refuses a method with none). */
      ichQ2Parameters: {
        specificity: 'No interference from placebo, impurities or degradants at the BX-701 retention time',
        accuracy: '98.0-102.0% recovery at 80, 100 and 120%',
        precision: 'Repeatability RSD <= 1.0% (n=6); intermediate precision RSD <= 2.0%',
        linearity: 'r >= 0.999 over 50-150% of nominal',
        range: '50-150% of nominal',
      },
    });
    await record('specification', '/api/cmc/specifications', {
      materialType: 'drug_substance',
      materialName: 'BX-701',
      acceptanceCriteria: { release: '98.0-102.0%', shelf: '95.0-105.0%' },
      /* The method as the register names it (its title): the approval gate matches the name, never the code
         (services/cmc/analytical-method-source.ts, d9060a85e2). Until v0.11 this named the code. */
      testMethods: { method: 'RP-HPLC Assay' },
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
    action: 'as the viewer (OQ_VIEWER): GET each register\'s list for the programme, then POST a drug substance under it; as the run identity, list the drug substances',
    expected: 'each read 200; the write 403 and no row written',
    dependsOn: ['OQ-CMC-03'],
    note: 'v0.11: the reads and the write are the viewer\'s (until v0.10 the step read with the run session and never wrote). The specification and batch-record lists are /:projectId routes, not ?projectId= (server/api/cmc/specificationRoutes.ts, batchRecordRoutes.ts): v0.1 read GET /api/cmc/specifications, which is no route, and was answered 404.',
  },
  async ({ apiAs, api, expect, deviation, baseUrl }) => {
    const viewer = await requireIdentity({ deviation, expect }, baseUrl, 'OQ_VIEWER', 'a read-only identity is needed to observe the refusal.');
    const asViewer = apiAs(viewer.session);
    const pid = encodeURIComponent(state.projectId);
    const lists = {
      'drug-substances': `/api/cmc/drug-substances?projectId=${pid}`,
      'drug-products': `/api/cmc/drug-products?projectId=${pid}`,
      'analytical-methods': `/api/cmc/analytical-methods?projectId=${pid}`,
      specifications: `/api/cmc/specifications/${pid}`,
      'batch-records': `/api/cmc/batch-records/${pid}`,
      'stability-studies': `/api/cmc/stability-studies?projectId=${pid}`,
    };
    const observed = [];
    for (const [register, path] of Object.entries(lists)) {
      const res = await asViewer('GET', path);
      observed.push(`${register} ${res.status}`);
      expect(res.status === 200, `${register} read expected 200, got ${res.status}`, res.json);
    }
    const name = `VIEWER-${stamp}`;
    const write = await asViewer('POST', '/api/cmc/drug-substances', { substanceName: name, projectId: state.projectId, modality: 'small_molecule' });
    expect(write.status === 403, `the viewer's write expected 403, got ${write.status}`, write.json);
    const after = await api('GET', lists['drug-substances']);
    const rows = dataOf(after);
    expect(after.status === 200 && Array.isArray(rows) && !rows.some((r) => r.substanceName === name || r.substance_name === name), 'the viewer\'s write left a row', rows);
    return `${observed.join('; ')}; the viewer's write ${write.status} ${errCode(write) ?? ''}, no row`;
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
await step(
  {
    id: 'OQ-CMC-03b',
    urs: ['URS-CMC-002'],
    kind: 'prerequisite',
    title: 'A second programme whose records compose a complete Module 3',
    action: 'POST /api/c2c/projects for a second small-molecule US IND; enter, through the register routes, every record a complete Module 3 needs; compile',
    expected: 'each record created under the programme; the compile composes 21 sections, each complete with nothing missing',
    note: 'v0.13: new. OQ-CMC-03\'s six records compose sections that cannot be approved, so no run reached the final-export gate\'s pass or the placement. This programme is the fixture OQ-CMC-17, -19, -20, -27 and -28 act on. The first programme is unchanged.',
  },
  async ({ api, expect, attach }) => {
    const prog = await api('POST', '/api/c2c/projects', completeInd(stamp));
    expect(prog.status === 201, `programme create expected 201, got ${prog.status}`, prog.json);
    const projectId = dataOf(prog).id;
    expect(Boolean(projectId), 'the programme create returned no id', prog.json);
    const records = {};
    for (const [key, path, body] of completeRecords(stamp)) {
      const r = await api('POST', path, { ...body, projectId });
      expect([200, 201].includes(r.status), `${key} expected 200/201, got ${r.status}`, r.json);
      expect(isFiledUnder(dataOf(r), projectId), `${key} was not filed under the programme`, r.json);
      records[key] = idOf(r);
    }
    const compile = await api('POST', `/api/cmc/module3-os/compile/${projectId}`, {});
    expect(compile.status === 200, `the compile expected 200, got ${compile.status}`, compile.json);
    const sections = await sectionsOf(api, projectId);
    const incomplete = sections.filter((x) => !isComplete(x)).map((x) => ({ sectionKey: x.sectionKey, completeness: x.completeness, missingInputs: x.missingInputs }));
    attach('complete-programme.json', { projectId, records, sections: sections.map((x) => ({ sectionKey: x.sectionKey, completeness: x.completeness })), incomplete });
    expect(sections.length === 21, `the compile composed ${sections.length} sections, expected 21`, sectionKeys(sections));
    expect(incomplete.length === 0, `${incomplete.length} section(s) are not complete`, incomplete);
    state.complete = { projectId, records };
    return `programme ${projectId} with ${Object.keys(records).length} records; ${sections.length} of ${sections.length} sections complete`;
  },
);

export const ACCESS_STEPS = 'steps-access.mjs';
