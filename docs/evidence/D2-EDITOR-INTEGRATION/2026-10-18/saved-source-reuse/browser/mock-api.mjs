export const PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000181';
export const OTHER_PROGRAM = 'bbbbbbbb-0000-4000-8000-000000000182';
export const DOC = 'dddddddd-0000-4000-8000-000000000181';
export const EXISTING = 'aaaaaaaa-0000-4000-8000-000000000181';
export const SECOND = 'aaaaaaaa-0000-4000-8000-000000000182';
export const THIRD = 'aaaaaaaa-0000-4000-8000-000000000183';
export const TEMPLATE = 'cccccccc-0000-4000-8000-000000000181';
export const READ_ONLY_REASON = 'Editing needs an editing role in this organization. Your current organization access is read-only.';
export const SOURCE_SELECTORS = [
  { kind: 'data-room', sourceId: 41, expectedChecksum: '1'.repeat(64) },
  { kind: 'data-room', sourceId: 42, expectedChecksum: '2'.repeat(64) },
];
export const AT = '2026-10-18T00:10:00.000Z';
export const EVENT = 'eeeeeeee-0000-4000-8000-000000000181';
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
export const sourceRows = SOURCE_SELECTORS.map((selector, i) => ({
  id: selector.sourceId, title: `Synthetic analytical source ${i === 0 ? 'A' : 'B'}.txt`, checksum: selector.expectedChecksum,
  ingestionStatus: 'ingested', extractionStatus: 'extracted', textAvailable: true, isCurrent: true, dataEligible: true,
  createdAt: AT, mimeType: 'text/plain', fileSize: 2400 + i, artifactId: null, origin: 'chat_upload',
  extractionMethod: 'text', originalFileAvailable: i !== 0, disposition: i === 0 ? 'keep_data' : null,
  snippet: null, catalog: null, usage: { sections: 0, documents: 0, changedSections: 0 },
}));
export const manifest = { version: 1, programId: PROGRAM, fingerprint: 'f'.repeat(64),
  entries: SOURCE_SELECTORS.map((source, i) => ({ source, title: sourceRows[i].title,
    contentHash: source.expectedChecksum, extractedTextSha256: String(i + 3).repeat(64), version: String(2 - i),
    originalFileAvailable: sourceRows[i].originalFileAvailable, disposition: sourceRows[i].disposition,
    span: { start: 0, end: 900, totalChars: 2400, sha256: String(i + 5).repeat(64) } })),
  limitations: ['Selected excerpts only; this is not a full-file scientific review.', 'Source references do not establish scientific qualification or filing approval.'] };
export const savedRecord = { eventId: EVENT, recordedAt: AT, manifest };
export const savedResponse = { version: 1, docId: DOC, programId: PROGRAM, record: savedRecord };
// Actual longest built-in roster label, retained only to exercise intrinsic select width.
const longReference = { id: '6400da41-5d2b-51c2-8cce-f570e2fbe389',
  name: '5.3.2 · Reports of Studies Pertinent to Pharmacokinetics Using Human Biomaterials — preparation worksheet', module: 'M5' };
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
export function createState(mode) {
  return { mode, savedReads: 0, savedResponses: [], requests: [], unexpected: [], mutations: [], previews: 0, commits: 0, generations: 0,
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
    ...(input.sources ? { sources: manifest } : {}),
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
function projectHomeRead(path) {
  const replies = new Map([
    [`/api/c2c/projects/${PROGRAM}/team`, { team: [] }],
    [`/api/c2c/projects/${PROGRAM}/activity`, { activity: [] }],
    [`/api/c2c/projects/${PROGRAM}/workstreams`, { workstreams: [] }],
    [`/api/c2c/projects/${PROGRAM}/source-changes`, { changes: [], count: 0 }],
    [`/api/c2c/projects/${PROGRAM}/conversation-files`, { files: [], total: 0 }],
    ['/api/submissions', { submissions: [], meta: { notOffered: 0 } }],
    ['/api/review/board', { queue: [] }], ['/api/chat/threads', { threads: [] }],
    [`/api/concept2cure/projects/${PROGRAM}/unified-work`, { items: [] }],
    [`/api/c2c/project-vault/${PROGRAM}`, { success: true, data: { projectId: PROGRAM, tree: [], documents: [] } }],
    [`/api/c2c/projects/${PROGRAM}/records`, { projectId: PROGRAM, records: {} }],
  ]);
  return replies.has(path) ? json(replies.get(path)) : null;
}
function savedSourceRead(path, url, state) {
  if (path === `/api/authoring/docs/${DOC}/assembly/sources`) {
    state.savedReads++;
    if (url.searchParams.get('programId') !== PROGRAM || [...url.searchParams.keys()].length !== 1)
      state.unexpected.push({ path, query: url.search, reason: 'Saved-source read requires exact document/project scope' });
    const data = globalThis.structuredClone(savedResponse);
    if (state.mode === 'changed-record' && state.savedReads > 1) {
      data.record.eventId = 'eeeeeeee-0000-4000-8000-000000000182';
      data.record.recordedAt = '2026-10-18T00:11:00.000Z';
    }
    state.savedResponses.push(data);
    return json({ success: true, data });
  }
  return null;
}
function documentRead(path, url, state) {
  if (path === '/api/authoring/docs') {
    if (url.searchParams.get('programId') !== PROGRAM || (url.searchParams.has('status') && url.searchParams.get('status') !== 'all'))
      state.unexpected.push({ path, query: url.search, reason: 'Missing exact project scope' });
    return json({ success: true, documents: [{ ...documentRow, section_count: state.sections.length }] });
  }
  if (path === `/api/authoring/docs/${DOC}/sections`) return json({ success: true, sections: state.sections,
    structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: state.sections.map(row => row.id) } });
  if (path === `/api/authoring/docs/${DOC}`) return json({ success: true,
    document: { ...documentRow, section_count: state.sections.length },
    access: { ...Object.fromEntries(['freeze', 'esign', 'esignReview', 'fileToVault', 'assignReview', 'placeIntoFiling']
      .map(key => [key, { allowed: true, reason: null }])),
      edit: { allowed: state.mode !== 'read-only', reason: state.mode === 'read-only' ? READ_ONLY_REASON : null } } });
  if (path === `/api/authoring/docs/${DOC}/citations`) return json([]);
  if (path === `/api/authoring/documents/${DOC}/comments`) return json({ success: true, comments: [] });
  if (path === `/api/authoring/docs/${DOC}/audit`) return json({ success: true, events: [] });
  return null;
}
function auxiliaryRead(path, url, state) {
  if (path === `/api/c2c/projects/${PROGRAM}/sources`) return json({ projectId: PROGRAM, sources: sourceRows,
    usageScope: 'accessible-citations', total: sourceRows.length, currentTotal: sourceRows.length,
    page: { limit: Number(url.searchParams.get('limit') || 200), offset: Number(url.searchParams.get('offset') || 0) },
    window: { shown: sourceRows.length, truncated: false } });
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
      metadata: { retrievalStatus: 'ok', sourcesRetrieved: manifest.entries.length, attributableSources: 0 }, check: null };
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
async function holdInventoryRead(method, path, url, state) {
  if (method === 'GET' && path === '/api/authoring/docs' && url.searchParams.get('status') === 'all' && state.holdInventory) {
    state.onInventoryHeld?.();
    await new Promise(resolve => { state.releaseInventory = resolve; });
  }
}
export async function intercept(route, state) {
  const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
  const method = request.method(); const body = request.postData() ? request.postDataJSON() : undefined;
  state.requests.push({ method, path, query: url.search, ...(body ? { body } : {}) });
  if (method !== 'GET') state.mutations.push({ method, path, body });
  await holdInventoryRead(method, path, url, state);
  const collab = path.startsWith('/api/realtime-collab/rooms') ? json({ success: true, data: { room: { connectedUsers: [] } }, connectedUsers: [], roomKnown: true }) : null;
  const result = collab ?? (method === 'GET' ? fixedRead(path) ?? projectHomeRead(path) ?? savedSourceRead(path, url, state) ?? documentRead(path, url, state) ?? auxiliaryRead(path, url, state)
    : method === 'POST' ? assemblyWrite(path, body, state) ?? await draftWrite(path, body, state) : null);
  if (result) return route.fulfill(result);
  state.unexpected.push({ method, path });
  return route.fulfill(json({ success: false, message: 'Unconfigured synthetic evaluation endpoint' }, 404));
}
