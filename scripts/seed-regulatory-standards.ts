/**
 * Seed the regulatory_standards catalog.
 *
 * Idempotent: skips standards whose `code` already exists. Run after the
 * 20260429_regulatory_graph migration.
 *
 *   tsx scripts/seed-regulatory-standards.ts
 */

import { db } from '../server/db';
import { regulatoryStandards } from '../shared/schema/regulatory-graph';
import { REGULATORY_STANDARDS_SEED } from '../shared/schema/regulatory-standards.seed';
import { eq } from 'drizzle-orm';

async function main() {
  let inserted = 0;
  let skipped = 0;

  for (const std of REGULATORY_STANDARDS_SEED) {
    const [existing] = await db
      .select({ id: regulatoryStandards.id })
      .from(regulatoryStandards)
      .where(eq(regulatoryStandards.code, std.code))
      .limit(1);

    if (existing) {
      skipped += 1;
      continue;
    }
    await db.insert(regulatoryStandards).values(std);
    inserted += 1;
  }

  console.log(
    `[seed-regulatory-standards] inserted=${inserted} skipped=${skipped} total=${REGULATORY_STANDARDS_SEED.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[seed-regulatory-standards] failed:', err);
    process.exit(1);
  });
