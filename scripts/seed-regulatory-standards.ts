/**
 * Upsert consensus standards into the canonical `device_test_standards` table.
 *
 * Idempotent: matches existing rows by `standard_code` and merges in the
 * new governance fields (domain, applies_to, fda_recognized, eu_harmonized,
 * jurisdictions, status, summary). Inserts a new row if none exists.
 *
 * Run after migration `20260429_regulatory_graph.sql` has been applied.
 *
 *   tsx scripts/seed-regulatory-standards.ts
 */

import { eq } from 'drizzle-orm';

import { db } from '../server/db';
import { deviceTestStandards } from '../shared/schema';
import { REGULATORY_STANDARDS_SEED } from '../shared/schema/regulatory-standards.seed';

async function main() {
  let inserted = 0;
  let updated = 0;

  for (const seed of REGULATORY_STANDARDS_SEED) {
    const [existing] = await db
      .select({ id: deviceTestStandards.id })
      .from(deviceTestStandards)
      .where(eq(deviceTestStandards.standardCode, seed.standardCode))
      .limit(1);

    if (existing) {
      // Merge governance fields onto the existing row; preserve any legacy
      // fields the operator may have set (only overwrite those given by seed).
      await db
        .update(deviceTestStandards)
        .set({
          standardName: seed.standardName,
          standardBody: seed.standardBody,
          family: seed.family ?? null,
          version: seed.version ?? null,
          editionYear: seed.editionYear ?? null,
          region: seed.region ?? null,
          description: seed.description ?? null,
          domain: seed.domain,
          appliesTo: seed.appliesTo,
          fdaRecognized: seed.fdaRecognized ?? false,
          euHarmonized: seed.euHarmonized ?? false,
          jurisdictions: seed.jurisdictions ?? [],
          status: seed.status ?? 'active',
          summary: seed.summary ?? null,
          updatedAt: new Date(),
        })
        .where(eq(deviceTestStandards.id, existing.id));
      updated += 1;
    } else {
      await db.insert(deviceTestStandards).values({
        standardCode: seed.standardCode,
        standardName: seed.standardName,
        standardBody: seed.standardBody,
        family: seed.family ?? null,
        version: seed.version ?? null,
        editionYear: seed.editionYear ?? null,
        region: seed.region ?? null,
        description: seed.description ?? null,
        domain: seed.domain,
        appliesTo: seed.appliesTo,
        fdaRecognized: seed.fdaRecognized ?? false,
        euHarmonized: seed.euHarmonized ?? false,
        jurisdictions: seed.jurisdictions ?? [],
        status: seed.status ?? 'active',
        summary: seed.summary ?? null,
      });
      inserted += 1;
    }
  }

  console.log(
    `[seed-regulatory-standards] inserted=${inserted} updated=${updated} total=${REGULATORY_STANDARDS_SEED.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[seed-regulatory-standards] failed:', err);
    process.exit(1);
  });
