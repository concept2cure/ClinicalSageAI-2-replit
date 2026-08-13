/**
 * Tenant storage reconciliation — "who would be refused if I turn this on?"
 *
 * ── Why this script exists ────────────────────────────────────────────────────
 * `organizations.max_storage` defaults to 5 GB and, until the quota guard
 * shipped, nothing had ever read it. That makes storage different from seat
 * licensing in a way that matters operationally: `seats_purchased` defaults to 0
 * (unlimited), so switching seat enforcement on cannot surprise a tenant that
 * was never provisioned. Switching STORAGE enforcement on can — a tenant sitting
 * quietly over a default they never saw starts getting 413s, possibly mid
 * submission.
 *
 * So enforcement gets a reconciliation step, and this is it. Run it before
 * setting STORAGE_LIMIT_ENFORCEMENT=enforce and you know exactly who is affected
 * and by how much.
 *
 * Read-only. It computes the same numbers the guard does, using the same
 * functions, so the report cannot drift from the enforcement it is previewing.
 *
 * Usage:  npm run report:tenant-storage
 */

import { pool } from '../server/db.js';
import {
  computeTenantStorage,
  evaluateStorageQuota,
  isStorageEnforcementOn,
} from '../server/services/tenant/tenant-storage.js';

const GB = 1024 ** 3;

function gb(bytes: number): string {
  return `${(bytes / GB).toFixed(2)} GB`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  const { rows: orgs } = await pool.query<{
    id: number;
    name: string | null;
    status: string | null;
    max_storage: number | string | null;
  }>(
    `SELECT id, name, status, max_storage
       FROM organizations
      WHERE status IS DISTINCT FROM 'purged'
      ORDER BY id`
  );

  console.log('');
  console.log('  Tenant storage reconciliation');
  console.log('  ' + '─'.repeat(78));
  console.log(
    `  Enforcement right now: ${isStorageEnforcementOn() ? 'ENFORCE (over-quota uploads are refused)' : 'report only (nothing is blocked)'}`
  );
  console.log(`  Organizations examined: ${orgs.length}`);
  console.log('');

  const overQuota: Array<{ id: number; name: string; used: number; limit: number }> = [];
  let unlimited = 0;
  let partialTables = 0;

  console.log(
    `  ${pad('ORG', 6)}${pad('NAME', 30)}${pad('USED', 12)}${pad('LIMIT', 12)}${'STATE'}`
  );
  console.log('  ' + '─'.repeat(78));

  for (const org of orgs) {
    const usage = await computeTenantStorage(pool, org.id);
    if (usage.tablesFailed.length > 0) partialTables += 1;

    const maxStorageGb =
      org.max_storage === null || org.max_storage === undefined ? null : Number(org.max_storage);

    // incomingBytes 0: this asks "is the tenant over ALREADY", which is the
    // question that decides whether flipping the switch breaks them today.
    const decision = evaluateStorageQuota({
      usedBytes: usage.bytes,
      maxStorageGb,
      incomingBytes: 0,
    });

    if (decision.outcome === 'unlimited') {
      unlimited += 1;
      continue;
    }

    const state = decision.allowed
      ? `ok (${((usage.bytes / (decision.limitBytes ?? 1)) * 100).toFixed(0)}%)`
      : 'WOULD BE REFUSED';

    if (!decision.allowed) {
      overQuota.push({
        id: org.id,
        name: org.name ?? '(unnamed)',
        used: usage.bytes,
        limit: decision.limitBytes ?? 0,
      });
    }

    console.log(
      `  ${pad(String(org.id), 6)}${pad(org.name ?? '(unnamed)', 30)}` +
        `${pad(gb(usage.bytes), 12)}${pad(gb(decision.limitBytes ?? 0), 12)}${state}`
    );
  }

  console.log('');
  console.log('  ' + '─'.repeat(78));
  console.log(`  Unlimited (max_storage <= 0): ${unlimited}`);
  console.log(`  Over quota today:             ${overQuota.length}`);

  if (partialTables > 0) {
    // Not a footnote. An under-count under-blocks, so a tenant listed as `ok`
    // here may still be over on bytes nothing could attribute to them.
    console.log('');
    console.log(
      `  NOTE: ${partialTables} organization(s) had at least one table that could not be read.`
    );
    console.log('        Their usage is an UNDER-count. See the log for which tables.');
  }

  if (overQuota.length > 0) {
    console.log('');
    console.log('  These tenants would start receiving 413 responses on upload:');
    for (const o of overQuota) {
      console.log(
        `    org ${o.id} — ${o.name}: ${gb(o.used)} against a ${gb(o.limit)} limit ` +
          `(${gb(o.used - o.limit)} over)`
      );
    }
    console.log('');
    console.log('  Raise their max_storage or have them delete content BEFORE setting');
    console.log('  STORAGE_LIMIT_ENFORCEMENT=enforce.');
  } else {
    console.log('');
    console.log('  No tenant is currently over its storage limit — enforcement can be');
    console.log('  switched on without refusing anyone.');
  }
  console.log('');
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(error => {
    console.error('tenant storage report failed:', error);
    process.exit(1);
  });
