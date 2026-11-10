// Read-only: the persisted audit rows of walk 31's links (audit_logs). Prints no connection detail.
const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const ids = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).steps.find((s) => s.name === 'ids');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query(
    `SELECT action, record_id, reason, new_values FROM audit_logs
      WHERE table_name = 'qms_change_control' AND action = 'mdx.qms.change.link'
        AND record_id = ANY($1::text[]) ORDER BY occurred_at DESC LIMIT 2`, [[String(ids.assessing), String(ids.proposed)]]);
  console.info(JSON.stringify(rows.map((r) => ({ action: r.action, record: r.record_id, reason: r.reason,
    details: typeof r.new_values === 'string' ? JSON.parse(r.new_values) : r.new_values })), null, 1));
  await c.end();
})().catch((e) => { console.error('audit read failed:', e.message); process.exit(1); });
