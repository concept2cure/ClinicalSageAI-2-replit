// Sweep finding 89, re-checked in the running app: does an archived project leave Reporting?
const B = 'http://127.0.0.1:5100';
const a = await (await fetch(`${B}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
const h = { Authorization: `Bearer ${a.accessToken}`, 'Content-Type': 'application/json' };
const call = async (method, path, body) => { const r = await fetch(B + path, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 200); } return { status: r.status, body: j }; };
const NAME = 'ARCHIVE-PROBE';
let list = (await call('GET', '/api/c2c/projects?limit=100&includeArchived=true')).body.data ?? [];
let probe = list.find((p) => p.title === NAME);
if (!probe) {
  const made = await call('POST', '/api/c2c/projects', { name: NAME, productName: NAME, primaryAgency: 'FDA', programType: 'ind', productType: 'drug', indication: 'Probe', targetSubmissionDate: '2027-06-01', clientWorkspaceId: 2 });
  console.info('created', made.status, made.body?.data?.id ?? JSON.stringify(made.body).slice(0, 200));
  probe = { id: made.body?.data?.id, status: 'active' };
}
const inReporting = async () => { const ov = (await call('GET', '/api/insights-canvas/overview')).body.data; return { picker: (ov.programs ?? []).some((p) => p.programId === probe.id), count: (ov.programs ?? []).length, board: (ov.portfolio?.programs ?? []).some((p) => p.programId === probe.id) }; };
console.info('before archive', probe.status, JSON.stringify(await inReporting()));
if (probe.status !== 'archived') {
  const arch = await call('POST', `/api/c2c/projects/${probe.id}/archive`, { reason: 'Sweep finding 89 re-check: archived to see whether it leaves Reporting' });
  console.info('archive', arch.status, JSON.stringify(arch.body).slice(0, 160));
}
list = (await call('GET', '/api/c2c/projects?limit=100&includeArchived=true')).body.data ?? [];
console.info('projects says', list.find((p) => p.id === probe.id)?.status, '· default list has it:', ((await call('GET', '/api/c2c/projects?limit=100')).body.data ?? []).some((p) => p.id === probe.id));
console.info('after archive', JSON.stringify(await inReporting()));
