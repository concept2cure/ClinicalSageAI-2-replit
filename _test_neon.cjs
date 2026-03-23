const { Pool } = require('pg');
const url = 'postgresql://neondb_owner:npg_9SIEbtA2hKsw@ep-icy-brook-aha5br78-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';
const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
p.query('SELECT NOW() as t, current_database() as db')
  .then(r => {
    console.log('Connected:', r.rows[0]);
    return p.query("SELECT count(*) FROM pg_tables WHERE schemaname='public'");
  })
  .then(r => {
    console.log('Tables:', r.rows[0].count);
    return p.end();
  })
  .catch(e => { console.error('ERR:', e.message); p.end(); });
