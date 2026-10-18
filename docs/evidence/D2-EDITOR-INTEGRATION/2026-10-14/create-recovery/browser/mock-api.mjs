export function createApiState(records, kind, mode) {
  return { records, kind, mode, requests: [], mutations: [], unexpected: [], consoleErrors: [], pageErrors: [],
    createdDocument: false, createdSection: false, recoveryReads: 0, allowRecovery: false,
    release: null };
}

const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

function fixedResponse(path, state) {
  const { records } = state;
  const replies = new Map([
    ['/api/authoring/templates', { success: true, templates: [] }],
    ['/api/v1/auth/session', { authenticated: true, user: records.actor }],
    [`/api/c2c/projects/${records.program.id}`, records.program],
    ['/api/c2c/documents', { documents: [] }],
  ]);
  return replies.has(path) ? json(replies.get(path)) : null;
}

function scopedList(path, url, state) {
  const { records } = state;
  if (path !== '/api/authoring/docs') return null;
  if (url.searchParams.get('programId') !== records.program.id || url.searchParams.get('status') !== 'all') return null;
  if (state.mode === 'unknown' && state.kind === 'document') {
    state.recoveryReads++;
    return json({ success: true, documents: [{ ...records.document,
      program_id: state.allowRecovery ? records.program.id : records.otherProgram }] });
  }
  return json({ success: true, documents: [records.document, ...(state.createdDocument ? [records.createdDocument] : [])] });
}

function documentResponse(path, state) {
  const { records } = state;
  if (path === `/api/authoring/docs/${records.document.id}/sections`) {
    if (state.mode === 'unknown' && state.kind === 'section') {
      state.recoveryReads++;
      return json({ success: true, sections: [{ ...records.section,
        doc_id: state.allowRecovery ? records.document.id : records.createdDocument.id }] });
    }
    const sections = [records.section, ...(state.createdSection ? [records.createdSection] : [])];
    return json({ success: true, sections,
      structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: sections.map(section => section.id) } });
  }
  const access = Object.fromEntries(['freeze', 'esign', 'esignReview', 'fileToVault', 'assignReview', 'placeIntoFiling']
    .map(key => [key, { allowed: true, reason: null }]));
  const replies = new Map([
    [`/api/authoring/docs/${records.document.id}`, { success: true, document: records.document, access }],
    [`/api/authoring/docs/${records.document.id}/citations`, []],
    [`/api/authoring/documents/${records.document.id}/comments`, { success: true, comments: [] }],
    [`/api/authoring/docs/${records.document.id}/audit`, { success: true, events: [] }],
  ]);
  return replies.has(path) ? json(replies.get(path)) : null;
}

function auxiliaryResponse(path, url, state) {
  const { records } = state;
  if (path === `/api/c2c/projects/${records.program.id}/sources`) return json({ projectId: records.program.id, sources: [],
    total: 0, currentTotal: 0, page: { limit: Number(url.searchParams.get('limit')), offset: Number(url.searchParams.get('offset')) },
    window: { shown: 0, truncated: false } });
  const section = [records.section, records.createdSection].find(row => path.includes(row.id) || url.searchParams.get('documentId') === row.id);
  if (!section) return null;
  if (path === `/api/authoring/sections/${section.id}/sources`) return json({ success: true, sources: [] });
  if (path === `/api/authoring/guidance/${section.id}`) return json({ success: true, guidance: [], template_guidance: [] });
  if (path !== '/api/data-origins/document') return null;
  const length = section.content.replace(/<[^>]*>/g, '').length;
  return json({ summary: { documentTable: 'authoring_sections', documentId: section.id, contentLength: length,
    attributedChars: 0, unattributedChars: length, byKind: { fromSources: 0, authorAsserted: 0, machineDrafted: 0,
      machineDraftedUnaccepted: 0 }, staleChars: 0, spans: [], generatedAt: section.updated_at } });
}

async function creationResponse(request, path, state) {
  const { records, kind } = state;
  if (path !== `/api/authoring/${kind === 'document' ? 'docs' : 'sections'}` || state.mutations.length !== 1) return null;
  const expected = kind === 'document' ? { title: records.createdDocument.title, module: 'M3', client_program_id: records.program.id }
    : { code: records.createdSection.code, title: records.createdSection.title, doc_id: records.document.id, content: '' };
  const body = request.postDataJSON();
  if (JSON.stringify(body) !== JSON.stringify(expected)) {
    state.unexpected.push({ path, body, expected, reason: 'Create request did not match exact captured scope' });
    return null;
  }
  if (state.mode === 'unknown') {
    await new Promise(resolve => { state.release = resolve; });
    return json({ success: true, [kind]: kind === 'document'
      ? { ...records.createdDocument, client_program_id: records.otherProgram }
      : { ...records.createdSection, doc_id: records.createdDocument.id } });
  }
  if (kind === 'document') state.createdDocument = true;
  else state.createdSection = true;
  return { ...json({ success: true, [kind]: kind === 'document' ? records.createdDocument : records.createdSection,
    sections_seeded: 0, governance: { bound: false, reason: 'Explicitly synthetic working copy' } }), status: 201 };
}

export async function interceptApi(route, state) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  state.requests.push({ method: request.method(), path, query: url.search });
  if (request.method() !== 'GET') state.mutations.push({ method: request.method(), path, body: request.postDataJSON() });
  const result = request.method() === 'GET'
    ? fixedResponse(path, state) ?? scopedList(path, url, state) ?? documentResponse(path, state) ?? auxiliaryResponse(path, url, state)
    : request.method() === 'POST' ? await creationResponse(request, path, state) : null;
  if (result) return route.fulfill(result);
  state.unexpected.push({ method: request.method(), path });
  return route.fulfill({ ...json({ success: false, message: 'Unconfigured synthetic evaluation endpoint' }), status: 404 });
}
