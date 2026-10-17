export const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000181';
export const DOC = 'dddddddd-0000-4000-8000-000000000181';
export const EXISTING = 'aaaaaaaa-0000-4000-8000-000000000181';
export const SECOND = 'aaaaaaaa-0000-4000-8000-000000000182';
export const THIRD = 'aaaaaaaa-0000-4000-8000-000000000183';
export const TEMPLATE = 'cccccccc-0000-4000-8000-000000000181';
export const AT = '2026-10-17T20:00:00.000Z';
export const actor = { id: '181', organizationId: '18', organizationName: null,
  email: 'assembly@example.test', firstName: 'Synthetic', lastName: 'Author', displayName: 'Synthetic author',
  roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false };
export const program = { id: PROGRAM, name: 'Synthetic assembly project', stage: 'IND', status: 'ACTIVE', product_type: 'drug' };
export const documentRow = { id: DOC, title: 'Assembly working document', module: 'M3', product_code: null,
  section_count: 1, status: 'DRAFT', updated_at: AT, program_id: PROGRAM, client_program_id: PROGRAM,
  created_by: '181', template_id: null, c2c_document_id: null };
const counts = { track_changes: false, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: AT };
export const existing = { id: EXISTING, doc_id: DOC, code: '3.2.P.8.1', title: 'Existing stability summary',
  content: '<p>Existing saved stability evidence.</p>', order_index: 7, ...counts };
export const emptySecond = { id: SECOND, doc_id: DOC, code: '3.2.P.8.2', title: 'Post-approval stability protocol',
  content: '', order_index: 8, ...counts };
export const emptyThird = { id: THIRD, doc_id: DOC, code: '3.2.P.8.3', title: 'Stability data',
  content: '', order_index: 9, ...counts };
export const template = { id: TEMPLATE, name: 'Organization stability assembly', module: 'M3' };
// Actual longest built-in roster label, retained only to exercise intrinsic select width.
const longReference = { id: '6400da41-5d2b-51c2-8cce-f570e2fbe389',
  name: '5.3.2 · Reports of Studies Pertinent to Pharmacokinetics Using Human Biomaterials — preparation worksheet', module: 'M5' };
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
export function createState(mode) {
  return { mode, requests: [], unexpected: [], mutations: [], previews: 0, commits: 0, generations: 0,
    accepts: 0, activeGenerations: 0, maximumActiveGenerations: 0, sections: [globalThis.structuredClone(existing)],
    drafts: [], accepted: [], generationEvents: [] };
}
export function makePlan(input, state) {
  const all = [existing, emptySecond, emptyThird];
  const selected = input.selection.target === 'document' ? all : all.filter(row => row.code === input.selection.code);
  return { version: 1, docId: DOC, programId: PROGRAM, templateId: TEMPLATE, selection: input.selection,
    targetSnapshot: 'synthetic-target-snapshot', templateSnapshot: 'synthetic-template-snapshot',
    fingerprint: `synthetic-fingerprint-${state.commits}-${input.selection.code ?? 'document'}`,
    templateName: template.name, draftRegion: 'FDA', limitations: ['Working text requires human review.'], gaps: [],
    rows: selected.map(row => ({ code: row.code, title: row.title, content: row.content, ordering: row.order_index,
      disposition: state.sections.some(saved => saved.code === row.code) ? 'preserve' : 'append',
      ...(state.sections.some(saved => saved.code === row.code) ? { existingSectionId: row.id } : {}),
      aiDraftable: true, aiDraftableReason: 'Text drafting is permitted.',
      gaps: row.content ? [] : ['Scientific content is missing.'] })) };
}
function fixedRead(path) {
  if (path === '/api/v1/auth/session') return json({ authenticated: true, user: actor });
  if (path === '/api/authoring/templates') return json({ success: true, templates: [template, longReference], globalCatalog: 'ok' });
  if (path === `/api/realtime-collab/locks/${DOC}`) return json({ success: true, data: [] });
  if (path === `/api/c2c/projects/${PROGRAM}`) return json(program);
  if (path === '/api/c2c/documents') return json({ documents: [] });
  return null;
}
function documentRead(path, url, state) {
  if (path === '/api/authoring/docs') {
    if (url.searchParams.get('programId') !== PROGRAM || url.searchParams.get('status') !== 'all')
      state.unexpected.push({ path, query: url.search, reason: 'Missing exact project scope' });
    return json({ success: true, documents: [{ ...documentRow, section_count: state.sections.length }] });
  }
  if (path === `/api/authoring/docs/${DOC}/sections`) return json({ success: true, sections: state.sections,
    structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: state.sections.map(row => row.id) } });
  if (path === `/api/authoring/docs/${DOC}`) return json({ success: true,
    document: { ...documentRow, section_count: state.sections.length },
    access: Object.fromEntries(['freeze', 'esign', 'esignReview', 'fileToVault', 'assignReview', 'placeIntoFiling']
      .map(key => [key, { allowed: true, reason: null }])) });
  if (path === `/api/authoring/docs/${DOC}/citations`) return json([]);
  if (path === `/api/authoring/documents/${DOC}/comments`) return json({ success: true, comments: [] });
  if (path === `/api/authoring/docs/${DOC}/audit`) return json({ success: true, events: [] });
  return null;
}
function auxiliaryRead(path, url, state) {
  if (path === `/api/c2c/projects/${PROGRAM}/sources`) return json({ projectId: PROGRAM, sources: [],
    total: 0, currentTotal: 0, page: { limit: Number(url.searchParams.get('limit')), offset: Number(url.searchParams.get('offset')) },
    window: { shown: 0, truncated: false } });
  const section = state.sections.find(row => path.includes(row.id) || url.searchParams.get('documentId') === row.id);
  if (!section) return null;
  if (path === `/api/authoring/sections/${section.id}/sources`) return json({ success: true, sources: [] });
  if (path === `/api/authoring/sections/${section.id}/history`) return json({ success: true, revisions: [] });
  if (path === `/api/authoring/guidance/${section.id}`) return json({ success: true, guidance: [], template_guidance: [] });
  if (path !== '/api/data-origins/document') return null;
  const length = section.content.replace(/<[^>]*>/g, '').length;
  return json({ summary: { documentTable: 'authoring_sections', documentId: section.id, contentLength: length,
    attributedChars: 0, unattributedChars: length, byKind: { fromSources: 0, authorAsserted: 0, machineDrafted: 0,
      machineDraftedUnaccepted: 0 }, staleChars: 0, spans: [], generatedAt: AT } });
}
function assemblyWrite(path, body, state) {
  if (path === `/api/authoring/docs/${DOC}/assembly/preview`) {
    state.previews++;
    return json({ success: true, data: makePlan(body, state) });
  }
  if (path === `/api/authoring/docs/${DOC}/assembly/commit`) {
    const plan = makePlan(body, state);
    if (body.fingerprint !== plan.fingerprint || body.programId !== PROGRAM || body.templateId !== TEMPLATE)
      state.unexpected.push({ path, body, reason: 'Incorrect commit scope or fingerprint' });
    state.commits++;
    const selected = [existing, emptySecond, emptyThird].filter(row => plan.rows.some(item => item.code === row.code));
    state.sections = [...new Map([...state.sections, ...selected].map(row => [row.id, globalThis.structuredClone(row)])).values()];
    return json({ success: true, data: { docId: DOC, programId: PROGRAM, plan, sections: selected } });
  }
  return null;
}
async function draftWrite(path, body, state) {
  const generationSection = path.match(/^\/api\/authoring\/sections\/([^/]+)\/ai\/draft$/)?.[1];
  if (generationSection) {
    state.generations++; state.activeGenerations++;
    state.maximumActiveGenerations = Math.max(state.maximumActiveGenerations, state.activeGenerations);
    state.generationEvents.push({ kind: 'start', sectionId: generationSection, count: state.generations });
    await new Promise(resolve => setTimeout(resolve, 100));
    state.activeGenerations--;
    state.generationEvents.push({ kind: 'finish', sectionId: generationSection, count: state.generations });
    if (state.mode === 'refusal' && generationSection === THIRD)
      return json({ success: false, error: { code: 'GATEWAY_UNAVAILABLE', message: 'Synthetic provider unavailable.' } }, 503);
    const draft = { content: `Synthetic retained candidate for ${generationSection}.`, draftId: `draft-${generationSection}`,
      metadata: { retrievalStatus: 'empty', sourcesRetrieved: 0, attributableSources: 0 }, check: null };
    state.drafts.push({ sectionId: generationSection, ...draft });
    return json({ success: true, draft });
  }
  const acceptedSection = path.match(/^\/api\/authoring\/sections\/([^/]+)\/ai\/draft\/accept$/)?.[1];
  if (acceptedSection) {
    state.accepts++;
    const section = state.sections.find(row => row.id === acceptedSection);
    if (!section || body.draftId !== `draft-${acceptedSection}` || !body.changeReason)
      state.unexpected.push({ path, body, reason: 'Incorrect acceptance target, candidate or reason' });
    if (!section) return json({ success: false }, 404);
    section.content = body.content;
    state.accepted.push({ sectionId: acceptedSection, ...body });
    return json({ success: true, section, attribution: { sourceSpans: 0, authorSpans: 1, distinctSources: 0, coverage: 0 } });
  }
  return null;
}
export async function intercept(route, state) {
  const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
  const method = request.method(); const body = request.postData() ? request.postDataJSON() : undefined;
  state.requests.push({ method, path, query: url.search, ...(body ? { body } : {}) });
  if (method !== 'GET') state.mutations.push({ method, path, body });
  const collab = path.startsWith('/api/realtime-collab/rooms') ? json({ success: true, data: { room: { connectedUsers: [] } }, connectedUsers: [], roomKnown: true }) : null;
  const result = collab ?? (method === 'GET' ? fixedRead(path) ?? documentRead(path, url, state) ?? auxiliaryRead(path, url, state)
    : method === 'POST' ? assemblyWrite(path, body, state) ?? await draftWrite(path, body, state) : null);
  if (result) return route.fulfill(result);
  state.unexpected.push({ method, path });
  return route.fulfill(json({ success: false, message: 'Unconfigured synthetic evaluation endpoint' }, 404));
}
