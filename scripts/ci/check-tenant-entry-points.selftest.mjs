#!/usr/bin/env node
/**
 * Self-test for scripts/ci/check-tenant-entry-points.mjs (ci:tenant-entry-points).
 *
 * The gate reports OK on the current tree — every unconsidered entry point is
 * baselined with a written reason — so in normal use its failure branches never
 * fire, and a guard whose failure branch has never been seen has not been tested
 * (CLAUDE.md, working agreement: "verify by making the check fail").
 *
 * Each case builds a throwaway tree in a temp directory and runs the REAL gate
 * against it as a subprocess, through the gate's own TENANT_ENTRY_POINTS_ROOT
 * hook, so what is tested is the command CI runs, not a re-implementation of it.
 * Baselines are produced by the gate's own --write-baseline (inside the fixture
 * tree), so the selftest never re-derives the gate's digest.
 *
 * The failing fixtures are the defects the gate's header names, at the paths
 * where they were found:
 *   1. /api/v1 (server/routes/public-api.ts) — X-API-Key auth, allowlisted out of
 *      the session boundary, so a suspended tenant's key kept read AND write;
 *   3. server/jobs/taskDueSweep.ts — a system-scope sweep that kept notifying
 *      suspended tenants;
 *   4. Socket.IO (server/socketServer.ts) — a handshake with no entitlement check;
 * plus the worker and SCIM shapes the gate also enumerates, the comment-only
 * "considered" near-miss, and the 2026-09-23 string-literal comment-stripper
 * hazard. Defect 2 (hocuspocus) is a KNOWN GAP — see below.
 *
 * Every alternative of every shape predicate is exercised ON ITS OWN. A fixture
 * that carries two trigger tokens (runWithSystemTenantScope AND setInterval)
 * still matches when either alternative is deleted from the gate, so it proves
 * neither. One FAILS case per alternative, each holding exactly that one token:
 *   scheduled-sweep  — setInterval only; cron.schedule only; runWithSystemTenantScope
 *                      only (an exported sweep with no timer: the externally
 *                      scheduled shape, and the one the gate's comment calls
 *                      defining — "a sweep that opens a system-wide scope reaches
 *                      every tenant by definition");
 *   worker           — setInterval only; runWithSystemTenantScope only;
 *                      withTenantConnection only;
 *   alternative-auth — the x-api-key header read with no validateApiKey;
 *                      validateApiKey with no header name; SCIM named only in
 *                      upper case (pins the /i flag);
 *   file walk        — a .js sweep and a .mjs worker (the walk is not .ts-only).
 * Near-miss clean cases a sloppy gate would flag: a session router that names
 * X-API-Key/SCIM only in comments, a test file and a helper in server/jobs, and a
 * server/ root file that is NOT a socket transport but carries setInterval and
 * runWithSystemTenantScope in code (the socket shape scans every server/ root
 * file with matches: () => true, so its filename filter is all that stands
 * between it and a false positive on every one of them).
 *
 * Baseline semantics asserted: a justified entry with a current digest
 * suppresses; an entry still carrying the generated TODO fails; a justified
 * entry whose file changed — code OR comment — fails until re-justified; a CRLF
 * checkout of an unchanged file does not count as a change; a baselined entry
 * that now considers entitlement is reported for ratcheting (not a failure);
 * --write-baseline keeps a written reason and refreshes only the digest; a
 * baseline entry for one file does not suppress a different new one.
 *
 * The comment-only drift case changes words INSIDE an existing comment without
 * changing its length ("six" -> "ten"), so the comment-stripped code is
 * byte-identical (asserted before any case runs) and only a digest over the
 * full text — what the gate's own comment promises — can see the change. Adding
 * a whole comment line would not prove that: stripComments keeps the line as
 * blanks plus a newline, so the stripped code changes too.
 *
 * KNOWN GAPS in the gate. These are NOT encoded as passing cases — a case that
 * expects a defect to pass would pin the defect. Each is a tripwire instead: it
 * prints "KNOWN GAP still open: …" on EVERY run, so CI output says what the gate
 * does not catch; the summary line stops claiming full coverage while any is
 * open; and it FAILS the moment the gate starts catching it, so the marker is
 * converted into an ordinary FAILS case in the same change that closes the gap.
 *   - Defect 2 (hocuspocus): walk() is non-recursive. The socket-transport shape
 *     scans `server/` only, but the hocuspocus server lives at
 *     server/services/hocuspocus-server.ts, so one of the four defects in the
 *     gate's own header is never discovered; removing its getTenantAccessPosture
 *     call would pass CI.
 *   - Nested routers: the same walk() never descends into server/routes/<dir>/,
 *     so an X-API-Key router one directory down (server/routes/admin/scim-*.ts
 *     live there today) is never scanned.
 *   - A baseline entry with an empty or missing `reason` passes; only a reason
 *     beginning "TODO(" is rejected.
 *
 * Hermeticity. Several cases run --write-baseline. Before any case, a probe tree
 * holding ONE uniquely named sentinel entry point must be reported as exactly
 * one entry point against an empty baseline, and --write-baseline there must
 * write the probe tree's baseline with exactly that one key; a gate that ignored
 * TENANT_ENTRY_POINTS_ROOT for reading or writing stops the run there. After the
 * run the repository's real baseline must be byte-identical. If it is not, it is
 * restored ONLY when the new content is recognisably this selftest's fixture
 * output (every key is a path a fixture wrote); any other change came from
 * someone else in a shared tree (a concurrent session, a legitimate
 * write-baseline) and is left exactly as found. Both outcomes fail the run.
 *
 * Usage:
 *   node scripts/ci/check-tenant-entry-points.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-tenant-entry-points.selftest.mjs
 *     (run the cases against a different copy of the gate — the mutation check;
 *      the copy must still resolve its ./lib/strip-comments.mjs import)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripComments } from './lib/strip-comments.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TAG = '[ci:tenant-entry-points:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-tenant-entry-points.mjs');
const REAL_BASELINE = path.join(repoRoot, 'docs', 'reports', 'tenant-entry-points-baseline.json');
const FIXTURE_BASELINE_REL = path.join('docs', 'reports', 'tenant-entry-points-baseline.json');

// ── Fixtures: the real defect shapes ─────────────────────────────────────────

/** Defect 1 — /api/v1: authenticated by X-API-Key, so never behind enforceTenantLifecycle. */
const API_V1_DEFECT = `import { Router } from 'express';
import { validateApiKey } from '../services/api-key-service.js';

const router = Router();

// /api/v1 is allowlisted out of the session auth boundary: it authenticates
// with an API key instead.
async function requireApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'] as string;
  if (!rawKey) {
    return res.status(401).json({ message: 'Provide your API key in the X-API-Key header' });
  }
  const key = await validateApiKey(rawKey);
  if (!key) return res.status(401).json({ message: 'Invalid API key' });
  req.organizationId = key.organizationId;
  next();
}

router.get('/documents', requireApiKey, async (req, res) => {
  res.json(await listDocuments(req.organizationId));
});
router.post('/documents', requireApiKey, async (req, res) => {
  res.status(201).json(await createDocument(req.organizationId, req.body));
});

export default router;
`;

/** Defect 1, fixed the way public-api.ts was: posture resolved per request, method checked. */
const API_V1_FIXED = API_V1_DEFECT.replace(
  "import { validateApiKey } from '../services/api-key-service.js';",
  "import { validateApiKey } from '../services/api-key-service.js';\n" +
    "import { decisionPermitsMethod, getTenantAccessPosture } from '../services/tenant/tenant-lifecycle';",
).replace(
  '  req.organizationId = key.organizationId;',
  '  const posture = await getTenantAccessPosture(key.organizationId);\n' +
    "  if (!decisionPermitsMethod(posture, req.method)) {\n" +
    "    return res.status(403).json({ message: 'tenant_inactive' });\n" +
    '  }\n' +
    '  req.organizationId = key.organizationId;',
);

/**
 * Defect 1's header read, without validateApiKey: an inbound-webhook router that
 * reads the x-api-key header and resolves the tenant from it itself.
 */
const API_KEY_HEADER_ONLY = `import { Router } from 'express';
import { findOrganizationByInboundKey } from '../services/partners/inbound-keys';

const router = Router();

router.post('/webhooks/inbound', async (req, res) => {
  const key = req.get('x-api-key');
  const org = key ? await findOrganizationByInboundKey(key) : null;
  if (!org) return res.sendStatus(401);
  await ingestPartnerEvent(org.id, req.body);
  res.sendStatus(202);
});

export default router;
`;

/** Defect 1's validator, without the header name: the key arrives as a bearer token. */
const VALIDATE_API_KEY_ONLY = `import { Router } from 'express';
import { validateApiKey } from '../services/api-key-service.js';

const router = Router();

router.use(async (req, res, next) => {
  const bearer = (req.get('authorization') ?? '').replace(/^Bearer /, '');
  const key = bearer ? await validateApiKey(bearer) : null;
  if (!key) return res.sendStatus(401);
  req.organizationId = key.organizationId;
  next();
});

router.get('/studies', async (req, res) => {
  res.json(await listStudies(req.organizationId));
});

export default router;
`;

/** Defect 3 — the task-due sweep: system scope, every tenant, notifications out. */
const TASK_SWEEP_DEFECT = `import { and, lt, isNull } from 'drizzle-orm';
import { runWithSystemTenantScope } from '../db/tenantStore';

const DUE_SOON_WINDOW_MS = 48 * 3600_000;

/** One sweep across every open, dated, assigned task in every organization. */
export async function runTaskDueSweep() {
  return runWithSystemTenantScope('task-due-sweep', async () => {
    const { db } = await import('../db');
    const { unifiedTasks } = await import('../../shared/schema');
    const rows = await db
      .select()
      .from(unifiedTasks)
      .where(and(isNull(unifiedTasks.deletedAt), lt(unifiedTasks.dueDate, new Date(Date.now() + DUE_SOON_WINDOW_MS))))
      .limit(500);
    const { notifyTaskEvent } = await import('../services/tasking/task-side-effects');
    for (const row of rows) {
      await notifyTaskEvent('task.due_soon', row);
    }
  });
}

let timer = null;
export function startTaskDueSweep(intervalMs = 15 * 60_000) {
  timer = setInterval(() => void runTaskDueSweep(), intervalMs);
}
`;

/** Defect 3, fixed the way taskDueSweep.ts was: one posture lookup per organization. */
const TASK_SWEEP_FIXED = TASK_SWEEP_DEFECT.replace(
  "import { runWithSystemTenantScope } from '../db/tenantStore';",
  "import { runWithSystemTenantScope } from '../db/tenantStore';\n" +
    "import { filterTenantsForBackgroundWork } from '../services/tenant/tenant-lifecycle';",
).replace(
  '    for (const row of rows) {\n',
  '    const allowedOrgs = await filterTenantsForBackgroundWork(rows.map(r => r.organizationId));\n' +
    '    for (const row of rows) {\n' +
    '      if (!allowedOrgs.has(row.organizationId)) continue;\n',
);

/** A sweep triggered by setInterval alone, no system scope: per-tenant reminders on a timer. */
const SWEEP_TIMER_ONLY = `import { lt } from 'drizzle-orm';
import { db } from '../db';
import { documentDrafts } from '../../shared/schema';

const STALE_AFTER_MS = 7 * 24 * 3600_000;

export function startStaleDraftReminder(intervalMs = 60 * 60_000) {
  return setInterval(async () => {
    const stale = await db
      .select()
      .from(documentDrafts)
      .where(lt(documentDrafts.updatedAt, new Date(Date.now() - STALE_AFTER_MS)));
    for (const d of stale) await notifyAuthor(d.organizationId, d.authorId, d.id);
  }, intervalMs);
}
`;

/** A sweep triggered by node-cron alone: a morning digest to every organization. */
const SWEEP_CRON_ONLY = `import cron from 'node-cron';
import { db } from '../db';
import { organizations } from '../../shared/schema';
import { emailDigest } from '../services/digest/email-digest';

/** Every morning, a digest to every organization. */
export function scheduleOrgDigest() {
  cron.schedule('0 8 * * *', async () => {
    const orgs = await db.select({ id: organizations.id }).from(organizations);
    for (const o of orgs) await emailDigest(o.id);
  });
}
`;

/**
 * A system-scope sweep with no timer in the file: the externally scheduled shape
 * (the platform scheduler calls the export). It still reaches every tenant.
 */
const SWEEP_SYSTEM_SCOPE_ONLY = `import { runWithSystemTenantScope } from '../db/tenantStore';
import { db } from '../db';
import { organizations } from '../../shared/schema';
import { emailDigest } from '../services/digest/email-digest';

/** Invoked by the platform's external scheduler; this module starts no timer. */
export async function runOrgDigest() {
  return runWithSystemTenantScope('org-digest', async () => {
    const orgs = await db.select({ id: organizations.id }).from(organizations);
    for (const o of orgs) await emailDigest(o.id);
  });
}
`;

/** Defect 4 — Socket.IO: a third transport, handshake verifies identity only. */
const SOCKET_IO_DEFECT = `import { Server } from 'socket.io';
import { verifyToken } from './auth/jwt';

export function attachSocketServer(httpServer) {
  const io = new Server(httpServer, { path: '/socket.io' });
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    const principal = token ? await verifyToken(token) : null;
    if (!principal) return next(new Error('unauthorized'));
    socket.data.organizationId = principal.organizationId;
    next();
  });
  io.on('connection', socket => {
    socket.join(\`org:\${socket.data.organizationId}\`);
  });
  return io;
}
`;

/** Defect 4, fixed the way socketServer.ts was: entitlement checked at the handshake. */
const SOCKET_IO_FIXED = SOCKET_IO_DEFECT.replace(
  "import { verifyToken } from './auth/jwt';",
  "import { verifyToken } from './auth/jwt';\n" +
    "import { shouldProcessTenantInBackground } from './services/tenant/tenant-lifecycle.js';",
).replace(
  "    socket.data.organizationId = principal.organizationId;\n",
  '    const entitled = await shouldProcessTenantInBackground(principal.organizationId);\n' +
    "    if (!entitled) return next(new Error('tenant_inactive'));\n" +
    '    socket.data.organizationId = principal.organizationId;\n',
);

/**
 * Defect 2 — the hocuspocus collaboration socket, at its real path. A pure write
 * channel: onAuthenticate verifies identity and membership, never entitlement.
 */
const HOCUSPOCUS_DEFECT = `import { Hocuspocus } from '@hocuspocus/server';
import { verifySessionToken } from '../auth/session-token';
import { checkOrgMembership } from './org-membership';

export function createHocuspocusServer() {
  return new Hocuspocus({
    async onAuthenticate({ token, documentName }) {
      const session = await verifySessionToken(token);
      if (!session) throw new Error('unauthorized');
      const member = await checkOrgMembership(session.userId, session.organizationId);
      if (!member) throw new Error('forbidden');
      return { userId: session.userId, tenantId: session.organizationId, documentName };
    },
  });
}
`;

/** A server/ root file that is NOT a socket transport, with sweep tokens in code. */
const SERVER_INDEX = `import express from 'express';
import { runWithSystemTenantScope } from './db/tenantStore';
import { attachSocketServer } from './socketServer';
import { flushMetrics } from './observability/metrics';

const app = express();
const server = app.listen(Number(process.env.PORT ?? 5000));
attachSocketServer(server);

setInterval(() => void runWithSystemTenantScope('metrics-flush', flushMetrics), 60_000);
`;

/** The worker shape: a polling claim loop under system scope, then per-tenant work. */
const WORKER_DEFECT = `import { runWithSystemTenantScope, runWithTenantScope } from '../db/tenantStore';

async function processJob(job) {
  return runWithTenantScope(job.organizationId, () => buildIvdrPack(job));
}

let workerTimer = null;
export function startIvdrPackWorker() {
  workerTimer = setInterval(async () => {
    await runWithSystemTenantScope('ivdr-pack-worker:claim', async () => {
      const job = await claimNextJob();
      if (job) await processJob(job);
    });
  }, 5000);
}
`;

/** A worker triggered by setInterval alone: poll, claim, per-tenant work. */
const WORKER_TIMER_ONLY = `export function startThumbnailWorker() {
  return setInterval(async () => {
    const job = await claimNextThumbnailJob();
    if (job) await renderThumbnail(job.organizationId, job.documentId);
  }, 2000);
}
`;

/** A worker that drains a queue under system scope, with no timer of its own. */
const WORKER_SYSTEM_SCOPE_ONLY = `import { runWithSystemTenantScope } from '../db/tenantStore';

export async function drainReindexQueue() {
  return runWithSystemTenantScope('reindex-worker:drain', async () => {
    for (const job of await claimReindexJobs(50)) {
      await reindexDocument(job.organizationId, job.documentId);
    }
  });
}
`;

/** A queue-consumer worker that opens a tenant connection per job, with no timer. */
const WORKER_TENANT_CONNECTION_ONLY = `import { withTenantConnection } from '../db/tenantConnection';

/** Called by the queue consumer for each export job. */
export async function handleExportJob(job) {
  return withTenantConnection(job.organizationId, async client => {
    const rows = await client.query('SELECT * FROM vault.documents WHERE id = ANY($1)', [job.documentIds]);
    await writeExportBundle(job.id, rows.rows);
  });
}
`;

/** The SCIM shape: bearer-token provisioning, outside the session boundary. */
const SCIM_DEFECT = `import { Router } from 'express';
import { scimBearerAuth } from '../services/scim/scim-auth';

const router = Router();
router.use(scimBearerAuth);
router.post('/Users', async (req, res) => {
  res.status(201).json(await provisionUser(req.scimOrganizationId, req.body));
});
export default router;
`;

/** SCIM bearer auth where the code names SCIM only in upper case — pins the matcher's /i. */
const SCIM_UPPERCASE_ONLY = `import { Router } from 'express';
import { findTenantByProvisioningToken } from '../services/provisioning/tokens';

const SCIM_BEARER_PREFIX = 'Bearer ';

const router = Router();
router.use(async (req, res, next) => {
  const header = req.get('authorization') ?? '';
  if (!header.startsWith(SCIM_BEARER_PREFIX)) return res.sendStatus(401);
  const tenant = await findTenantByProvisioningToken(header.slice(SCIM_BEARER_PREFIX.length));
  if (!tenant) return res.sendStatus(401);
  req.organizationId = tenant.organizationId;
  next();
});
router.post('/Users', async (req, res) => {
  res.status(201).json(await provisionUser(req.organizationId, req.body));
});
export default router;
`;

/**
 * A sweep that reads only public regulator feeds into a global table — the kind
 * of surface that is legitimately baselined, with a reason, rather than wired.
 * The comment above the timer is what the comment-only drift case edits.
 */
const HORIZON_SCAN = `import { runWithSystemTenantScope } from '../db/tenantStore';

export async function runHorizonScan() {
  return runWithSystemTenantScope('regulatory-horizon-scan', async () => {
    const items = await fetchPublicRegulatorFeeds();
    await db.insert(regulatoryHorizonItems).values(items).onConflictDoNothing();
  });
}

export function startHorizonScan() {
  // Runs every six hours.
  setInterval(() => void runHorizonScan(), 6 * 3600_000);
}
`;
const HORIZON_REASON =
  'Reads only public regulator feeds into a global, non-tenant table; it reads and writes no ' +
  'tenant rows and sends nothing to any tenant, so there is no tenant whose entitlement to check.';

/** The same sweep after someone adds a per-tenant fan-out — the justification stops being true. */
const HORIZON_SCAN_FANOUT = HORIZON_SCAN.replace(
  '    await db.insert(regulatoryHorizonItems).values(items).onConflictDoNothing();\n',
  '    await db.insert(regulatoryHorizonItems).values(items).onConflictDoNothing();\n' +
    '    const subscribers = await db.select().from(horizonSubscriptions);\n' +
    '    for (const s of subscribers) await notifyOrganization(s.organizationId, items);\n',
);

/** The fan-out, wired: per-subscriber entitlement check. */
const HORIZON_SCAN_WIRED = HORIZON_SCAN_FANOUT.replace(
  '    for (const s of subscribers) await notifyOrganization(s.organizationId, items);\n',
  '    for (const s of subscribers) {\n' +
    '      if (!(await shouldProcessTenantInBackground(s.organizationId))) continue;\n' +
    '      await notifyOrganization(s.organizationId, items);\n' +
    '    }\n',
);

/**
 * A comment-only edit, same length: the comment-stripped code is byte-identical
 * (asserted below), so only a digest over the FULL text sees this change.
 */
const HORIZON_SCAN_COMMENTED = HORIZON_SCAN.replace('// Runs every six hours.', '// Runs every ten hours.');

const SCHED = p => `    ${p}  (scheduled-sweep)`;
const WORKER = p => `    ${p}  (worker)`;
const AUTH = p => `    ${p}  (alternative-auth-router)`;
const COUNT = n => `] ${n} entry point(s);`;

// ── Harness ──────────────────────────────────────────────────────────────────

/** Every path any fixture tree is given — how a changed real baseline is recognised as ours. */
const FIXTURE_PATHS = new Set();

function writeFiles(root, files) {
  for (const [rel, body] of Object.entries(files)) {
    FIXTURE_PATHS.add(rel);
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

function gate(root, args = []) {
  const res = spawnSync(process.execPath, [GATE, ...args], {
    env: { ...process.env, TENANT_ENTRY_POINTS_ROOT: root },
    encoding: 'utf8',
  });
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}${res.error ? String(res.error) : ''}` };
}

function readBaseline(root) {
  return JSON.parse(fs.readFileSync(path.join(root, FIXTURE_BASELINE_REL), 'utf8'));
}

/** --write-baseline in the fixture tree, then replace the generated TODO with a written reason. */
function baselineWithReason(root, rel, reason) {
  const w = gate(root, ['--write-baseline']);
  if (w.code !== 0) throw new Error(`--write-baseline exited ${w.code}:\n${w.out}`);
  const b = readBaseline(root);
  if (!b.unconsidered?.[rel]) throw new Error(`--write-baseline did not record ${rel}`);
  b.unconsidered[rel].reason = reason;
  fs.writeFileSync(path.join(root, FIXTURE_BASELINE_REL), `${JSON.stringify(b, null, 2)}\n`);
}

const cases = [
  // ── The defects the gate exists for ────────────────────────────────────────
  {
    name: 'FAILS on defect 1 — the /api/v1 X-API-Key router with no entitlement check',
    files: { 'server/routes/public-api.ts': API_V1_DEFECT },
    expectExit: 1,
    expectIn: ['NEW tenant entry point', AUTH('server/routes/public-api.ts')],
  },
  {
    name: 'FAILS on defect 3 — the system-scope task-due sweep that notified suspended tenants',
    files: { 'server/jobs/taskDueSweep.ts': TASK_SWEEP_DEFECT },
    expectExit: 1,
    expectIn: ['NEW tenant entry point', SCHED('server/jobs/taskDueSweep.ts')],
  },
  {
    name: 'FAILS on defect 4 — the Socket.IO handshake that verifies identity but not entitlement',
    files: { 'server/socketServer.ts': SOCKET_IO_DEFECT },
    expectExit: 1,
    expectIn: ['NEW tenant entry point', '    server/socketServer.ts  (socket-transport)'],
  },
  {
    name: 'FAILS on the worker shape — a system-scope claim loop with per-tenant work and no check',
    files: { 'server/workers/ivdr-pack-worker.ts': WORKER_DEFECT },
    expectExit: 1,
    expectIn: [WORKER('server/workers/ivdr-pack-worker.ts')],
  },
  {
    name: 'FAILS on a SCIM-authenticated router with no entitlement check',
    files: { 'server/routes/scim.ts': SCIM_DEFECT },
    expectExit: 1,
    expectIn: [AUTH('server/routes/scim.ts')],
  },
  {
    name: 'FAILS when the entitlement call is named only in a comment (a TODO is not a check)',
    files: {
      'server/jobs/taskDueSweep.ts': TASK_SWEEP_DEFECT.replace(
        '    for (const row of rows) {\n',
        '    // TODO: filterTenantsForBackgroundWork(rows.map(r => r.organizationId)) before notifying\n' +
          '    for (const row of rows) {\n',
      ),
    },
    expectExit: 1,
    expectIn: [SCHED('server/jobs/taskDueSweep.ts')],
  },
  {
    name: "FAILS on an X-API-Key read that follows a string holding '/*' (the 2026-09-23 stripper hazard)",
    files: {
      'server/routes/public-api.ts':
        "const V1_GLOB = '/api/v1/*';\n" + API_V1_DEFECT + "const BANNER = 'deprecated */ use v2';\n",
    },
    expectExit: 1,
    expectIn: [AUTH('server/routes/public-api.ts')],
  },

  // ── Each trigger alternative on its own (one token per fixture) ────────────
  {
    name: 'FAILS on a sweep whose only trigger is setInterval (no system scope)',
    files: { 'server/jobs/staleDraftReminder.ts': SWEEP_TIMER_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), SCHED('server/jobs/staleDraftReminder.ts')],
  },
  {
    name: 'FAILS on a sweep whose only trigger is cron.schedule',
    files: { 'server/jobs/orgDigestCron.ts': SWEEP_CRON_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), SCHED('server/jobs/orgDigestCron.ts')],
  },
  {
    name: 'FAILS on an externally scheduled sweep: runWithSystemTenantScope, no timer in the file',
    files: { 'server/jobs/orgDigest.ts': SWEEP_SYSTEM_SCOPE_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), SCHED('server/jobs/orgDigest.ts')],
  },
  {
    name: 'FAILS on a worker whose only trigger is setInterval',
    files: { 'server/workers/thumbnail-worker.ts': WORKER_TIMER_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), WORKER('server/workers/thumbnail-worker.ts')],
  },
  {
    name: 'FAILS on a worker whose only trigger is runWithSystemTenantScope',
    files: { 'server/workers/reindex-worker.ts': WORKER_SYSTEM_SCOPE_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), WORKER('server/workers/reindex-worker.ts')],
  },
  {
    name: 'FAILS on a queue-consumer worker whose only trigger is withTenantConnection',
    files: { 'server/workers/export-worker.ts': WORKER_TENANT_CONNECTION_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), WORKER('server/workers/export-worker.ts')],
  },
  {
    name: 'FAILS on a .js sweep and a .mjs worker (the walk is not .ts-only)',
    files: {
      'server/jobs/legacyTaskDueSweep.js': TASK_SWEEP_DEFECT,
      'server/workers/ivdr-pack-worker.mjs': WORKER_DEFECT,
    },
    expectExit: 1,
    expectIn: [
      COUNT(2),
      '2 NEW tenant entry point',
      SCHED('server/jobs/legacyTaskDueSweep.js'),
      WORKER('server/workers/ivdr-pack-worker.mjs'),
    ],
  },
  {
    name: 'FAILS on a router that reads the x-api-key header and checks it itself (no validateApiKey)',
    files: { 'server/routes/webhooks-inbound.ts': API_KEY_HEADER_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), AUTH('server/routes/webhooks-inbound.ts')],
  },
  {
    name: 'FAILS on a router that calls validateApiKey on a bearer token (no x-api-key header)',
    files: { 'server/routes/partner-api.ts': VALIDATE_API_KEY_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), AUTH('server/routes/partner-api.ts')],
  },
  {
    name: 'FAILS on a SCIM bearer router whose code names SCIM only in upper case (the matcher is /i)',
    files: { 'server/routes/directory-sync.ts': SCIM_UPPERCASE_ONLY },
    expectExit: 1,
    expectIn: [COUNT(1), AUTH('server/routes/directory-sync.ts')],
  },

  // ── Clean shapes, including near-misses a sloppy gate would flag ───────────
  {
    name: 'quiet — each defect shape, wired to the lifecycle vocabulary, passes',
    files: {
      'server/routes/public-api.ts': API_V1_FIXED,
      'server/jobs/taskDueSweep.ts': TASK_SWEEP_FIXED,
      'server/socketServer.ts': SOCKET_IO_FIXED,
    },
    expectExit: 0,
    expectIn: [`${COUNT(3)} 3 consider tenant entitlement, 0 do not`, 'OK — no unclassified'],
  },
  {
    name: 'quiet — a session router that names X-API-Key and SCIM only in comments (F-31/F-32)',
    files: {
      'server/routes/admin-security.ts':
        '// The SCIM consoles and the X-API-Key public API are guarded elsewhere; this\n' +
        '// router serves session-authenticated admin settings only.\n' +
        "/* Previously: const key = req.get('x-api-key'); validateApiKey(key) */\n" +
        "router.get('/admin/security/settings', requireAuth, async (req, res) => {\n" +
        '  res.json(await getSecuritySettings(req.organizationId));\n' +
        '});\n',
    },
    expectExit: 0,
    expectIn: [COUNT(0), 'OK — no unclassified'],
  },
  {
    name: 'quiet — a test file and a pure helper in server/jobs are not entry points',
    files: {
      'server/jobs/taskDueSweep.test.ts': TASK_SWEEP_DEFECT,
      'server/jobs/sweepWindow.ts':
        '// Shared by the setInterval in taskDueSweep.ts, which runs under runWithSystemTenantScope.\n' +
        'export const DUE_SOON_WINDOW_MS = 48 * 3600_000;\n' +
        'export function isOverdue(due, now) {\n' +
        '  return due.getTime() < now;\n' +
        '}\n',
    },
    expectExit: 0,
    expectIn: [COUNT(0), 'OK — no unclassified'],
  },
  {
    name: 'quiet — a server/ root file that is not a socket transport, with timer and system scope in code',
    files: { 'server/index.ts': SERVER_INDEX },
    expectExit: 0,
    expectIn: [COUNT(0), 'OK — no unclassified'],
  },

  // ── Baseline semantics ─────────────────────────────────────────────────────
  {
    name: 'quiet — a baselined entry point with a written reason and a current digest',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', HORIZON_REASON),
    expectExit: 0,
    expectIn: ['1 do not (baseline 1)', 'OK — no unclassified'],
  },
  {
    name: 'FAILS when --write-baseline is run and the generated TODO is left as the reason',
    files: { 'server/jobs/taskDueSweep.ts': TASK_SWEEP_DEFECT },
    prepare: root => {
      const w = gate(root, ['--write-baseline']);
      if (w.code !== 0) throw new Error(`--write-baseline exited ${w.code}:\n${w.out}`);
    },
    expectExit: 1,
    expectIn: ['carry an unfilled TODO', '    server/jobs/taskDueSweep.ts'],
    check: root => {
      const reason = readBaseline(root).unconsidered?.['server/jobs/taskDueSweep.ts']?.reason ?? '';
      return reason.startsWith('TODO(scheduled-sweep)')
        ? []
        : [`generated reason was ${JSON.stringify(reason)}, expected TODO(scheduled-sweep)…`];
    },
  },
  {
    name: 'FAILS when a justified file later gains a per-tenant fan-out (digest drift)',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => {
      baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', HORIZON_REASON);
      writeFiles(root, { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN_FANOUT });
    },
    expectExit: 1,
    expectIn: ['CHANGED since justification', SCHED('server/jobs/regulatoryHorizonScan.ts')],
  },
  {
    name: 'FAILS when only words inside a comment change, stripped code identical (digest is over the full text)',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => {
      baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', HORIZON_REASON);
      writeFiles(root, { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN_COMMENTED });
    },
    expectExit: 1,
    expectIn: ['CHANGED since justification', SCHED('server/jobs/regulatoryHorizonScan.ts')],
  },
  {
    name: 'quiet — a CRLF checkout of an unchanged justified file is not drift',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => {
      baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', HORIZON_REASON);
      writeFiles(root, { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN.replace(/\n/g, '\r\n') });
    },
    expectExit: 0,
    expectIn: ['OK — no unclassified'],
  },
  {
    name: '--write-baseline refreshes a drifted digest and keeps the written reason',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => {
      baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', HORIZON_REASON);
      writeFiles(root, { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN_COMMENTED });
      const w = gate(root, ['--write-baseline']);
      if (w.code !== 0) throw new Error(`--write-baseline exited ${w.code}:\n${w.out}`);
    },
    expectExit: 0,
    expectIn: ['OK — no unclassified'],
    check: root => {
      const reason = readBaseline(root).unconsidered?.['server/jobs/regulatoryHorizonScan.ts']?.reason;
      return reason === HORIZON_REASON ? [] : [`refresh replaced the written reason with ${JSON.stringify(reason)}`];
    },
  },
  {
    name: 'reports (does not fail) a baselined entry that now considers entitlement — ratchet tighter',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => {
      baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', HORIZON_REASON);
      writeFiles(root, { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN_WIRED });
    },
    expectExit: 0,
    expectIn: [
      '1 consider tenant entitlement, 0 do not (baseline 1)',
      'now consider it or were removed: server/jobs/regulatoryHorizonScan.ts',
      'Ratchet tighter',
    ],
  },
  {
    name: 'FAILS on a new entry point even when a different one is justified in the baseline',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => {
      baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', HORIZON_REASON);
      writeFiles(root, { 'server/routes/public-api.ts': API_V1_DEFECT });
    },
    expectExit: 1,
    expectIn: ['1 NEW tenant entry point', AUTH('server/routes/public-api.ts')],
    expectNotIn: ['regulatoryHorizonScan.ts  ('],
  },

  // ── Known gaps: reported every run, fail once the gate closes them ─────────
  // `gapHolds` is what the gate does TODAY. When it stops holding, the gap has
  // closed (or the gate broke): either way the run fails and says which.
  {
    name: 'defect 2 — the hocuspocus socket at its real path, server/services/hocuspocus-server.ts',
    knownGap:
      'defect 2 (hocuspocus) undetected — walk() is non-recursive and the socket-transport ' +
      'shape scans only server/*, so server/services/hocuspocus-server.ts is never read',
    files: { 'server/services/hocuspocus-server.ts': HOCUSPOCUS_DEFECT },
    gapHolds: ({ code, out }) => code === 0 && out.includes(COUNT(0)),
    closedWhen: ({ code, out }) => code === 1 && out.includes('    server/services/hocuspocus-server.ts  ('),
  },
  {
    name: 'an X-API-Key router one directory down, server/routes/v2/public-api.ts',
    knownGap:
      'nested routers undetected — walk() never descends into server/routes/<dir>/, so a ' +
      'defect-1-shaped router there is never read',
    files: { 'server/routes/v2/public-api.ts': API_V1_DEFECT },
    gapHolds: ({ code, out }) => code === 0 && out.includes(COUNT(0)),
    closedWhen: ({ code, out }) => code === 1 && out.includes('    server/routes/v2/public-api.ts  ('),
  },
  {
    name: 'a baseline entry whose reason is empty',
    knownGap:
      'an empty or missing baseline reason passes — only a reason beginning "TODO(" is rejected',
    files: { 'server/jobs/regulatoryHorizonScan.ts': HORIZON_SCAN },
    prepare: root => baselineWithReason(root, 'server/jobs/regulatoryHorizonScan.ts', ''),
    gapHolds: ({ code, out }) => code === 0 && out.includes('1 do not (baseline 1)'),
    closedWhen: ({ code, out }) => code === 1 && out.includes('    server/jobs/regulatoryHorizonScan.ts'),
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────

const realBaselineBefore = fs.existsSync(REAL_BASELINE) ? fs.readFileSync(REAL_BASELINE) : null;

/**
 * True when `buf` is a baseline this selftest's fixtures produced — every key is
 * a path a fixture tree was given. A real-tree baseline carries real paths that
 * no fixture writes, so a concurrent legitimate rewrite never looks like ours.
 */
function isFixtureOutput(buf) {
  try {
    const keys = Object.keys(JSON.parse(buf.toString('utf8')).unconsidered ?? {});
    return keys.length > 0 && keys.every(k => FIXTURE_PATHS.has(k));
  } catch {
    return false;
  }
}

/**
 * Every exit goes through here, so the repository baseline is checked even on an
 * early stop — and before any summary is printed, so a non-hermetic run never
 * reports "passed" first.
 */
function finish(exitCode, summary = '') {
  const after = fs.existsSync(REAL_BASELINE) ? fs.readFileSync(REAL_BASELINE) : null;
  const unchanged =
    (realBaselineBefore === null && after === null) ||
    (realBaselineBefore !== null && after !== null && realBaselineBefore.equals(after));
  if (!unchanged) {
    if (realBaselineBefore !== null && after !== null && isFixtureOutput(after)) {
      fs.writeFileSync(REAL_BASELINE, realBaselineBefore);
      console.error(
        `${TAG} FAIL — the gate wrote fixture output into the repository baseline (restored); ` +
          'it does not honour TENANT_ENTRY_POINTS_ROOT for --write-baseline, so the selftest is not hermetic.',
      );
    } else {
      console.error(
        `${TAG} FAIL — the repository baseline (${path.relative(repoRoot, REAL_BASELINE)}) changed during ` +
          'the run, and the new content is not fixture output: another process (a concurrent session, ' +
          'or ci:tenant-entry-points:write-baseline) most likely changed it. Left exactly as found — ' +
          'nothing was written. Inspect it with git diff and re-run when the tree is quiet.',
      );
    }
    process.exit(1);
  }
  if (summary) console.log(summary);
  process.exit(exitCode);
}

if (!fs.existsSync(GATE)) {
  console.error(`${TAG} FAIL — gate not found at ${GATE}`);
  process.exit(1);
}

// The comment-only drift case proves the digest covers the full text only if the
// stripped code of the two versions is identical. Hold the fixture to that.
if (
  HORIZON_SCAN_COMMENTED === HORIZON_SCAN ||
  HORIZON_SCAN_COMMENTED.length !== HORIZON_SCAN.length ||
  stripComments(HORIZON_SCAN_COMMENTED) !== stripComments(HORIZON_SCAN)
) {
  console.error(
    `${TAG} FAIL — fixture precondition: HORIZON_SCAN_COMMENTED must differ from HORIZON_SCAN only ` +
      'inside a comment, same length, so its comment-stripped code is byte-identical.',
  );
  process.exit(1);
}

// Several cases run --write-baseline. If the gate under test ignored
// TENANT_ENTRY_POINTS_ROOT it would read the real tree or rewrite the
// repository's real baseline. So first prove it reads AND writes a probe tree
// that holds one uniquely named sentinel entry point: exactly one entry point
// against an empty baseline, the sentinel named, and --write-baseline recording
// exactly that sentinel in the probe tree's own baseline. A count that merely
// ends in 0 (or 1) cannot satisfy this; a randomly named file the real tree does
// not have can.
{
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-entry-points-selftest-'));
  const sentinel = `server/jobs/selftest-probe-${crypto.randomBytes(6).toString('hex')}.ts`;
  const problems = [];
  let out = '';
  try {
    fs.mkdirSync(path.join(probe, path.dirname(FIXTURE_BASELINE_REL)), { recursive: true });
    // Carries both runWithSystemTenantScope and setInterval, so a gate that lost
    // one sweep alternative still reports it and fails in that case, not here.
    writeFiles(probe, { [sentinel]: TASK_SWEEP_DEFECT });
    const r = gate(probe);
    out = r.out;
    if (r.code !== 1) problems.push(`check run exited ${r.code}, expected 1`);
    if (!/\] 1 entry point\(s\); 0 consider tenant entitlement, 1 do not \(baseline 0\)/.test(r.out)) {
      problems.push('check run did not report exactly 1 entry point against an empty baseline');
    }
    if (!r.out.includes(SCHED(sentinel))) problems.push(`check run did not name the sentinel ${sentinel}`);
    if (!problems.length) {
      const w = gate(probe, ['--write-baseline']);
      out += w.out;
      const written = fs.existsSync(path.join(probe, FIXTURE_BASELINE_REL))
        ? Object.keys(readBaseline(probe).unconsidered ?? {})
        : null;
      if (w.code !== 0) problems.push(`--write-baseline exited ${w.code}, expected 0`);
      if (written === null) problems.push('--write-baseline did not write the probe tree\'s baseline');
      else if (written.length !== 1 || written[0] !== sentinel) {
        problems.push(`--write-baseline recorded ${JSON.stringify(written)}, expected only the sentinel`);
      }
    }
  } catch (err) {
    problems.push(`harness error: ${err.message}`);
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
  if (problems.length) {
    console.error(
      `${TAG} FAIL — the gate did not read and write the probe tree it was pointed at: it ignores ` +
        'TENANT_ENTRY_POINTS_ROOT, or no longer detects a system-scope sweep. Refusing to run the ' +
        '--write-baseline cases against the real tree.',
    );
    for (const p of problems) console.error(`      ${p}`);
    console.error(out.split('\n').map(l => `      | ${l}`).join('\n'));
    finish(1);
  }
}

let passed = 0;
let failed = 0;
const openGaps = [];
for (const c of cases) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-entry-points-selftest-'));
  let res = { code: null, out: '' };
  const problems = [];
  try {
    // The repository has docs/reports/; --write-baseline writes into it and does not create it.
    fs.mkdirSync(path.join(root, path.dirname(FIXTURE_BASELINE_REL)), { recursive: true });
    writeFiles(root, c.files);
    c.prepare?.(root);
    res = gate(root);
    if (c.knownGap) {
      if (!c.gapHolds(res)) {
        problems.push(
          c.closedWhen(res)
            ? 'KNOWN GAP CLOSED — the gate now catches this. Turn this tripwire into an ordinary ' +
                'FAILS case and delete its knownGap marker in the same change.'
            : `known-gap tripwire saw neither the gap nor its fix (exit ${res.code}) — the gate's behaviour changed`,
        );
      }
    } else {
      if (res.code !== c.expectExit) problems.push(`expected exit ${c.expectExit}, got ${res.code}`);
      for (const s of c.expectIn) if (!res.out.includes(s)) problems.push(`output lacked: ${JSON.stringify(s)}`);
      for (const s of c.expectNotIn ?? []) {
        if (res.out.includes(s)) problems.push(`output wrongly contained: ${JSON.stringify(s)}`);
      }
      problems.push(...(c.check?.(root) ?? []));
    }
  } catch (err) {
    problems.push(`harness error: ${err.message}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  if (problems.length) {
    failed++;
    console.log(`  ✗ ${c.knownGap ? 'KNOWN GAP tripwire: ' : ''}${c.name}`);
    for (const p of problems) console.log(`      ${p}`);
    console.log(res.out.split('\n').map(l => `      | ${l}`).join('\n'));
  } else if (c.knownGap) {
    openGaps.push(c.knownGap);
    console.log(`  ! KNOWN GAP still open: ${c.knownGap}`);
  } else {
    passed++;
    console.log(`  ✓ ${c.name}`);
  }
}

if (failed) {
  console.error(`\n${TAG} FAIL — ${failed}/${cases.length} case(s) did not hold.`);
  finish(1);
}
finish(
  0,
  openGaps.length
    ? `\n${TAG} ${passed} passed — the gate fails on what it was tested against, but NOT on ` +
        `${openGaps.length} KNOWN GAP(s) still open (marked ! above); it does not yet catch everything it exists to catch.`
    : `\n${TAG} ${passed} passed — the gate fails on what it exists to catch.`,
);
