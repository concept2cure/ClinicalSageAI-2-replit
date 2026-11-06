/** Synthetic records only; the browser mounts shipped canvas/editor components. */
import * as base from '../../../D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/mock-api.mjs';
export const PROGRAM = base.PROGRAM;
export const MEDICINAL_PROGRAM = base.OTHER_PROGRAM;
export const actor = base.actor;
export const bearer = () => `fixture.${btoa(JSON.stringify({ userId: Number(actor.id), organizationId: Number(actor.organizationId), visit: 'shared-editor-adaptation-2026-11-06' }))}.synthetic`;
export const AT = '2026-11-06T18:00:00.000Z';
const id = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const filing = {
  k510: { id: id('cccccccc', 181), doc_type: 'k510', agency: 'FDA', title: '510(k) engineering requirements', code: 'A', label: 'Administrative device description' },
  cer: { id: id('cccccccc', 182), doc_type: 'cer', agency: 'ema', title: 'CER clinical evidence requirements', code: '4', label: 'Clinical evidence appraisal' },
  ivdr: { id: id('cccccccc', 183), doc_type: 'ivdr', agency: 'ema', title: 'IVDR performance requirements', code: 'II.6.2', label: 'Clinical performance evidence' },
  ind: { id: id('cccccccc', 184), doc_type: 'ind', agency: 'FDA', title: 'IND clinical overview requirements', code: '2.5', label: 'Clinical overview' },
  market: { id: id('cccccccc', 185), doc_type: 'maa', agency: 'EMA', title: 'EU market administrative requirements', code: '1.0', label: 'Regional application information' },
};
const makeDoc = (n, type, code, title) => ({ id: id('dddddddd', n), title,
  module: type === 'ind' ? 'M2' : type === 'market' ? 'M1' : null, product_code: type,
  section_count: 1, status: 'DRAFT', updated_at: AT, program_id: PROGRAM, client_program_id: PROGRAM,
  created_by: actor.id, template_id: id('eeeeeeee', n), c2c_document_id: filing[type]?.id ?? id('cccccccc', 299),
  readScope: 'document', tenant_id: Number(actor.organizationId), code });
export const docs = [makeDoc(181, 'k510', 'A', '510(k) working document'),
  ...Array.from({ length: 7 }, (_, i) => makeDoc(201 + i, 'k510', `filler.${i}`, `Other saved device component ${i + 1}`)),
  makeDoc(281, 'cer', '4', 'CER evaluation working document'),
  makeDoc(282, 'ivdr', 'II.6.2', 'IVDR performance working document'),
  makeDoc(283, 'ind', '2.5', 'IND overview working document'),
  makeDoc(284, 'market', '1.0', 'EU market working document'),
  makeDoc(285, 'missing', 'MISSING', 'Working document with unavailable filing')];
export const chosenDoc = kind => docs.find(row => row.product_code === kind);
export const projectFor = kind => ['ind', 'market'].includes(kind) ? MEDICINAL_PROGRAM : PROGRAM;
export const projectTypeFor = kind => ['ind', 'market'].includes(kind) ? 'drug' : kind === 'ivdr' ? 'ivd' : 'device';
export const scopeDocs = projectId => docs.filter(row => ['ind', 'market'].includes(row.product_code) === (projectId === MEDICINAL_PROGRAM))
  .map(row => ({ ...row, program_id: projectId, client_program_id: projectId }));
const scopeFilings = projectId => Object.values(filing).filter(row => [filing.ind, filing.market].includes(row) === (projectId === MEDICINAL_PROGRAM));
export const sections = Object.fromEntries(docs.map((doc, i) => [doc.id, [{
  id: id('aaaaaaaa', 181 + i), doc_id: doc.id, code: doc.code,
  title: filing[doc.product_code]?.label ?? doc.title,
  content: `<p>Saved ${doc.product_code.toUpperCase()} source-supported working text.</p>`,
  order_index: 1, track_changes: false, comment_count: 0, revision_count: 1, citation_count: 0,
  updated_at: AT, tenant_id: Number(actor.organizationId),
}]]));
export const access = { edit: { allowed: true, reason: null }, ...Object.fromEntries(
  ['freeze', 'esign', 'esignReview', 'fileToVault', 'assignReview', 'placeIntoFiling'].map(k => [k, { allowed: true, reason: null }])) };
export const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
export const createState = (kind, artifactMode = null) => ({ projectId: projectFor(kind), productType: projectTypeFor(kind), artifactMode,
  artifactCreated: false, requests: [], unexpected: [], authoringWrites: [], ancillaryWrites: [], simulatedWrites: [] });
export async function intercept(route, state, artifact = null) {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  state.requests.push({ method, path, query: url.search });
  if (artifact && await artifact.write(route, state)) return;
  if (method !== 'GET') {
    if (path.startsWith('/api/realtime-collab/rooms')) {
      state.ancillaryWrites.push({ method, path });
      return route.fulfill(json({ success: true, data: { room: { connectedUsers: [] } }, connectedUsers: [], roomKnown: true }));
    }
    state.authoringWrites.push({ method, path });
    return route.fulfill(json({ error: 'Synthetic fixture refuses writes' }, 405));
  }
  const reads = [identityRead, filingRead, ...(artifact ? [artifact.read] : []), documentRead, auxiliaryRead];
  for (const read of reads) {
    const reply = read(path, url, state);
    if (reply) return route.fulfill(reply);
  }
  state.unexpected.push({ method, path, query: url.search });
  return route.fulfill(json({ error: 'Unconfigured synthetic read' }, 501));
}
function filingRead(path, url, state) {
  const projectId = state.projectId;
  if (path === '/api/c2c/documents') {
    if (url.searchParams.get('projectId') !== projectId) {
      state.unexpected.push({ method: 'GET', path, query: url.search });
      return json({ error: 'Selected synthetic project required' }, 501);
    }
    let records = scopeFilings(projectId).filter(row => url.searchParams.get('scope') === 'market' ? row === filing.market : url.searchParams.get('scope') === 'home' ? row !== filing.market : true);
    if (url.searchParams.has('docType')) records = records.filter(row => row.doc_type === url.searchParams.get('docType'));
    return json({ documents: records.map(row => ({ ...row, org_id: Number(actor.organizationId), project_id: projectId,
      rule_pack_version: 'synthetic-1', status: 'DRAFT', readiness: 0, filing_scope: row === filing.market ? 'market' : 'home' })) });
  }
  const outline = scopeFilings(projectId).find(row => path === `/api/c2c/documents/${row.id}/outline`);
  return outline ? json({ document: { ...outline, status: 'DRAFT', readiness: 0, filing_scope: outline === filing.market ? 'market' : 'home' },
    outline: [{ key: outline.code, parent_key: null, label: outline.label, mandatory: true, path_order: 1,
      status: 'draft', draft_source: null, has_content: true, version: 1 }], gaps: [] }) : null;
}
function documentRead(path, url, state) {
  const currentDocs = scopeDocs(state.projectId);
  if (path === '/api/authoring/docs' && url.searchParams.get('programId') === state.projectId) return json({ success: true, documents: currentDocs });
  for (const doc of currentDocs) {
    if (path === `/api/authoring/docs/${doc.id}`) return json({ success: true, document: { ...doc, sourceMetadataState: 'available' }, access });
    if (path === `/api/authoring/docs/${doc.id}/sections`) return json({ success: true, sections: sections[doc.id], readScope: 'document',
      structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: sections[doc.id].map(row => row.id) } });
    if (path === `/api/authoring/docs/${doc.id}/citations`) return json([]);
    if (path === `/api/authoring/documents/${doc.id}/comments`) return json({ success: true, comments: [] });
    if (path === `/api/authoring/documents/${doc.id}/reviews`) return json({ success: true, reviews: [] });
    if (path === `/api/authoring/docs/${doc.id}/audit`) return json({ success: true, events: [] });
    if (path === `/api/realtime-collab/locks/${doc.id}`) return json({ success: true, data: [] });
  }
  return null;
}
function auxiliaryRead(path, url, state) {
  for (const doc of scopeDocs(state.projectId)) for (const section of sections[doc.id]) {
    if (path === `/api/authoring/sections/${section.id}/sources`) return json({ success: true, sources: [] });
    if (path === `/api/authoring/sections/${section.id}/history`) return json({ success: true, revisions: [] });
    if (path === `/api/authoring/guidance/${section.id}`) return json({ success: true, guidance: [], template_guidance: [{ id: 'synthetic-guidance',
      guidance_text: `${doc.product_code.toUpperCase()} saved-section evidence guidance`, compliance_checklist: [`Use the ${doc.product_code.toUpperCase()} source evidence for this section.`], common_pitfalls: [], regulatory_references: [] }] });
    if (path === '/api/data-origins/document' && url.searchParams.get('documentId') === section.id) return origins(section);
  }
  return null;
}
export function origins(section) {
  const length = section.content.replace(/<[^>]*>/g, '').length;
  return json({ summary: { documentTable: 'authoring_sections', documentId: section.id, contentLength: length,
    attributedChars: 0, unattributedChars: length, byKind: { fromSources: 0, authorAsserted: 0, machineDrafted: 0,
      machineDraftedUnaccepted: 0 }, staleChars: 0, spans: [], generatedAt: AT } });
}
function identityRead(path, _url, state) {
  const projectId = state.projectId;
  if (path === '/api/v1/auth/session') return json({ authenticated: true, user: actor });
  if (path === `/api/c2c/projects/${projectId}`) return json({ id: projectId, name: 'Synthetic selected project', stage: 'DEVELOPMENT',
    status: 'ACTIVE', product_type: state.productType, primary_agency: 'FDA' });
  if (path === `/api/c2c/projects/${projectId}/sources`) return json({ projectId, sources: [], usageScope: 'accessible-citations', total: 0,
    currentTotal: 0, page: { limit: 200, offset: 0 }, window: { shown: 0, truncated: false } });
  if (path === '/api/authoring/templates') return json({ success: true, templates: [], globalCatalog: 'ok' });
  return path.startsWith('/api/realtime-collab/rooms') ? json({ success: true, data: { room: { connectedUsers: [] } }, connectedUsers: [], roomKnown: true }) : null;
}
