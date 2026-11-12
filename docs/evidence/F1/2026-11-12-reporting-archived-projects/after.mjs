// Sweep finding 89 after the fix: the archived probe project is gone from Reporting; restoring it brings it back.
const B = 'http://127.0.0.1:5100';
const a = await (await fetch(`${B}/api/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'jm.smith@concept2cure.pro' }) })).json();
const h = { Authorization: `Bearer ${a.accessToken}`, 'Content-Type': 'application/json' };
const call = async (method, path, body) => { const r = await fetch(B + path, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t.slice(0, 200); } return { status: r.status, body: j }; };
const probe = ((await call('GET', '/api/c2c/projects?limit=100&includeArchived=true')).body.data ?? []).find((p) => p.title === 'ARCHIVE-PROBE');
const inReporting = async () => { const ov = (await call('GET', '/api/insights-canvas/overview')).body.data; return { picker: (ov.programs ?? []).some((p) => p.programId === probe.id), projects: (ov.programs ?? []).length, board: (ov.portfolio?.programs ?? []).some((p) => p.programId === probe.id), boardCount: ov.portfolio?.summary?.programCount }; };
console.info('Projects says', probe.status, '· Reporting:', JSON.stringify(await inReporting()));
const un = await call('POST', `/api/c2c/projects/${probe.id}/unarchive`, { reason: 'Sweep finding 89 re-check: restored' });
console.info('unarchive', un.status, '· Reporting:', JSON.stringify(await inReporting()));
const re = await call('POST', `/api/c2c/projects/${probe.id}/archive`, { reason: 'Sweep finding 89 re-check: archived again, probe project' });
console.info('archive again', re.status, '· Reporting:', JSON.stringify(await inReporting()));
