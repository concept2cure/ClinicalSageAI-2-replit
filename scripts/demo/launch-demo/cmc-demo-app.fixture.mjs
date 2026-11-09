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

export function fakeCmcApplication() {
  const calls = [];
  const state = { substances: [], products: [], methods: [], specs: [], stability: [], batches: [], validated: [] };
  const ok = (json, status = 200) => ({ status, json });

  const api = async (method, url, body) => {
    calls.push({ method, url, body });
    if (method === 'GET' && url.startsWith('/api/cmc/drug-substances')) return ok({ success: true, data: state.substances });
    if (method === 'GET' && url.startsWith('/api/cmc/drug-products')) return ok({ success: true, data: state.products });
    if (method === 'GET' && url.startsWith('/api/cmc/analytical-methods')) return ok({ success: true, data: state.methods });
    if (method === 'GET' && url.startsWith('/api/cmc/specifications/')) return ok({ success: true, data: state.specs });
    if (method === 'GET' && url.startsWith('/api/cmc/stability-studies')) return ok({ success: true, data: state.stability });
    if (method === 'GET' && url.startsWith('/api/cmc/batch-records/')) return ok({ success: true, data: state.batches });

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
      const row = { id: state.stability.length + 1, studyTitle: body.studyTitle, stabilityData: null };
      state.stability.push(row);
      return ok({ success: true, data: row }, 201);
    }
    if (method === 'PUT' && /\/api\/cmc\/stability-studies\/\d+$/.test(url)) return ok({ success: true, data: {} });
    if (method === 'POST' && url === '/api/cmc/batch-records') {
      state.batches.push({ batchNumber: body.batchNumber });
      return ok({ success: true, data: body }, 201);
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

/** The gate's own comparison (analytical-method-source.ts `methodStatusKey`). */
export const methodKey = (s) => String(s ?? '').trim().toLowerCase();
