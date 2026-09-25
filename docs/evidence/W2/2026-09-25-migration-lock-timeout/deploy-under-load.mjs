// Real deploy-migrate replay against a provisioned DB while the app is "serving":
// one slow request holds a read on public.organizations for HOLD_MS; a request
// loop reads organizations every 50 ms. Reports the worst request latency.
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process';
const pg = createRequire(process.cwd() + '/package.json')('pg');
const url = process.env.DATABASE_URL; const HOLD_MS = 8000;
const holder = new pg.Client({ connectionString: url }); await holder.connect();
const req = new pg.Client({ connectionString: url }); await req.connect();
await req.query('SET statement_timeout = 30000');
await holder.query('BEGIN'); await holder.query('SELECT count(*) FROM public.organizations');
const t0 = Date.now();
const deploy = spawn('node', ['scripts/db/deploy-migrate.mjs'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; deploy.stdout.on('data', d => out += d); deploy.stderr.on('data', d => out += d);
const done = new Promise(r => deploy.on('exit', code => r(code)));
setTimeout(() => holder.query('COMMIT'), HOLD_MS);
let worst = 0, n = 0, exited = false; done.then(() => exited = true);
while (!exited) {
  const s = Date.now(); await req.query('SELECT count(*) FROM public.organizations'); const ms = Date.now() - s;
  worst = Math.max(worst, ms); n++; await new Promise(r => setTimeout(r, 50));
}
const code = await done;
console.log(`deploy-migrate exit=${code} in ${Date.now() - t0} ms; ${n} requests; worst request latency ${worst} ms (reader held ${HOLD_MS} ms)`);
console.log(out.split('\n').filter(l => /lock not available|✓ \d+\/\d+ migration|Schema migration complete|failed/.test(l)).slice(0, 8).join('\n'));
await holder.end(); await req.end();
