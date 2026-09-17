/**
 * seed-local-testing.ts — the smallest realistic workspace a person needs to
 * exercise this branch by hand.
 *
 * Laptops and throwaway containers only. Seed data reaches a deployed database
 * ONLY through a file in C2C_MIGRATION_FILES (CLAUDE.md RULE 1); this script is
 * not on any applier and must never be pointed at one.
 *
 * It creates, idempotently:
 *   · one regulatory program (the shell's "open project")
 *   · two study designs, written through the product's OWN persist path
 *     (persistStudyDesignTx) so the rows are shaped exactly as the app writes
 *     them — one complete enough for the engine to size, one with blocking gaps
 *     so the honest refusal is testable
 *   · two conversations on that program, so the project landing has something
 *     to list and resume
 *
 * The org and the sign-in account come from scripts/seed-admin.mjs; run that
 * first. Usage:
 *
 *   DATABASE_URL=... npx tsx scripts/seed-local-testing.ts
 */
import { pool } from '../server/db.js';
import { persistStudyDesignTx } from '../server/services/study-design/study-design-repository.js';

const ORG = Number(process.env.SEED_ORG_ID ?? 1);
const USER = Number(process.env.SEED_USER_ID ?? 1);

/** A design the deterministic engine can size: complete assumptions, estimand, populations. */
function sizeableDesign(programId: string): any {
  return {
    studyId: 'C2C-LOCAL-301',
    programId,
    title: 'A phase 3 study of BX-301 in relapsed/refractory multiple myeloma',
    phase: '3',
    indication: 'relapsed/refractory multiple myeloma',
    productType: 'drug',
    estimands: [{
      endpointName: 'overall response rate',
      treatmentCondition: 'BX-301 versus standard of care',
      population: 'all randomized (ITT)',
      variable: 'IMWG-confirmed response at 6 months',
      summaryMeasure: 'risk difference',
      strategy: 'treatment_policy',
      intercurrentEvents: [{ name: 'treatment discontinuation', strategy: 'treatment_policy', justification: 'reflects the policy estimand' }],
    }],
    objectives: [{ level: 'primary', order: 1, text: 'Demonstrate superiority on ORR', endpointName: 'overall response rate' }],
    endpoints: [{ name: 'overall response rate', role: 'primary', type: 'binary', definition: 'IMWG-confirmed response at 6 months', isSurrogate: false, regulatoryAcceptance: 'accepted_precedent' }],
    framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'active' },
    population: {
      targetDescription: 'adults after at least two prior lines of therapy',
      analysisPopulations: [
        { kind: 'ITT', definition: 'all randomized', isPrimaryAnalysisSet: true },
        { kind: 'Safety', definition: 'all treated', isPrimaryAnalysisSet: false },
      ],
      eligibility: [{ type: 'inclusion', text: 'ECOG 0-2' }],
    },
    arms: [
      { name: 'BX-301', interventions: [{ name: 'BX-301', role: 'investigational', dose: '10 mg', route: 'oral' }] },
      { name: 'Standard of care', interventions: [{ name: 'SoC', role: 'active_comparator' }] },
    ],
    randomization: { ratio: [1, 1], allocationMethod: 'stratified', blinding: 'open' },
    statisticalPlan: {
      alpha: 0.05, oneSided: false, power: 0.9, plannedSampleSize: 0, dropoutRate: 0.15,
      plannedAnalyses: [{ endpointName: 'overall response rate', method: 'logistic regression' }],
      multiplicity: { method: 'none' },
      missingDataStrategy: 'Multiple imputation under MAR; tipping-point sensitivity analysis',
      powerAssumptions: { effectSize: 0.2, eventRate: 0.35, evidence: [{ kind: 'prior_data', source: 'Phase 2 BX301-201' }] },
    },
  };
}

/** The same study WITHOUT the assumptions the engine needs — the honest 422 is the point. */
function gappyDesign(programId: string): any {
  const d = sizeableDesign(programId);
  return {
    ...d,
    studyId: 'C2C-LOCAL-201',
    title: 'A phase 2 study of BX-301 in relapsed/refractory multiple myeloma',
    phase: '2',
    estimands: [],
    statisticalPlan: { ...d.statisticalPlan, missingDataStrategy: undefined, powerAssumptions: { evidence: [{ kind: 'prior_data', source: 'Phase 1b' }] } },
  };
}

async function main(): Promise<void> {
  const existing = await pool.query(
    `SELECT id FROM regulatory_programs WHERE organization_id = $1 AND code = $2 AND deleted_at IS NULL LIMIT 1`,
    [ORG, 'BX-301'],
  );
  const programId: string = existing.rows[0]?.id ?? (await pool.query(
    `INSERT INTO regulatory_programs
       (organization_id, name, code, program_type, product_type, primary_agency, product_name,
        indication, status, phase, priority, description, progress_percent, target_submission_date)
     VALUES ($1,'BX-301 Oncology IND','BX-301','ind','drug','FDA','BX-301',
        'relapsed/refractory multiple myeloma','active','Phase 2','high',
        'First-in-class oral agent; IND targeted for Q1.',42, NOW() + INTERVAL '120 days')
     RETURNING id`,
    [ORG],
  )).rows[0].id;
  console.log('program:', programId);

  for (const design of [sizeableDesign(programId), gappyDesign(programId)]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = await persistStudyDesignTx(client as never, design, { tenantId: ORG, userId: USER });
      await client.query('COMMIT');
      console.log('design: ', id, '—', design.title.slice(0, 52));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Conversations on the program: what the project landing lists and resumes.
  const threads = [
    ['c2c-local_1', 'Draft the Module 2.5 clinical overview for BX-301', 'Here is a first pass at the clinical overview.'],
    ['c2c-local_2', 'What does the FDA expect for the dose-escalation rationale?', null],
  ] as const;
  for (const [id, question, answer] of threads) {
    await pool.query(
      `INSERT INTO chat_threads (id, user_id, organization_id, metadata, created_at, updated_at)
       VALUES ($1,$2,$3,$4, NOW() - INTERVAL '2 days', NOW())
       ON CONFLICT (id) DO UPDATE SET metadata = EXCLUDED.metadata`,
      [id, USER, ORG, JSON.stringify({ programId })],
    );
    const had = await pool.query('SELECT 1 FROM chat_messages WHERE thread_id = $1 LIMIT 1', [id]);
    if (had.rowCount === 0) {
      await pool.query(`INSERT INTO chat_messages (thread_id, role, content) VALUES ($1,'user',$2)`, [id, question]);
      if (answer) await pool.query(`INSERT INTO chat_messages (thread_id, role, content) VALUES ($1,'assistant',$2)`, [id, answer]);
    }
    console.log('thread: ', id);
  }

  console.log('\nOpen the program from Projects, or set it directly in the browser console:');
  console.log(`  sessionStorage.setItem('c2c.shell-project', JSON.stringify({ id: '${programId}', title: 'BX-301 Oncology IND' }))`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('seed-local-testing failed:', err?.message ?? err); process.exit(1); });
