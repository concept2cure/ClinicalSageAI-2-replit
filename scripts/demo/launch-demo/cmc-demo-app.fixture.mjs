/**
 * One recording fake of the product's HTTP boundary for the CMC demo-seed
 * tests, as faux-demo.test.mjs simulates the application.
 *
 * It lives here because two test files had a fake each, and the day the seeder
 * gained a step (the drug substance and drug product) the OTHER file's fake
 * threw "Unexpected demo request" — a test failing because a sibling test's
 * fixture was the one that knew about the change. One fake, one place to teach
 * it a new route.
 *
 * It answers only what `ensureCmc` calls, and throws on anything else: a seeder
 * that starts calling a route nobody has thought about fails loudly rather than
 * silently receiving an empty list.
 */
import assert from 'node:assert/strict';

/**
 * The eleven registers `ensureCmcRegisters` writes (P-122). Each is a plain
 * list-and-create register; the fake keeps what was posted, lists it back, and
 * refuses what the real route refuses: a create in a signed state
 * (`refusesUngovernedQualification`) and a create with no project.
 */
const REGISTER_PATHS = [
  '/api/cmc/reference-standards', '/api/cmc/impurity-profiles', '/api/cmc/dissolution-profiles',
  '/api/cmc/characterization-studies', '/api/cmc/manufacturing-processes', '/api/cmc/process-validation',
  '/api/cmc/formulation-records', '/api/cmc/material-specs', '/api/cmc/container-closures',
  '/api/cmc/change-control', '/api/cmc/comparability-studies',
];
const SIGNED_STATES = new Set(['qualified', 'validated', 'approved', 'specified', 'current', 'implemented', 'closed', 'completed']);

export function fakeCmcApplication() {
  const calls = [];
  const state = { substances: [], products: [], methods: [], specs: [], stability: [], batches: [], qcResults: [], validated: [], registers: {} };
  const ok = (json, status = 200) => ({ status, json });
  const register = (url) => REGISTER_PATHS.find((p) => url === p || url.startsWith(`${p}?`));

  const api = async (method, url, body) => {
    calls.push({ method, url, body });
    const reg = register(url);
    if (reg && method === 'GET') return ok({ success: true, data: state.registers[reg] ?? [] });
    if (reg && method === 'POST' && url === reg) {
      assert.ok(!SIGNED_STATES.has(String(body.status ?? '').toLowerCase()),
        `${reg}: a create declared "${body.status}", a state only its signature records`);
      assert.ok(body.projectId, `${reg}: a create with no project files no Module 3 source`);
      const row = { id: (state.registers[reg] ?? []).length + 1, ...body };
      (state.registers[reg] ??= []).push(row);
      return ok({ success: true, data: row }, 201);
    }
    if (method === 'GET' && url.startsWith('/api/cmc/drug-substances')) return ok({ success: true, data: state.substances });
    if (method === 'GET' && url.startsWith('/api/cmc/drug-products')) return ok({ success: true, data: state.products });
    if (method === 'GET' && url.startsWith('/api/cmc/analytical-methods')) return ok({ success: true, data: state.methods });
    if (method === 'GET' && url.startsWith('/api/cmc/specifications/')) return ok({ success: true, data: state.specs });
    if (method === 'GET' && url.startsWith('/api/cmc/stability-studies')) return ok({ success: true, data: state.stability });
    if (method === 'GET' && url.startsWith('/api/cmc/batch-records/')) return ok({ success: true, data: state.batches });
    if (method === 'GET' && url.startsWith('/api/cmc/qc-testing')) return ok({ success: true, data: state.qcResults });

    if (method === 'POST' && url === '/api/cmc/drug-substances') {
      const row = { id: state.substances.length + 1, ...body };
      state.substances.push(row);
      return ok({ success: true, data: row }, 201);
    }
    if (method === 'POST' && url === '/api/cmc/drug-products') {
      const row = { id: state.products.length + 1, ...body };
      state.products.push(row);
      return ok({ success: true, data: row }, 201);
    }
    if (method === 'POST' && url === '/api/cmc/analytical-methods') {
      /* The real route refuses this with a 409: validation is a governed act
         (`ungovernedQualificationRefusal`). A fake that accepted it would let
         the seeder ship a create every run would fail on. */
      assert.notEqual(String(body.status ?? '').toLowerCase(), 'validated',
        'the create declared the method validated, which the route refuses with a 409');
      const row = { id: state.methods.length + 1, ...body };
      state.methods.push(row);
      return ok({ success: true, data: row }, 201);
    }
    if (method === 'POST' && /\/api\/cmc\/analytical-methods\/\d+\/validate$/.test(url)) {
      assert.ok(body.reason && body.meaning && body.reauth?.password,
        `the validation ceremony was incomplete: ${JSON.stringify(body)}`);
      state.validated.push(url);
      return ok({ success: true, data: { id: Number(url.split('/')[4]), status: 'validated' } });
    }
    if (method === 'POST' && url === '/api/cmc/specifications') {
      state.specs.push({ materialName: body.materialName, ...body });
      return ok({ success: true, data: body }, 201);
    }
    if (method === 'POST' && url === '/api/cmc/stability-studies') {
      const row = { id: state.stability.length + 1, studyTitle: body.studyTitle, shelfLife: body.shelfLife ?? null, stabilityData: null };
      state.stability.push(row);
      return ok({ success: true, data: row }, 201);
    }
    if (method === 'PUT' && /\/api\/cmc\/stability-studies\/\d+$/.test(url)) {
      /* The register's edit needs a governed reason; a fake that accepted one
         without it would let the seeder ship a PUT the route refuses. */
      assert.ok(body?.reason, `the stability edit carried no reason: ${JSON.stringify(body)}`);
      const row = state.stability.find((r) => r.id === Number(url.split('/').pop()));
      /* The real route parses its body with a Zod schema that STRIPS unknown
         keys, so only the register's own field names are stored — a fake that
         accepted any key would have hidden exactly the bug this fixture now
         reproduces: `shelfLifeClaim` returned 200 and stored nothing, because
         the column is `shelf_life`. */
      if (row && body.shelfLife) row.shelfLife = body.shelfLife;
      if (row && body.stabilityData) row.stabilityData = body.stabilityData;
      return ok({ success: true, data: row ?? {} });
    }
    if (method === 'POST' && url === '/api/cmc/batch-records') {
      state.batches.push({ batchNumber: body.batchNumber });
      return ok({ success: true, data: body }, 201);
    }
    if (method === 'POST' && url === '/api/cmc/qc-testing') {
      /* The register's closed vocabulary decides which material the result is
         evidence for; a value outside it is attributed to neither, and the
         real route refuses it. */
      assert.ok(['raw-material', 'in-process', 'finished-product', 'stability', 'reference-standard', 'cleaning-verification'].includes(body.sampleType),
        `"${body.sampleType}" is not a sample type the register knows`);
      /* A seed that recorded its own second-person review would be one person
         recording both halves of a two-person rule. */
      assert.ok(!('reviewedBy' in body), 'the seed recorded its own second-person review');
      const row = { id: state.qcResults.length + 1, sampleId: body.sampleId, ...body };
      state.qcResults.push(row);
      return ok({ success: true, data: row }, 201);
    }
    throw new Error(`Unexpected demo request: ${method} ${url}`);
  };

  const run = {
    records: {}, steps: [], notes: [],
    record(k, v) { this.records[k] = v; },
    note(m) { this.notes.push(m); },
    async step(label, execute) { this.steps.push(label); return execute(); },
  };
  const tally = {
    created: {}, found: {},
    created(k) { this.created[k] = (this.created[k] ?? 0) + 1; },
    found(k) { this.found[k] = (this.found[k] ?? 0) + 1; },
  };
  return { api, state, run, tally, calls, ctx: { api, run, tally } };
}

/** The project the seeders are run against. */
export const DEMO_PROGRAM = { id: 'c0ffee00-0000-4000-8000-000000000001' };

/** Every CMC register path the fake knows a create for, the eleven and the seven. */
export const CMC_REGISTER_PATHS = REGISTER_PATHS;

/** The gate's own comparison (analytical-method-source.ts `methodStatusKey`). */
export const methodKey = (s) => String(s ?? '').trim().toLowerCase();
