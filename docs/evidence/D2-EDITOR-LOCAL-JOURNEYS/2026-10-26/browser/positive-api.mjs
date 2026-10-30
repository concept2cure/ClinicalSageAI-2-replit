/** Scope/shape adapter around the existing synthetic API, not another editor host. */
import * as base from '../../../D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/mock-api.mjs';
export { actor, PROGRAM, DOC, documentRow, program, sourceRows, SOURCE_SELECTORS, createState } from '../../../D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/mock-api.mjs';
export const positiveBearer = (visit = 'current-browser-adoption') => `fixture.${btoa(JSON.stringify({ userId: Number(base.actor.id), organizationId: Number(base.actor.organizationId), visit }))}.synthetic`;
export async function intercept(route, state) {
  const request = route.request(), url = new URL(request.url());
  const extra = request.method() === 'GET' ? extraProjectRead(url) : null;
  if (extra) {
    state.requests.push({ method: 'GET', path: url.pathname, query: url.search });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(extra) });
  }
  return base.intercept({ request: () => route.request(), fulfill: async options => {
    const body = JSON.parse(options.body);
    if (Array.isArray(body.documents)) body.documents = body.documents.map(row => ({ ...row, readScope: 'document' }));
    if (body.document) body.document = { ...body.document, readScope: 'document', sourceMetadataState: 'available', tenant_id: Number(base.actor.organizationId) };
    if (Array.isArray(body.sections)) { body.readScope = 'document'; body.sections = body.sections.map(row => ({ ...row, tenant_id: Number(base.actor.organizationId) })); }
    return route.fulfill({ ...options, body: JSON.stringify(body) });
  } }, state);
}
/** Current Project home ancillary reads, using their explicit existing DTOs. */
function extraProjectRead(url) {
  if (url.pathname === '/api/ana-ri/runs' && url.searchParams.get('mine') === 'live') return { runs: [], serverNow: base.AT };
  if (url.pathname === `/api/ana-skills/projects/${base.PROGRAM}`) return { projectId: 42, settings: [], skills: [], alwaysMax: 3, canChange: false };
  if (url.pathname === `/api/c2c/projects/${base.PROGRAM}/dossier`) return {
    projectId: base.PROGRAM, measuredAt: base.AT, home: { state: 'no_sections', pct: null }, markets: [], rows: [] };
  return null;
}
