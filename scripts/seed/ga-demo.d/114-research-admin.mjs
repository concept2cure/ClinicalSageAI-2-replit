/**
 * Wave-3 domain seed — research-administration CITI roster into the REAL store.
 *
 * Seeds the demo org's study personnel (PI, co-I, coordinator, research staff,
 * attending veterinarian, lab tech) and each person's CITI/clearance completion
 * records into the canonical research-compliance roster — research_personnel +
 * personnel_training — the exact tables the roster service (createPersonnelTx /
 * addTrainingTx), the CITI bulk-import (importCitiRecordsTx) and AnA's training
 * tools write, and that GET /api/research-admin now reads (see server/services/
 * research-admin/research-admin-view-assembler.ts). No blob, no fixture: each row
 * is a real dated training record a coordinator could have imported, and the
 * surface's per-module status vector is DERIVED live from these dates.
 *
 * The demo narrative (which module is current / expiring / expired / missing per
 * person) is preserved from the retired c2c_research_admin blob by seeding dates
 * on the standard ~3-year CITI recertification cycle RELATIVE to seed time, so the
 * derived statuses land exactly as intended under citi-logic's 60-day expiring
 * window: 'expiring' = expires in 40 days, 'expired' = lapsed 120 days ago,
 * 'missing' = a record on file with no completion (assigned, not completed), and
 * an absent module simply has no record (renders '—'). Roles use the roster's
 * CHECK-constrained vocabulary. Idempotent (skips when the marker roster member
 * already exists for the org), org-scoped, created_by resolved from a real org
 * member, to_regclass-guarded + per-person fail-safe.
 */

const DAY = 86_400_000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

// Narrative status → real completion/expiry dates on a ~3-year recert cycle.
const STATUS_DATES = {
  current: () => ({ completed: iso(-300), expires: iso(795) }), // mid-cycle
  expiring: () => ({ completed: iso(-1055), expires: iso(40) }), // inside the 60-day window
  expired: () => ({ completed: iso(-1215), expires: iso(-120) }), // lapsed
  missing: () => ({ completed: null, expires: null }), // assigned, not completed
};

// The org's study personnel and their per-module CITI narrative (same people and
// per-module states the retired blob carried). Keys are the REAL
// personnel_training.training_type vocabulary; a module a person doesn't hold
// simply has no record.
const PERSONNEL = [
  {
    fullName: 'Dr. Elena Vasquez', role: 'principal_investigator',
    trainings: { citi_human_subjects: 'current', citi_gcp: 'current', fcoi_disclosure: 'current' },
  },
  {
    fullName: 'Dr. A. Nwosu', role: 'co_investigator',
    trainings: { citi_human_subjects: 'current', citi_gcp: 'current', fcoi_disclosure: 'expiring' },
  },
  {
    fullName: 'M. Delgado, RN', role: 'coordinator',
    trainings: { citi_human_subjects: 'current', citi_gcp: 'expiring', fcoi_disclosure: 'current' },
  },
  {
    fullName: 'S. Okafor', role: 'research_staff',
    trainings: { citi_human_subjects: 'current', citi_gcp: 'current', fcoi_disclosure: 'missing' },
  },
  {
    fullName: 'Dr. K. Osei, DVM', role: 'veterinarian',
    trainings: { citi_gcp: 'current', citi_animal: 'current', biosafety: 'current', fcoi_disclosure: 'current' },
  },
  {
    fullName: 'R. Patel', role: 'research_staff',
    trainings: { citi_human_subjects: 'expired', citi_animal: 'current', biosafety: 'current', fcoi_disclosure: 'missing' },
  },
];

async function has(client, table) {
  const r = await client.query(`SELECT to_regclass($1) AS c`, [`public.${table}`]);
  return !!r.rows[0]?.c;
}

export default async function seed(client, { org, admin }) {
  for (const t of ['research_personnel', 'personnel_training']) {
    if (!(await has(client, t))) {
      console.log(`   ⚠ ${t} not found — run migrations first, skipping research-admin seed`);
      return;
    }
  }

  // A real org member owns the records (created_by is NOT NULL, integer FK to
  // users); fall back to the demo admin the runner provides.
  const u = await client.query(
    `SELECT user_id FROM organization_users WHERE organization_id = $1 ORDER BY user_id LIMIT 1`,
    [org.id],
  );
  const userId = u.rows[0]?.user_id ?? admin?.id;
  if (!userId) {
    console.log('   ⚠ no org member to own the roster — skipping research-admin seed');
    return;
  }

  // Idempotency marker: the demo PI already on this org's roster means the seed ran.
  const already = await client.query(
    `SELECT id FROM research_personnel
      WHERE organization_id = $1 AND full_name = $2 AND deleted_at IS NULL LIMIT 1`,
    [org.id, PERSONNEL[0].fullName],
  );
  if (already.rows.length > 0) {
    console.log('   ✓ research admin: already seeded');
    return;
  }

  const guard = async (label, fn) => {
    try { await fn(); } catch (e) { console.log(`   ⚠ research-admin ${label}: ${e.message ?? e}`); }
  };

  let people = 0;
  let records = 0;
  for (const p of PERSONNEL) {
    await guard(p.fullName, async () => {
      const person = await client.query(
        `INSERT INTO research_personnel (organization_id, full_name, role, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [org.id, p.fullName, p.role, userId],
      );
      const personnelId = Number(person.rows[0].id);
      people++;
      for (const [trainingType, narrative] of Object.entries(p.trainings)) {
        const { completed, expires } = STATUS_DATES[narrative]();
        await client.query(
          `INSERT INTO personnel_training (organization_id, personnel_id, training_type, completed_date, expires_date, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [org.id, personnelId, trainingType, completed, expires, userId],
        );
        records++;
      }
    });
  }

  console.log(`   ✓ research admin: ${people} roster member(s) + ${records} training record(s) seeded into the real store`);
}
