// The project-group routes after the repair, in the running app on real PostgreSQL (RLS and launch scope enforced).
const B = 'http://127.0.0.1:5100';
const a = await (await fetch(`${B}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
const h = { Authorization: `Bearer ${a.accessToken}`, 'Content-Type': 'application/json' };
const call = async (method, path, body) => { const r = await fetch(B + path, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 200); } return { status: r.status, body: j }; };
const show = (label, r) => console.info(label, r.status, JSON.stringify(r.body).slice(0, 300));
const before = await call('GET', '/api/report-os/program-groups?includeArchived=true');
const broken = (before.body.data ?? []).find((g) => g.status === 'nonsense' || g.name === 'Probe group');
show('BAD PATCH: status and empty name', await call('PATCH', `/api/report-os/program-groups/${broken?.id ?? 1}`, { status: 'nonsense', name: '' }));
show('BAD PATCH: unknown field', await call('PATCH', `/api/report-os/program-groups/${broken?.id ?? 1}`, { organizationId: 1 }));
show('BAD PATCH: empty members', await call('PATCH', `/api/report-os/program-groups/${broken?.id ?? 1}`, { projectIds: [] }));
const made = await call('POST', '/api/report-os/program-groups', { name: '  Lumen pipeline ', description: 'The four Lumen INDs', projectIds: [4, 5] });
show('CREATE', made); const id = made.body?.data?.id;
show('PATCH members', await call('PATCH', `/api/report-os/program-groups/${id}`, { projectIds: [4, 5, 6, 7] }));
show('SNAPSHOT', await call('POST', `/api/report-os/program-groups/${id}/snapshots`, { snapshotLabel: 'Q4 board', snapshotReason: 'Board pack issued' }));
show('PATCH another organization\'s id', await call('PATCH', '/api/report-os/program-groups/999999', { name: 'Nope' }));
console.info('GROUP_ID', id);
