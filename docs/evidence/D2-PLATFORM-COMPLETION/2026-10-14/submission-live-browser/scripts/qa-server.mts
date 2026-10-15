/** Private isolated actual-route/auth/Vite composition. No fixture response replacement. */
import '/workspace/ClinicalSageAI-2-replit/server/config/load-env-files.ts';
import express from '/workspace/ClinicalSageAI-2-replit/node_modules/express/index.js';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { getPool } from '/workspace/ClinicalSageAI-2-replit/server/db.ts';
import { runWithPreAuthScope } from '/workspace/ClinicalSageAI-2-replit/server/db/tenantStore.ts';
import { resolveTrustProxy } from '/workspace/ClinicalSageAI-2-replit/server/config/trust-proxy.ts';
import { applyCoreMiddleware, applyAuthBoundary } from '/workspace/ClinicalSageAI-2-replit/server/startup/middleware.ts';
import { mountFastPathHealthEndpoints } from '/workspace/ClinicalSageAI-2-replit/server/startup/inline-endpoints.ts';
import { createAiCircuitBreaker, registerPreStartRoutes, registerPostStartRoutes } from '/workspace/ClinicalSageAI-2-replit/server/startup/routes.ts';
import { setupFrontendServing } from '/workspace/ClinicalSageAI-2-replit/server/startup/frontend.ts';
import { errorHandler } from '/workspace/ClinicalSageAI-2-replit/server/src/mw/observability.js';

const output = process.env.C2C_SUBMISSION_QA_OUTPUT;
if (!output) throw new Error('Private QA output directory is required.');
const postureSql = `SELECT current_database() AS database, current_user AS role, pg_backend_pid() AS pid,
 r.rolsuper, r.rolbypassrls, current_setting('app.rls_enforce',true) AS enforcement,
 current_setting('app.current_tenant_id',true) AS tenant, current_setting('app.current_user_role',true) AS user_role,
 current_setting('app.bypass_rls',true) AS bypass, current_setting('app.is_admin',true) AS admin
 FROM pg_roles r WHERE r.rolname=current_user`;
const pool = getPool();
const initial = await runWithPreAuthScope('qa:readonly-runtime-posture', async () => {
  const client = await pool.connect();
  try { return (await client.query(postureSql)).rows[0]; }
  finally { client.release(); }
});
if (initial.database !== 'platform_ci_sharing_blank_20261014_d25f4a7b' || initial.role !== 'app_service' || initial.rolsuper || initial.rolbypassrls || process.env.RLS_ENFORCE !== 'on') {
  throw new Error('QA runtime database/role posture was refused.');
}
writeFileSync(`${output}/runtime-posture.json`, JSON.stringify({ ...initial, configuredRls: process.env.RLS_ENFORCE, qualification: 'Actual app-role database introspection; no regulatory-table read or bypass grant.' }, null, 2) + '\n', { mode: 0o600 });

const app = express();
app.set('trust proxy', resolveTrustProxy().hops);
mountFastPathHealthEndpoints(app, pool);
applyCoreMiddleware(app, () => undefined);
applyAuthBoundary(app);
const ctx = { app, pool, experimentalRoutesEnabled: false, demoRoutesEnabled: false, testRoutesEnabled: false };
await registerPreStartRoutes(ctx, createAiCircuitBreaker());
await registerPostStartRoutes(ctx);
app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));
app.use(errorHandler);
const server = createServer(app);
await setupFrontendServing(app, server);
server.listen(5001, '127.0.0.1', () => console.info('Private submission QA composition listening on port 5001.'));
const stop = () => server.close(() => { void pool.end().then(() => process.exit(0)); });
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
