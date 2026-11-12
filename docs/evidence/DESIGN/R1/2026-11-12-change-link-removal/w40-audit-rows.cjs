// Read-only: the persisted audit row of walk 40's link removal (audit_logs). Prints no connection detail.
const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const ids = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).steps.find((s) => s.name === 'ids');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query(
    `SELECT action, record_id, reason, new_values FROM audit_logs
      WHERE table_name = 'qms_change_control' AND action = 'mdx.qms.change.unlink' AND record_id = $1
      ORDER BY occurred_at DESC LIMIT 1`, [String(ids.change)]);
  const kept = await c.query(
    `SELECT id, linked_ref, removed_at IS NOT NULL AS removed, removed_by, removal_reason FROM qms_change_links WHERE id = $1`, [ids.link]);
  console.info(JSON.stringify({ audit: rows.map((r) => ({ action: r.action, record: r.record_id, reason: r.reason,
    details: typeof r.new_values === 'string' ? JSON.parse(r.new_values) : r.new_values })), link: kept.rows }, null, 1));
  await c.end();
})().catch((e) => { console.error('audit read failed:', e.message); process.exit(1); });
