/**
 * Wave-3 domain seed — saved evidence-ask for the corpus-search surface.
 *
 * One grounded ask on the BX-204 14-day-wear CGM biocompatibility question,
 * matching the v2 Evidence surface's EV_ANSWER / EV_CHUNKS / EV_SUGGEST fixture
 * exactly. Read by GET /api/evidence-asks; the surface renders the composed
 * answer, its citation refs, and the retrieved source chunks (pgvector
 * similarity hits over S3-backed chunks). Grounded in public FDA precedent and
 * the app's own biocompatibility plan — no fabricated data. to_regclass
 * guarded, org-scoped, idempotent (ON CONFLICT DO NOTHING).
 */
const ASK = {
  id: 'ask-bx204-cgm',
  question: 'What testing does 14-day wear require?',
  pedigree: 'model_assisted',
  answer:
    'For a 14-day wear CGM, FDA precedent requires ISO 10993-11 (systemic toxicity) testing in addition to the -5 and -10 panels used for shorter-wear predicates, and reviewers consistently request an accuracy sub-analysis stratified by age band. Both points should be addressed in §11 (substantial equivalence) and §14 (biocompatibility) before filing.',
  cites: [1, 2, 3],
  chunks: [
    { n: 1, doc: 'K221847 Decision Summary.pdf', page: 'p. 7', sim: 0.92, snip: '…extended-wear sensors (>10 days) required additional ISO 10993-11 systemic toxicity evaluation beyond the predicate biocompatibility profile…' },
    { n: 2, doc: 'FDA 2023 CGM guidance.pdf', page: 'p. 14', sim: 0.88, snip: '…accuracy should be characterized across pediatric and adult sub-populations, with MARD reported by age band…' },
    { n: 3, doc: 'BX-204 Biocompatibility plan v2.docx', page: '§3.2', sim: 0.81, snip: '…cytotoxicity (-5) and sensitization (-10) complete; systemic toxicity (-11) in progress pending 14-day extract…' },
  ],
  suggestions: [
    'What testing does 14-day wear require?',
    'Find precedent for predictive low alerts',
    'Summarize open biocompatibility gaps',
  ],
};

export default async function seed(client, { org }) {
  const t = await client.query(`SELECT to_regclass('public.c2c_evidence_asks') AS c`);
  if (!t.rows[0]?.c) {
    console.log('   ⚠ c2c_evidence_asks not found — run migrations first, skipping');
    return;
  }
  const r = await client.query(
    `INSERT INTO c2c_evidence_asks (
       id, organization_id, question, pedigree, answer, cites, chunks, suggestions
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
     ON CONFLICT (organization_id, id) DO NOTHING`,
    [
      ASK.id, org.id, ASK.question, ASK.pedigree, ASK.answer,
      JSON.stringify(ASK.cites), JSON.stringify(ASK.chunks), JSON.stringify(ASK.suggestions),
    ],
  );
  console.log(`   ✓ evidence asks: ${r.rowCount ?? 0} saved ask seeded`);
}
