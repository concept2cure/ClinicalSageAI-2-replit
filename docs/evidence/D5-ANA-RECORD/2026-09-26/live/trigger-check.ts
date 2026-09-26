// The boot / securityHealth / daily-sweep trigger check, run against the live
// database: what production would have said at that moment.
import pg from 'pg';
import {
  assertAuditImmutabilityTriggers,
  describeAuditImmutabilityGap,
} from '../../../../../server/services/audit/audit-immutability-triggers';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const report = await assertAuditImmutabilityTriggers(pool);
console.log(report.ok ? `ok: ${report.present}/${report.expected} present and enabled` : describeAuditImmutabilityGap(report));
await pool.end();
