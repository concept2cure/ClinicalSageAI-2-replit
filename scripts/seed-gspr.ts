/**
 * Seed the gspr_requirements catalog (idempotent).
 *
 *   tsx scripts/seed-gspr.ts
 */

import { eq, and } from 'drizzle-orm';

import { db } from '../server/db';
import { gsprRequirements } from '../shared/schema/gspr-postmarket';
import { GSPR_SEED } from '../shared/schema/gspr.seed';

async function main() {
  let inserted = 0;
  let updated = 0;

  for (const seed of GSPR_SEED) {
    const [existing] = await db
      .select({ id: gsprRequirements.id })
      .from(gsprRequirements)
      .where(
        and(
          eq(gsprRequirements.regulation, seed.regulation),
          eq(gsprRequirements.annex, seed.annex),
          eq(gsprRequirements.clause, seed.clause)
        )
      )
      .limit(1);

    const values = {
      regulation: seed.regulation,
      annex: seed.annex,
      chapter: seed.chapter ?? null,
      clause: seed.clause,
      title: seed.title,
      summary: seed.summary ?? null,
      deviceClassScope: seed.deviceClassScope ?? null,
      productTypeScope: seed.productTypeScope ?? null,
      isImplantableOnly: seed.isImplantableOnly ?? false,
      isSterileOnly: seed.isSterileOnly ?? false,
      relatedStandards: seed.relatedStandards ?? null,
      status: 'active' as const,
    };

    if (existing) {
      await db
        .update(gsprRequirements)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(gsprRequirements.id, existing.id));
      updated += 1;
    } else {
      await db.insert(gsprRequirements).values(values);
      inserted += 1;
    }
  }

  console.log(
    `[seed-gspr] inserted=${inserted} updated=${updated} total=${GSPR_SEED.length}`
  );
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[seed-gspr] failed:', err);
    process.exit(1);
  });
