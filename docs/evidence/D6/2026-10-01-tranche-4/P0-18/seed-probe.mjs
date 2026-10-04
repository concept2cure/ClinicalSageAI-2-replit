// Run the GA demo QMS seed against the guarded local database inside a transaction that is ALWAYS rolled back,
// forcing the deferred checks to fire first (SET CONSTRAINTS ALL IMMEDIATE) so the result COMMIT would have had is visible.
import pg from 'pg';
import seed from '../../../../../scripts/seed/ga-demo.d/123-qms-quality.mjs';
const c = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await c.connect();
await c.query('BEGIN');
try {
  await c.query(`INSERT INTO organizations (id, name, slug, status) VALUES (93182, 'dbqsr-seed-probe', 'dbqsr-seed-probe', 'active') ON CONFLICT (id) DO NOTHING`);
  const admin = (await c.query(`SELECT id FROM users WHERE email = 'dbqsr-approver@example.invalid'`)).rows[0];
  await seed(c, { org: { id: 93182 }, admin: { id: admin.id } });
  await c.query('SET CONSTRAINTS ALL IMMEDIATE');
  console.log('RESULT: the seed would COMMIT');
} catch (err) {
  console.log('RESULT: refused —', err.message);
} finally {
  await c.query('ROLLBACK');
  await c.end();
}
