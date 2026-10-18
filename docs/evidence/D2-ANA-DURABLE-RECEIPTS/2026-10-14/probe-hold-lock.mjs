import { PGlite } from '@electric-sql/pglite';
const pg=new PGlite();
try {
  await pg.exec('CREATE ROLE hold_lock_probe NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE TABLE holds(id integer,lifted_at timestamptz); GRANT SELECT,UPDATE(lifted_at) ON holds TO hold_lock_probe;');
  await pg.exec('SET ROLE hold_lock_probe;');
  await pg.exec('BEGIN;');
  try { await pg.exec('LOCK TABLE holds IN SHARE MODE'); console.info('column UPDATE permits SHARE lock'); }
  catch(e) { console.info('column UPDATE fails SHARE lock:',e.code); }
  await pg.exec('ROLLBACK; RESET ROLE; GRANT UPDATE ON holds TO hold_lock_probe; SET ROLE hold_lock_probe;');
  await pg.exec('BEGIN;');
  await pg.exec('LOCK TABLE holds IN SHARE MODE'); console.info('table UPDATE permits SHARE lock');
  await pg.exec('ROLLBACK; RESET ROLE;');
} finally { await pg.close(); }
