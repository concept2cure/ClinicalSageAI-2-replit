// A deleted project and the "at risk" findings read (GET /api/sentinel/findings), in the running app.
// Usage: node probe.mjs create | findings <projectId> | delete <programUuid> | scan
const BASE = 'http://127.0.0.1:5100';
const a = await (await fetch(`${BASE}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
const H = { Authorization: `Bearer ${a.accessToken}`, 'Content-Type': 'application/json' };
const call = async (method, url, body) => { const r = await fetch(BASE + url, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); let j = null; try { j = await r.json(); } catch { /* no body */ } return { status: r.status, body: j }; };
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'create') {
  const r = await call('POST', '/api/c2c/projects', { name: 'DELETE-PROBE overdue project', productName: 'DEL-PROBE', programType: 'ind', productType: 'drug', primaryAgency: 'FDA', submissionTypeId: 'us_ind', clientWorkspaceId: 2 });
  console.info('create', r.status, JSON.stringify({ id: r.body?.id ?? r.body?.project?.id ?? r.body?.data?.id, anchor: r.body?.meta?.projectAnchorId, error: r.body?.error }));
} else if (cmd === 'scan') {
  const r = await call('POST', '/api/sentinel/scan', {});
  console.info('scan', r.status, JSON.stringify(r.body).slice(0, 300));
} else if (cmd === 'findings') {
  const r = await call('GET', '/api/sentinel/findings?limit=200');
  const list = r.body?.findings ?? r.body?.data ?? [];
  const mine = list.filter((f) => JSON.stringify(f).includes('DELETE-PROBE') || (arg && (f.projectId === Number(arg) || (f.projectIds || []).includes(Number(arg)))));
  console.info('findings', r.status, 'total', list.length, 'naming the probe project', mine.length, mine.map((f) => `${f.analyzerType ?? f.type}: ${f.title}`).slice(0, 4));
} else if (cmd === 'delete') {
  const r = await call('DELETE', `/api/c2c/projects/${arg}`, { reason: 'Probe: a deleted project and the at-risk read' });
  console.info('delete', r.status, JSON.stringify(r.body).slice(0, 200));
}
