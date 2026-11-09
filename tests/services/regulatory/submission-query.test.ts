/** Real planning-route handlers, with explicit Express/registry boundaries.
 * Synthetic requests only: no client records, agency transport or license
 * decision is simulated as verified. The same cases run before and after. */
import assert from 'node:assert/strict';
import { beforeEach, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (req: unknown, res: unknown) => unknown>(),
  planCalls: [] as unknown[], coverageCalls: [] as unknown[],
  failure: null as Error | null,
}));
vi.mock('express', () => ({ Router: () => ({
  get: (path: string, handler: (req: unknown, res: unknown) => unknown) => h.handlers.set(path, handler),
}) }));
vi.mock('../../../server/services/regulatory/submission-resolver.js', () => ({
  resolveSubmissionPlan: (input: unknown) => {
    h.planCalls.push(input);
    if (h.failure) throw h.failure;
    return { coverage: 'partial', testBoundary: 'plan', intent: input };
  },
  submissionCoverageMatrix: (regions: unknown) => {
    h.coverageCalls.push(regions);
    if (h.failure) throw h.failure;
    return { testBoundary: 'coverage', regions };
  },
}));
import '../../../server/routes/biopharma/submissions';

beforeEach(() => { h.planCalls.length = 0; h.coverageCalls.length = 0; h.failure = null; });

function invoke(path: string, query: unknown) {
  let status = 200;
  let body: unknown;
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  const response = {
    status(value: number) { status = value; return response; },
    json(value: unknown) { body = value; return response; },
  };
  try {
    const handler = h.handlers.get(path);
    assert.ok(handler, 'the existing route must be registered');
    handler({ query }, response);
  } finally { console.error = original; }
  return { status, body, logs };
}
function refused(path: string, query: unknown) {
  const result = invoke(path, query);
  assert.equal(result.status, 400);
  assert.equal((result.body as { error: string }).error, 'SUBMISSION_QUERY_INVALID');
  assert.equal(h.planCalls.length + h.coverageCalls.length, 0, 'invalid input must not select a default plan');
  assert.deepEqual(result.logs, [], 'a user query error is not an internal crash');
}

it.each(['/plan', '/coverage'])('keeps intentionally omitted defaults for %s', path => {
  const result = invoke(path, {});
  assert.equal(result.status, 200);
  if (path === '/plan') assert.deepEqual(h.planCalls, [{
    filingType: undefined, applicationFamily: undefined, productClass: undefined, regions: undefined,
  }]);
  else assert.deepEqual(h.coverageCalls, [undefined]);
});

it.each([
  ['US_DE_NOVO', 'device_clearance', 'medical_device', 'US'],
  ['US_510K', 'device_clearance', 'ivd', 'US'],
  ['US_BLA', 'marketing_authorization', 'biologic', 'US'],
  ['US_505B2', 'marketing_authorization', 'small_molecule', 'US'],
  ['EU_IVDR', 'device_clearance', 'ivd', 'EU'],
  ['JP_MKT_APPROVAL', 'marketing_authorization', 'biologic', 'JP'],
  ['CA_ANDS', 'marketing_authorization', 'generic', 'CA'],
  ['AU_CTA', 'clinical_trial', 'small_molecule', 'AU'],
])('passes %s through the same resolver without selecting another workflow', (filingType, applicationFamily, productClass, region) => {
  const query = { filingType, applicationFamily, productClass, regions: region };
  assert.equal(invoke('/plan', query).status, 200);
  assert.deepEqual(h.planCalls, [{ filingType, applicationFamily, productClass, regions: [region] }]);
  assert.deepEqual(query, { filingType, applicationFamily, productClass, regions: region });
});

it('normalizes outer whitespace and region case, without mutating the request', () => {
  const query = Object.freeze({ filingType: ' AU_CTA ', productClass: ' small_molecule ',
    applicationFamily: ' clinical_trial ', regions: ' ca, au ,jp, eu,us ' });
  assert.equal(invoke('/plan', query).status, 200);
  assert.deepEqual(h.planCalls[0], { filingType: 'AU_CTA', productClass: 'small_molecule',
    applicationFamily: 'clinical_trial', regions: ['CA', 'AU', 'JP', 'EU', 'US'] });
  assert.equal(query.filingType, ' AU_CTA ');
});

for (const key of ['filingType', 'applicationFamily', 'productClass', 'regions']) {
  it.each([
    ['empty', ''], ['blank', ' \t '], ['repeated', ['US', 'AU']],
    ['one-item-array', ['US']], ['nested', { selected: 'US' }],
    ['null', null], ['number', 7], ['boolean', false],
  ])(`rejects ${key} as %s without calling the resolver`, (_label, value) => refused('/plan', { [key]: value }));
}

it.each([
  ['', 'explicit empty'], [' ', 'explicit blank'], [',', 'empty pair'], ['US,', 'trailing empty'],
  [',US', 'leading empty'], ['US,,AU', 'middle empty'], ['US,US', 'duplicate'], ['us, US', 'case duplicate'],
])('rejects ambiguous region list %j (%s) on both endpoints', (regions, _label) => {
  refused('/plan', { regions });
  refused('/coverage', { regions });
});

it.each([[null], [[]], [7], ['US']])('refuses invalid top-level query structure %j', query => {
  refused('/plan', query); refused('/coverage', query);
});

it.each([
  ['region', 'AU'], ['filingtype', 'AU_CTA'], ['sourceDocument', 'PRIVATE-SOURCE'],
])('refuses unsupported plan selector %s rather than ignoring it', (field, value) => {
  const result = invoke('/plan', { [field]: value });
  assert.equal(result.status, 400);
  assert.equal(h.planCalls.length, 0);
  assert.ok(!JSON.stringify(result.body).includes(String(value)), 'refusal never echoes unknown source text');
});

it.each(['filingType', 'applicationFamily', 'productClass'])('coverage refuses unsupported %s filters instead of claiming to apply them', field => {
  refused('/coverage', { regions: 'US', [field]: 'PRIVATE-FILTER' });
});

it('leaves unknown nonempty filing/product/region semantics to the existing shared resolver', () => {
  assert.equal(invoke('/plan', { filingType: 'NOT_REGISTERED', productClass: 'future_class', regions: ' xx ' }).status, 200);
  assert.deepEqual(h.planCalls[0], { filingType: 'NOT_REGISTERED', applicationFamily: undefined,
    productClass: 'future_class', regions: ['XX'] });
});

it.each(['/plan', '/coverage'])('redacts internal resolver failures from %s response and logs', path => {
  h.failure = new Error('PRIVATE-SYNTHETIC-PROJECT PRIVATE-COLLABORATOR-DETAIL');
  const result = invoke(path, { regions: 'US' });
  assert.equal(result.status, 500);
  assert.deepEqual(result.body, { error: 'INTERNAL_ERROR' });
  assert.equal(result.logs.length, 1);
  const output = result.logs.map(args => args.map(String).join(' ')).join('\n');
  assert.ok(!output.includes('PRIVATE-'), 'raw collaborator errors must not expose project text or credentials');
});
