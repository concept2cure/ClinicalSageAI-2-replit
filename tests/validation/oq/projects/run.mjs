/**
 * OQ-001 — Operational Qualification: Projects.
 * Protocol: docs/validation/OQ-001-PROJECTS.md. Requirements: docs/validation/URS-001-PROJECTS.md.
 *
 * Run:  node tests/validation/oq/projects/run.mjs   (server on VALIDATION_BASE_URL, default http://localhost:5200)
 * Writes docs/evidence/W3/<date>/OQ-PROJECTS/{result.json, OQ-001-execution-record.md, steps/*}.
 */
import { createRun, helpers } from '../../lib/harness.mjs';

const run = await createRun({
  app: 'PROJECTS',
  appLabel: 'Projects',
  protocolId: 'OQ-001',
  protocolTitle: 'Operational Qualification — Projects',
});
const { step, state } = run;
const stamp = helpers.stamp();

await step(
  {
    id: 'OQ-PROJ-01',
    urs: ['URS-PROJ-001'],
    title: 'Anonymous access refused',
    action: 'GET /api/c2c/projects with no Authorization header',
    expected: 'HTTP 401 (or 403); no program data returned',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/c2c/projects', undefined, { anonymous: true });
    expect([401, 403].includes(r.status), `expected 401/403, got ${r.status}`, r.json ?? r.text);
    return `HTTP ${r.status}`;
  },
);

await step(
  {
    id: 'OQ-PROJ-02',
    urs: ['URS-PROJ-001', 'URS-PROJ-005'],
    title: 'Login page and Demo Access (dev-login) in the browser',
    action: 'Open /concept2cure/login unauthenticated; click "Demo Access"; observe redirect into the shell',
    expected: 'Login page renders; after Demo Access the URL leaves /concept2cure/login and the shell renders',
    note: 'Demo Access calls POST /api/auth/dev-login, which is only mounted when NODE_ENV=development and ALLOW_DEV_AUTH=1 (server/auth/dev-auth-policy.ts). It skips the password/MFA factor by design; every later step authenticates through the same dev-login token.',
  },
  async (ctx) => {
    const page = await ctx.newPage(null, { anonymous: true });
    await page.goto(`${ctx.baseUrl}/concept2cure/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await ctx.screenshot('login-page');
    const btn = page.getByRole('button', { name: /demo access/i });
    ctx.expect((await btn.count()) > 0, 'Demo Access button not present on login page');
    await btn.first().click();
    await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await ctx.screenshot('after-demo-access');
    return `landed on ${new URL(page.url()).pathname}`;
  },
);

await step(
  {
    id: 'OQ-PROJ-03',
    urs: ['URS-PROJ-002'],
    title: 'Program creation validates its inputs',
    action: 'POST /api/c2c/projects with (a) no name, (b) programType "not-a-type"',
    expected: 'Both refused with HTTP 400 and a message naming the field',
  },
  async ({ api, expect }) => {
    const a = await api('POST', '/api/c2c/projects', { programType: 'ind' });
    const b = await api('POST', '/api/c2c/projects', { name: `OQ bad type ${stamp}`, programType: 'not-a-type' });
    expect(a.status === 400, `missing name: expected 400, got ${a.status}`, a.json);
    expect(b.status === 400, `bad programType: expected 400, got ${b.status}`, b.json);
    return `missing name → 400 (${JSON.stringify(a.json).slice(0, 120)}); bad type → 400 (${JSON.stringify(b.json).slice(0, 160)})`;
  },
);

await step(
  {
    id: 'OQ-PROJ-04',
    urs: ['URS-PROJ-002', 'URS-PROJ-003'],
    title: 'Create an IND program',
    action: 'POST /api/c2c/projects {name, programType:"ind", primaryAgency:"FDA", indication}',
    expected: 'HTTP 201; data.id is a UUID; the row carries the given name; meta reports what else the intake created (scaffolded document, canonical submission)',
  },
  async ({ api, expect }) => {
    const name = `OQ-001 IND program ${stamp}`;
    const r = await api('POST', '/api/c2c/projects', {
      name,
      programType: 'ind',
      primaryAgency: 'FDA',
      indication: 'Validation exercise — OQ-001',
      priority: 'medium',
    });
    expect(r.status === 201, `expected 201, got ${r.status}`, r.json);
    const row = r.json?.data ?? {};
    expect(helpers.uuidRe.test(String(row.id)), 'data.id is not a UUID', row);
    state.programId = row.id;
    state.programName = name;
    const shownName = row.title ?? row.name;
    expect(shownName === name, `name expected "${name}", got "${shownName}"`, row);
    const meta = r.json?.meta ?? {};
    return `program ${row.id} created (ws=${row.ws}, code=${row.code}); intake also created: document=${meta.documentId ?? 'none'} (${meta.scaffoldedSections ?? 0} sections), submission=${meta.submissionId ?? 'none'}; projectAnchor=${meta.projectAnchorSkipped ?? meta.projectAnchorId ?? 'n/a'}`;
  },
);

await step(
  {
    id: 'OQ-PROJ-05',
    urs: ['URS-PROJ-003'],
    title: 'Program is listed and readable for the organisation',
    action: 'GET /api/c2c/projects; GET /api/c2c/projects/:id',
    expected: 'List contains the new program; detail returns the same name',
    dependsOn: ['OQ-PROJ-04'],
  },
  async ({ api, expect }) => {
    const list = await api('GET', '/api/c2c/projects?limit=50');
    const rows = list.json?.data ?? [];
    expect(rows.some((p) => p.id === state.programId), 'new program not in list', { count: rows.length });
    const one = await api('GET', `/api/c2c/projects/${state.programId}`);
    expect(one.status === 200, `detail expected 200, got ${one.status}`, one.json);
    const d = one.json?.data ?? one.json;
    const shown = d?.title ?? d?.name;
    expect(shown === state.programName, `detail name mismatch: "${shown}"`, d);
    const productType = d?.product_type ?? d?.productType ?? d?.ws;
    return `listed (${rows.length} programs) and readable; product class shown as "${productType}"`;
  },
);

await step(
  {
    id: 'OQ-PROJ-06',
    urs: ['URS-PROJ-004'],
    title: 'Program creation is attributable in the activity feed and the hash-chained audit log verifies',
    action: 'GET /api/c2c/projects/:id/activity; GET /api/c2c/actions/verify-chain',
    expected: 'Activity has ≥1 entry for the creation with an actor and time; the audit_logs chain verifier answers ok',
    dependsOn: ['OQ-PROJ-04'],
  },
  async ({ api, expect }) => {
    const act = await api('GET', `/api/c2c/projects/${state.programId}/activity`);
    expect(act.status === 200, `activity expected 200, got ${act.status}`, act.json);
    const entries = act.json?.data ?? act.json?.activity ?? [];
    expect(Array.isArray(entries) && entries.length >= 1, 'no activity entries', act.json);
    const v = await api('GET', '/api/c2c/actions/verify-chain');
    expect(v.status === 200 && v.json?.ok === true, `verify-chain expected ok, got ${v.status}`, v.json);
    return `activity entries: ${entries.length} (first: ${JSON.stringify(entries[0]).slice(0, 160)}); verify-chain ${JSON.stringify(v.json).slice(0, 120)}`;
  },
);

await step(
  {
    id: 'OQ-PROJ-06b',
    urs: ['URS-PROJ-004'],
    title: 'Program creation appears on the organisation audit ledger surface',
    action: 'GET /api/audit-trail/ledger?limit=50 (the read model behind /concept2cure/audit-trail)',
    expected: 'At least one hash-chained entry exists for the organisation after a program was created',
    dependsOn: ['OQ-PROJ-04'],
    note: 'The ledger surface reads audit_events (server/routes/audit-trail-ledger.routes.ts:173); program intake writes its chained row to audit_logs (server/routes/c2c/projects.ts). If this step fails the two stores are not the same store.',
  },
  async ({ api, expect }) => {
    const ledger = await api('GET', '/api/audit-trail/ledger?limit=50');
    expect(ledger.status === 200, `ledger expected 200, got ${ledger.status}`, ledger.json);
    const l = ledger.json?.data ?? [];
    expect(l.length >= 1, 'audit-trail ledger surface has no entries although governed writes were made this run', ledger.json);
    return `ledger entries: ${l.length}; newest: ${JSON.stringify(l[0]).slice(0, 200)}`;
  },
);

await step(
  {
    id: 'OQ-PROJ-07',
    urs: ['URS-PROJ-005'],
    title: 'Projects surface renders the program',
    action: 'Open /concept2cure/projects in Chromium (authenticated)',
    expected: 'The program name is visible on the page',
    dependsOn: ['OQ-PROJ-04'],
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/projects');
    await ctx.expectText(state.programName);
    await ctx.screenshot();
    return 'program name visible on Projects';
  },
);

await step(
  {
    id: 'OQ-PROJ-08',
    urs: ['URS-PROJ-005'],
    title: 'Project home renders for the open program',
    action: 'Open /concept2cure/project-home with the program selected in the shell',
    expected: 'Project home renders with the program name and no runtime page error',
    dependsOn: ['OQ-PROJ-04'],
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/project-home');
    await ctx.expectText(state.programName);
    await ctx.screenshot();
    return 'project home shows the program';
  },
);

await step(
  {
    id: 'OQ-PROJ-09',
    urs: ['URS-PROJ-006'],
    title: 'Create a task and see it on the task board',
    action: 'POST /api/tasks/tasks {title, moduleType:"projects", priority:"high"}; GET /api/task-management/board',
    expected: 'Task created (2xx) with a taskId; the board lists it',
  },
  async ({ api, expect }) => {
    const title = `OQ-001 task ${stamp}`;
    const r = await api('POST', '/api/tasks/tasks', {
      title,
      description: 'Created by OQ-001 step 09',
      moduleType: 'projects',
      priority: 'high',
    });
    expect(r.status >= 200 && r.status < 300, `expected 2xx, got ${r.status}`, r.json);
    const task = r.json?.data ?? r.json?.task ?? r.json;
    state.taskTitle = title;
    const board = await api('GET', '/api/task-management/board');
    expect(board.status === 200, `board expected 200, got ${board.status}`, board.json);
    const text = JSON.stringify(board.json);
    expect(text.includes(title), 'task not on the board', { total: board.json?.total });
    return `task ${task?.taskId ?? task?.id ?? '?'} created and listed (board total ${board.json?.total})`;
  },
);

await step(
  {
    id: 'OQ-PROJ-10',
    urs: ['URS-PROJ-006'],
    title: 'Tasks surface renders the task',
    action: 'Open /concept2cure/tasks',
    expected: 'The task title is visible',
    dependsOn: ['OQ-PROJ-09'],
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/tasks');
    await ctx.expectText(state.taskTitle);
    await ctx.screenshot();
    return 'task visible on Tasks';
  },
);

await step(
  {
    id: 'OQ-PROJ-11',
    urs: ['URS-PROJ-007'],
    title: 'Program journey read model answers',
    action: 'GET /api/program-journey',
    expected: 'HTTP 200 with data[] (empty is honest for a new program)',
  },
  async ({ api, expect, deviation, deniedTables }) => {
    const r = await api('GET', '/api/program-journey');
    if (r.status === 500 && deniedTables().includes('public.program_journeys')) {
      // The route swallows the database error (server/routes/program-journey.routes.ts:59-63),
      // so the attribution comes from IQ-07's recorded grant inventory, not from a guess.
      deviation('IQ-DEV-001: public.program_journeys is listed as unreadable by the runtime role in IQ-07 (IQ/db-role-denied-tables.json); the route answers 500 and hides the cause. Re-execute after the grant is applied.', r.json);
    }
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    return `HTTP 200, ${r.json?.meta?.count ?? 0} journeys`;
  },
);

await step(
  {
    id: 'OQ-PROJ-12',
    urs: ['URS-PROJ-007'],
    title: 'Filings catalog surface renders',
    action: 'Open /concept2cure/filings-catalog',
    expected: 'Surface renders (screenshot) without a runtime page error',
  },
  async (ctx) => {
    await ctx.newPage({ id: state.programId, name: state.programName });
    await ctx.goto('/concept2cure/filings-catalog');
    await ctx.screenshot();
    const errs = (await ctx.page.evaluate(() => document.body.innerText)).length;
    ctx.expect(errs > 0, 'page body is empty');
    return 'rendered';
  },
);

await step(
  {
    id: 'OQ-PROJ-13',
    urs: ['URS-PROJ-008'],
    title: 'Launch scope is enforced in the navigation verdicts',
    action: 'GET /api/module-subscriptions/navigation',
    expected: 'launchScope.enforced=true; the out-of-scope surface "rbm" is not entitled with source "launch-scope"; all six launch apps\' primary surfaces are entitled',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/module-subscriptions/navigation');
    expect(r.status === 200, `expected 200, got ${r.status}`, r.json);
    const j = r.json ?? {};
    expect(j.launchScope?.enforced === true, 'launchScope.enforced is not true', j.launchScope);
    const arr = Object.values(j).find((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object' && 'entitled' in x)) ?? [];
    const byId = Object.fromEntries(arr.map((v) => [v.id, v]));
    expect(byId.rbm && byId.rbm.entitled === false && byId.rbm.source === 'launch-scope', 'rbm not launch-scope locked', byId.rbm);
    const launch = ['projects', 'vault', 'document-authoring', 'submission-center', 'dispatch-readiness', 'quality'];
    const missing = launch.filter((id) => !(byId[id] && byId[id].entitled === true));
    expect(missing.length === 0, `launch surfaces not entitled: ${missing.join(', ')}`, launch.map((id) => byId[id]));
    return `${arr.length} verdicts; rbm locked by launch-scope; launch surfaces entitled`;
  },
);

await step(
  {
    id: 'OQ-PROJ-14',
    urs: ['URS-PROJ-008'],
    title: 'Deep link to an out-of-scope surface shows the launch-scope gate',
    action: 'Open /concept2cure/rbm',
    expected: 'The page explains the surface is not in this release (no RBM content, no upsell)',
  },
  async (ctx) => {
    await ctx.newPage(null);
    await ctx.goto('/concept2cure/rbm');
    await ctx.expectText(/not in this release/i);
    await ctx.screenshot();
    return 'launch-scope gate rendered';
  },
);

await step(
  {
    id: 'OQ-PROJ-15',
    urs: ['URS-PROJ-009'],
    title: 'A program id the organisation does not own is not readable',
    action: 'GET /api/c2c/projects/<random uuid>',
    expected: 'HTTP 404 (never 200, never 500)',
  },
  async ({ api, expect }) => {
    const r = await api('GET', '/api/c2c/projects/00000000-0000-4000-8000-000000000000');
    expect(r.status === 404, `expected 404, got ${r.status}`, r.json);
    return 'HTTP 404';
  },
);

const result = await run.finish();
process.exit(result.counts.fail > 0 ? 1 : 0);
