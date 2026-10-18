export function createApiState(snapshot, selected) {
  return { snapshot, selected, created: false, savedExample: false, allowCreate: false, requests: [], mutations: [], unexpected: [], consoleErrors: [], pageErrors: [] };
}

function documentResponse(path, state) {
  if (!state.created) return null;
  const { document, sections: emptySections, guidance } = state.selected;
  const sections = emptySections.map((section, index) => ({ ...section,
    content: state.savedExample && index === 0 ? `<p>${state.selected.plainBody}</p>` : '' }));
  const access = Object.fromEntries(['freeze', 'esign', 'esignReview', 'fileToVault', 'assignReview', 'placeIntoFiling']
    .map(k => [k, { allowed: true, reason: null }]));
  const replies = new Map([
    [`/api/authoring/docs/${document.id}`, { success: true, document, access }],
    [`/api/authoring/docs/${document.id}/sections`, { success: true, sections,
      structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: sections.map(s => s.id) } }],
    ...guidance.map(row => [`/api/authoring/guidance/${row.sectionId}`, row.response]),
    [`/api/authoring/docs/${document.id}/citations`, []],
    [`/api/authoring/documents/${document.id}/comments`, { success: true, comments: [] }],
    [`/api/authoring/docs/${document.id}/audit`, { success: true, events: [] }],
  ]);
  return replies.has(path) ? { body: replies.get(path) } : null;
}

function sourceResponse(path, url, state) {
  const { program } = state.snapshot;
  const { sections } = state.selected;
  if (path === `/api/c2c/projects/${program.id}/sources`) return { body: { projectId: program.id, sources: [],
    total: 0, currentTotal: 0, page: { limit: Number(url.searchParams.get('limit')), offset: Number(url.searchParams.get('offset')) },
    window: { shown: 0, truncated: false } } };
  if (sections.some(section => path === `/api/authoring/sections/${section.id}/sources`)) return { body: { success: true, sources: [] } };
  const section = sections.find(row => url.searchParams.get('documentId') === row.id);
  if (path === '/api/data-origins/document' && section) {
    const length = state.savedExample && section.id === sections[0].id ? state.selected.plainBody.length : 0;
    return { body: { summary: { documentTable: 'authoring_sections', documentId: section.id, contentLength: length,
      attributedChars: 0, unattributedChars: length, byKind: { fromSources: 0, authorAsserted: 0, machineDrafted: 0,
        machineDraftedUnaccepted: 0 }, staleChars: 0, spans: [], generatedAt: section.updated_at } } };
  }
  return null;
}

function fixedResponse(path, state) {
  const { snapshot } = state;
  const replies = new Map([
    ['/api/authoring/templates', { success: true, templates: snapshot.cases.map(row => row.templateReference) }],
    ['/api/v1/auth/session', { authenticated: true, user: snapshot.actor }],
    [`/api/c2c/projects/${snapshot.program.id}`, snapshot.program],
    ['/api/c2c/documents', { documents: [] }],
  ]);
  return replies.has(path) ? { body: replies.get(path) } : null;
}

export async function interceptApi(route, state) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  state.requests.push({ method: request.method(), path, query: url.search,
    phase: state.savedExample ? 'synthetic-saved-reading-example' : state.created ? 'created-empty' : 'picker' });
  if (request.method() !== 'GET') state.mutations.push({ method: request.method(), path, body: request.postData() });
  if (request.method() === 'POST' && path === '/api/authoring/docs' && state.allowCreate && !state.created) {
    const received = request.postDataJSON();
    const expected = { title: state.selected.document.title, module: state.selected.document.module,
      template_id: state.selected.source.id, client_program_id: state.snapshot.program.id };
    if (JSON.stringify(received) === JSON.stringify(expected)) {
      state.created = true;
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true,
        document: state.selected.document, sections_seeded: state.selected.sections.length,
        governance: { bound: false, reason: 'Synthetic fixture: deliberately unbound working copy.' } }) });
    }
    state.unexpected.push({ method: request.method(), path, reason: 'Exact source/project/module create mismatch', received, expected });
  }
  const result = request.method() === 'GET' && (documentResponse(path, state) ?? sourceResponse(path, url, state)
    ?? fixedResponse(path, state));
  if (result) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result.body) });
  state.unexpected.push({ method: request.method(), path });
  return route.fulfill({ status: 404, contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Unconfigured synthetic fixture endpoint' }) });
}
