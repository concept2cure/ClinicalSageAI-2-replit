export function createApiState(snapshot, selected) {
  return { snapshot, selected, requests: [], mutations: [], unexpected: [], consoleErrors: [], pageErrors: [] };
}

function documentResponse(path, state) {
  const { document, sections, guidance } = state.selected;
  const access = Object.fromEntries(['freeze', 'esign', 'esignReview', 'fileToVault', 'assignReview', 'placeIntoFiling']
    .map(k => [k, { allowed: true, reason: null }]));
  const replies = new Map([
    [`/api/authoring/docs/${document.id}`, { success: true, document, access }],
    [`/api/authoring/docs/${document.id}/sections`, { success: true, sections,
      structure: { duplicateCodes: [], outOfOrder: false, suggestedOrder: sections.map(s => s.id) } }],
    [`/api/authoring/guidance/${sections[0].id}`, guidance],
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
  if (path === `/api/authoring/sections/${sections[0].id}/sources`) return { body: { success: true, sources: [] } };
  if (path === '/api/data-origins/document' && url.searchParams.get('documentId') === sections[0].id) {
    const section = sections[0];
    const length = state.selected.plainBody.length;
    return { body: { summary: { documentTable: 'authoring_sections', documentId: section.id, contentLength: length,
      attributedChars: 0, unattributedChars: length, byKind: { fromSources: 0, authorAsserted: 0, machineDrafted: 0,
        machineDraftedUnaccepted: 0 }, staleChars: 0, spans: [], generatedAt: section.updated_at } } };
  }
  return null;
}

function fixedResponse(path, snapshot) {
  const replies = new Map([
    ['/api/authoring/templates', { success: true, templates: [] }],
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
  state.requests.push({ method: request.method(), path, query: url.search });
  if (request.method() !== 'GET') state.mutations.push({ method: request.method(), path, body: request.postData() });
  const result = request.method() === 'GET' && (documentResponse(path, state) ?? sourceResponse(path, url, state)
    ?? fixedResponse(path, state.snapshot));
  if (result) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result.body) });
  state.unexpected.push({ method: request.method(), path });
  return route.fulfill({ status: 404, contentType: 'application/json',
    body: JSON.stringify({ success: false, message: 'Unconfigured synthetic fixture endpoint' }) });
}
