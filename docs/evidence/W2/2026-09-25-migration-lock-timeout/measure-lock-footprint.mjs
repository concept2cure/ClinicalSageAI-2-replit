import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; const pg = createRequire(process.cwd() + '/package.json')('pg');
import { C2C_MIGRATION_FILES } from '../../../../scripts/db/migration-set.mjs';
const root=process.cwd();
const c=new pg.Client({connectionString:process.env.DATABASE_URL}); await c.connect();
const rows=[]; let totalAX=0;
for (const f of C2C_MIGRATION_FILES){
  const sql=fs.readFileSync(path.join(root,f),'utf8');
  const self=/^\s*(BEGIN|COMMIT)\s*;/im.test(sql);
  if (self){ rows.push({f,self:true}); continue; }
  const t0=Date.now();
  await c.query('BEGIN');
  try { await c.query(sql); } catch(e){ rows.push({f,err:e.message}); await c.query('ROLLBACK'); continue; }
  const ms=Date.now()-t0;
  const r=await c.query(`select c.relname, n.nspname from pg_locks l join pg_class c on c.oid=l.relation join pg_namespace n on n.oid=c.relnamespace where l.pid=pg_backend_pid() and l.mode='AccessExclusiveLock' and l.locktype='relation' and c.relkind in ('r','p')`);
  await c.query('ROLLBACK');
  totalAX+=r.rowCount;
  rows.push({f,ms,ax:r.rowCount,tables:r.rows.map(x=>x.nspname+'.'+x.relname)});
}
fs.writeFileSync(process.argv[2],JSON.stringify(rows,null,1));
const withAX=rows.filter(r=>r.ax>0);
console.info('files',rows.length,'self-transacting',rows.filter(r=>r.self).length,'errors',rows.filter(r=>r.err).length);
console.info('files taking ACCESS EXCLUSIVE on a table during a REPLAY:',withAX.length,'table-locks total',totalAX);
const uniq=new Set(withAX.flatMap(r=>r.tables)); console.info('distinct tables',uniq.size);
for (const t of ['public.projects','public.documents','public.organizations','public.users','vault.documents','public.audit_logs']) console.info(t, uniq.has(t)?'LOCKED':'-');
withAX.sort((a,b)=>b.ax-a.ax).slice(0,8).forEach(r=>console.info(r.ax,r.ms+'ms',r.f));
await c.end();
