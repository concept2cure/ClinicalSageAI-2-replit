export const PROGRAM = '0b9f6c2e-5d4a-4c3b-9a21-7e6f5d4c3b2a';
export const DOC = 'synthetic-confirmed-document';
export const actor = { id: '71', organizationId: '8', organizationName: null, email: 'synthetic@example.test',
  firstName: 'Synthetic', lastName: 'Reviewer', displayName: 'Synthetic reviewer', roles: ['author'], permissions: [],
  mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
export const protocol = 'Title: Synthetic protocol\nIndication: Synthetic indication\nPhase: 2\nSample size: 240\nDuration: 24 weeks\nPrimary endpoint: Synthetic outcome';
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
export function createState(mode) {
  return { mode, requests: [], unexpected: [], mutations: [], documentWrites: 0, sectionWrites: 0, reads: 0,
    validRead: false, pending: null, release: null, saved: null };
}
function fixedRead(path) {
  if (path === '/api/v1/auth/session') return json({ authenticated: true, user: actor });
  if (path === '/api/analytics/dashboard') return json({ data: { totalReports: 0,
    recentAdditions: 0, uniqueIndications: 0, averageCompletionRate: 0, reportsByPhase: {}, reportsByIndication: {} } });
  return null;
}
function analysis() {
  return json({ data: {
    protocol_data: { title: 'Synthetic protocol', indication: 'Synthetic indication', phase: '2', sample_size: 240,
      duration_weeks: 24, primary_endpoint: 'Synthetic outcome', risk_factors: [] }, similar_protocols: [],
    recommendations: '# Synthetic design recommendations\n\nRetained source text for browser recovery verification.\n\nReview this synthetic working draft before use.' } });
}
async function write(path, body, state) {
  if (path === '/api/analytics/analyze-protocol-text') return analysis();
  if (path === '/api/authoring/docs') {
    state.documentWrites++;
    if (body.client_program_id !== PROGRAM || body.module !== 'M5') state.unexpected.push({ path, reason: 'Wrong creation scope' });
    state.pending = 'document';
    await new Promise(resolve => { state.release = resolve; });
    state.pending = null;
    return json({ success: true, document: { id: DOC, title: body.title, module: body.module,
      client_program_id: state.mode === 'unknown' ? 'wrong-program' : PROGRAM }, governance: { bound: false } });
  }
  if (path === '/api/authoring/sections') {
    state.sectionWrites++;
    if (body.doc_id !== DOC || body.code !== 'recommendations') state.unexpected.push({ path, reason: 'Wrong section target' });
    if (state.sectionWrites === 1) return json({ success: true, section: { id: 'unknown-section',
      doc_id: 'wrong-document', code: body.code, title: body.title, content: body.content } });
    state.saved = { id: 'synthetic-confirmed-section', ...body };
    return json({ success: true, section: state.saved });
  }
  return null;
}
function scopedRead(path, searchParams, state) {
  if (path === '/api/authoring/docs') {
    state.reads++;
    if (searchParams.get('status') !== 'all' || searchParams.get('programId') !== PROGRAM)
      state.unexpected.push({ path, query: searchParams.toString(), reason: 'Missing all-status exact project scope' });
    return json({ success: true, documents: [{ id: DOC, title: 'Synthetic working document',
      program_id: state.validRead ? PROGRAM : 'wrong-program' }] });
  }
  if (path === `/api/authoring/docs/${DOC}`) return json({ success: true,
    document: { id: DOC, title: 'Synthetic working document', tenant_id: 8, status: 'draft' } });
  if (path === `/api/authoring/docs/${DOC}/sections`) return json({ success: true, sections: state.saved ? [state.saved] : [] });
  return null;
}
export async function intercept(route, state) {
  const request = route.request();
  const { pathname: path, search, searchParams } = new URL(request.url());
  const method = request.method();
  const body = method === 'GET' ? undefined : request.postDataJSON();
  state.requests.push({ method, path, query: search, ...(body ? { body } : {}) });
  if (method !== 'GET') state.mutations.push({ method, path, body });
  const result = method === 'GET' ? fixedRead(path) ?? scopedRead(path, searchParams, state)
    : method === 'POST' ? await write(path, body, state) : null;
  if (result) return route.fulfill(result);
  state.unexpected.push({ method, path });
  return route.fulfill(json({ success: false, message: 'Unconfigured synthetic endpoint' }));
}
