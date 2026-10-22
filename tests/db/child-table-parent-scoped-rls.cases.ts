/**
 * Fixtures for child-table-parent-scoped-rls.dbtest.ts: the child/parent pairs
 * it exercises, the full table lists it asserts structurally, and the bare-CI
 * table declarations.
 *
 * Split out of the suite on 2026-10-12 when adding capa_records and
 * q_submissions took the test file past the 500-line ceiling. The assertions
 * stay in the .dbtest.ts; this file holds only the data they run against, so a
 * new case is a data change and the test body stops growing. Same convention as
 * tests/db/ana-tool-call.ts — a non-.dbtest sibling, so vitest does not collect
 * it as a suite of its own.
 */

/**
 * The child/parent pairs this suite exercises end to end. Deliberately a
 * SUBSET — one per distinct key shape (text FK, integer FK, uuid FK) — because
 * each case needs real parent AND child rows, and covering all 21 would test
 * the same predicate twenty-one times. The full list is asserted structurally
 * in the suite's "every table named by the migration ends up policied", which is what
 * catches a table silently dropping out of the migration.
 *
 * ── Why each case seeds BOTH tenants and asserts BOTH directions ────────────
 * The first draft of this suite asserted only "tenant B sees 0". It passed —
 * and it was worthless: it seeded parents but never children, so chat_messages
 * held zero rows and B saw nothing because there was nothing, policy or no
 * policy. A count of 0 is exactly what a test that inserted nothing reports.
 *
 * Every case now asserts that tenant A sees EXACTLY ITS OWN row as well. A
 * failed or skipped seed fails that assertion, so the isolation half can no
 * longer pass vacuously. `seed` returns the child ids it actually wrote, and
 * the test checks them.
 */
export interface Case {
  child: string;
  parent: string;
  fk: string;
  parentTenant: string;
  /**
   * Insert one parent + one child for the given tenant. Returns the FK value
   * that identifies this run's child rows, so the count below can find them
   * without joining anything.
   */
  seed: (
    q: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>,
    org: number,
    tag: string,
  ) => Promise<string>;
  /**
   * Count child rows by FK value, selecting from the CHILD ALONE.
   *
   * ── Why there is no JOIN here, though the obvious query has one ────────────
   * The first working version of this suite counted
   * `FROM chat_messages ch JOIN chat_threads p ON ...`. It passed — and it kept
   * passing after the child policies were DROPPED, which is how the flaw was
   * found. The parent tables are themselves tenant-keyed and already policied,
   * so the join was filtered by the PARENT's policy no matter what the child
   * did. The test proved a true thing for the wrong reason and would never have
   * failed on the defect it exists to catch.
   *
   * Selecting from the child alone leaves the child's own policy as the only
   * thing that can filter the result.
   */
  countOwn: string;
}

/** One regulatory program for a tenant, its uuid as text (the text-keyed children compare as text). */
export async function seedProgram(q: Parameters<Case['seed']>[0], org: number, name: string, code: string) {
  const p = await q(
    `INSERT INTO public.regulatory_programs
       (organization_id, name, code, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'device', 'samd', 'FDA', $2) RETURNING id::text AS id`,
    [org, name, code],
  );
  return String(p.rows[0].id);
}

export const CASES: Case[] = [
  {
    child: 'chat_messages',
    parent: 'chat_threads',
    fk: 'thread_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      await q(
        `INSERT INTO public.chat_threads (id, organization_id, title)
         VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [tag, org, `thread ${tag}`],
      );
      await q(
        `INSERT INTO public.chat_messages (thread_id, role, content)
         VALUES ($1, 'user', $2)`,
        [tag, `secret message for org ${org}`],
      );
      return tag; // thread_id

    },
    countOwn: `SELECT count(*)::int AS n FROM public.chat_messages WHERE thread_id = $1`,
  },
  {
    child: 'csr_details',
    parent: 'csr_reports',
    fk: 'report_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const p = await q(
        `INSERT INTO public.csr_reports (organization_id, report_id, report_title)
         VALUES ($1, $2, $3) RETURNING id`,
        [org, tag, `report ${tag}`],
      );
      await q(
        `INSERT INTO public.csr_details (report_id, study_design)
         VALUES ($1, $2)`,
        [p.rows[0].id, `design for org ${org}`],
      );
      return String(p.rows[0].id); // csr_details.report_id

    },
    countOwn: `SELECT count(*)::int AS n FROM public.csr_details WHERE report_id = $1::int`,
  },
  {
    // Included because it is one of the three that were INERT, not leaky:
    // migrations/0005_csr_knowledge_database.sql enabled RLS on it and never
    // wrote a policy, so the runtime role could read nothing and write nothing
    // — while server/services/m2-summary-builders.ts and
    // load-csr-inputs-for-project.ts query it. The positive half of this case
    // is therefore the substantive claim: the table WORKS again.
    child: 'csr_sections',
    parent: 'csr_studies',
    fk: 'study_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const p = await q(
        `INSERT INTO public.csr_studies (organization_id, csr_id, study_title)
         VALUES ($1, $2, $3) RETURNING id`,
        [org, tag, `study ${tag}`],
      );
      await q(
        `INSERT INTO public.csr_sections (study_id, section_title)
         VALUES ($1, $2)`,
        [p.rows[0].id, `section for org ${org}`],
      );
      return String(p.rows[0].id);
    },
    countOwn: `SELECT count(*)::int AS n FROM public.csr_sections WHERE study_id = $1::int`,
  },
  {
    child: 'rag_chunks',
    parent: 'rag_documents',
    fk: 'document_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const p = await q(
        `INSERT INTO public.rag_documents (organization_id, document_id, title, document_type)
         VALUES ($1, $2, $3, 'protocol') RETURNING id`,
        [org, tag, `doc ${tag}`],
      );
      await q(
        `INSERT INTO public.rag_chunks (document_id, chunk_id, chunk_index, content)
         VALUES ($1, $2, 0, $3)`,
        [p.rows[0].id, tag, `chunk text for org ${org}`],
      );
      return String(p.rows[0].id); // rag_chunks.document_id

    },
    countOwn: `SELECT count(*)::int AS n FROM public.rag_chunks WHERE document_id = $1::uuid`,
  },
  {
    // Added 2026-09-24 (ledger L201). A device complaint hangs from its
    // regulatory program by a TEXT program_id with no foreign key (the program's
    // id is a uuid), so the migration compares the keys as text. With no
    // organization column and no RLS, every tenant's complaint narratives were
    // readable by program id from any other tenant's session.
    child: 'complaints',
    parent: 'regulatory_programs',
    fk: 'program_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const programId = await seedProgram(q, org, `program ${tag}`, tag.slice(-40));
      await q(
        `INSERT INTO public.complaints
           (program_id, complaint_code, source, channel, received_at, event_narrative,
            patient_harm, severity_assessment)
         VALUES ($1, $2, 'customer', 'email', now(), $3, 'none', 'minor')`,
        [programId, tag.slice(-40), `complaint narrative for org ${org}`],
      );
      return programId; // complaints.program_id
    },
    countOwn: `SELECT count(*)::int AS n FROM public.complaints WHERE program_id = $1`,
  },
  {
    // Added 2026-09-28 (D3). A generated draft names its program by a TEXT
    // project_id with no foreign key and no organization column, like a
    // complaint; its routes filtered by program ownership and the table did
    // not (docs/evidence/D3/2026-09-28-drafting-tasks/).
    child: 'drafting_tasks',
    parent: 'regulatory_programs',
    fk: 'project_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const programId = await seedProgram(q, org, `program ${tag}`, tag.slice(-40));
      await q(
        `INSERT INTO public.drafting_tasks (task_id, project_id, ectd_section, document_title, draft_content)
         VALUES ($1, $2, '2.5', 'clinical overview', $3)`,
        [tag, programId, `draft for org ${org}`],
      );
      return programId; // drafting_tasks.project_id
    },
    countOwn: `SELECT count(*)::int AS n FROM public.drafting_tasks WHERE project_id = $1`,
  },
  {
    // Added 2026-10-12 (D3). The last two members of the text-program-id
    // class. Both are covered here rather than left to the structural
    // assertion above because that assertion proves the policy EXISTS; it
    // cannot prove the predicate resolves a TEXT program_id against a uuid
    // parent key correctly, which is the one thing this class gets wrong.
    //
    // capa_records is the sharper of the two: its reader
    // (routes/mdx-postmarket.ts) once used a LEFT JOIN with
    // `OR p.organization_id IS NULL`, which returned every CAPA whose
    // program_id matched nothing to every tenant. The route is fixed; this is
    // the table-level backstop for the next reader.
    child: 'capa_records',
    parent: 'regulatory_programs',
    fk: 'program_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const programId = await seedProgram(q, org, `capa program ${tag}`, `C${tag.slice(-39)}`);
      await q(
        `INSERT INTO public.capa_records
           (program_id, capa_code, title, type, source, problem_statement)
         VALUES ($1, $2, $3, 'corrective', 'complaint', $4)`,
        [programId, tag.slice(-40), `CAPA for org ${org}`, `root cause narrative for org ${org}`],
      );
      return programId; // capa_records.program_id
    },
    countOwn: `SELECT count(*)::int AS n FROM public.capa_records WHERE program_id = $1`,
  },
  {
    // Added 2026-10-12 (D3). A Q-submission holds the sponsor's pre-submission
    // strategy and the FDA team it is aimed at — read from more places than
    // capa_records (q-sub.service, the AnA tools, tenant-export, pdev, the mdx
    // handlers), each of which joins the programme itself. This proves the
    // table does too.
    child: 'q_submissions',
    parent: 'regulatory_programs',
    fk: 'program_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const programId = await seedProgram(q, org, `qsub program ${tag}`, `Q${tag.slice(-39)}`);
      await q(
        `INSERT INTO public.q_submissions (program_id, q_sub_type, title, summary)
         VALUES ($1, 'presub', $2, $3)`,
        [programId, `Pre-Sub for org ${org}`, `meeting strategy for org ${org}`],
      );
      return programId; // q_submissions.program_id
    },
    countOwn: `SELECT count(*)::int AS n FROM public.q_submissions WHERE program_id = $1`,
  },
  {
    // Added 2026-09-24 (ledger L201). The AnA command pdev.activity.set_state
    // read, updated and inserted activities by params.programId with no check
    // that the program was the caller's, and a foreign key does not consult RLS.
    child: 'pdev_program_activities',
    parent: 'regulatory_programs',
    fk: 'program_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const programId = await seedProgram(q, org, `pdev program ${tag}`, `P${tag.slice(-39)}`);
      await q(
        `INSERT INTO public.pdev_program_activities (program_id, activity_key, workstream, stage)
         VALUES ($1::uuid, $2, 'clinical', 'planning')`,
        [programId, `activity ${org}`],
      );
      return programId;
    },
    countOwn: `SELECT count(*)::int AS n FROM public.pdev_program_activities WHERE program_id = $1::uuid`,
  },
  {
    // Added 2026-09-24 (ledger L201). A resolution bundle's items: the actions
    // and prepared replacement content the bundle will apply.
    child: 'resolution_bundle_items',
    parent: 'resolution_bundles',
    fk: 'bundle_id',
    parentTenant: 'organization_id',
    seed: async (q, org, tag) => {
      const p = await q(
        `INSERT INTO public.resolution_bundles (organization_id, project_id, title, created_by_id)
         VALUES ($1, 1, $2, 1) RETURNING id::text AS id`,
        [org, `bundle ${tag}`],
      );
      await q(
        `INSERT INTO public.resolution_bundle_items
           (bundle_id, object_type, object_id, action_type, action_description)
         VALUES ($1::uuid, 'document', $2, 'review', $3)`,
        [p.rows[0].id, tag, `prepared change for org ${org}`],
      );
      return p.rows[0].id;
    },
    countOwn: `SELECT count(*)::int AS n FROM public.resolution_bundle_items WHERE bundle_id = $1::uuid`,
  },
  {
    // Added 2026-09-24 (ledger L202): a GRANDCHILD. A section version's parent,
    // the section, is itself a child of the document that carries the tenant.
    // So the policy delegates to the section's own policy (the migration's
    // chained list). The rows are the full prior text of a governed section,
    // its Part 11 history.
    child: 'c2c_document_section_versions',
    parent: 'c2c_document_sections',
    fk: 'section_id',
    parentTenant: 'org_id (on c2c_documents, through the section)',
    seed: async (q, org, tag) => {
      await q(
        `INSERT INTO public.c2c_documents (id, org_id, doc_type, agency, rule_pack_version, title)
         VALUES ($1, $2, 'k510', 'fda', 'fda-510k-2024', $3)`,
        [tag, org, `document ${tag}`],
      );
      const section = await q(
        `INSERT INTO public.c2c_document_sections (document_id, section_key, label, path_order)
         VALUES ($1, 's1', 'Section', 1) RETURNING id::text AS id`,
        [tag],
      );
      await q(
        `INSERT INTO public.c2c_document_section_versions (section_id, version, content, author_id, reason)
         VALUES ($1::bigint, 99, $2::jsonb, 1, 'dbtest')`,
        [section.rows[0].id, JSON.stringify({ text: `prior text for org ${org}` })],
      );
      return section.rows[0].id;
    },
    countOwn: `SELECT count(*)::int AS n FROM public.c2c_document_section_versions WHERE section_id = $1::bigint`,
  },
  {
    // Added 2026-10-13 (D3): a grandchild whose parent is a TEXT-program-id
    // child. A new key shape, and the reason this case exists rather than
    // leaving the five new tables to the structural assertion: the delegation
    // has to survive TWO hops of different kinds. q_sub_questions' policy only
    // asks "is the parent q_submissions row visible", and q_submissions' own
    // policy compares a TEXT program_id against regulatory_programs.id::text
    // before reading the programme's integer organization_id. The existing
    // grandchild case (c2c_document_section_versions) chains an integer key
    // into a directly org-keyed parent, so it would pass whether or not the
    // text comparison in the middle hop works.
    //
    // Before db/migrations/20260813's 2026-10-13 amendment this table had row
    // security off and no policy. Measured on a provisioned database as the
    // runtime role with app.rls_enforce='on': tenant A's scope counted BOTH
    // tenants' Pre-Sub questions (2, not 1), and the position taken on each.
    child: 'q_sub_questions',
    parent: 'q_submissions',
    fk: 'q_submission_id',
    parentTenant: 'organization_id (on regulatory_programs, through q_submissions.program_id)',
    seed: async (q, org, tag) => {
      const programId = await seedProgram(q, org, `q-sub programme ${tag}`, `S${tag.slice(-39)}`);
      const sub = await q(
        `INSERT INTO public.q_submissions (program_id, q_sub_type, title)
         VALUES ($1, 'presub', $2) RETURNING id::text AS id`,
        [programId, `pre-submission ${tag}`],
      );
      await q(
        `INSERT INTO public.q_sub_questions (q_submission_id, n, question, our_position)
         VALUES ($1::uuid, 1, $2, $3)`,
        [sub.rows[0].id, `question for org ${org}`, `position of org ${org}`],
      );
      return sub.rows[0].id;
    },
    countOwn: `SELECT count(*)::int AS n FROM public.q_sub_questions WHERE q_submission_id = $1::uuid`,
  },
];

/** Named by the migration; asserted as a set so a dropped entry is caught. */
export const ALL_CHILD_TABLES = [
  'ai_generation_runs', 'ai_messages', 'ai_retrieval_chunks', 'approval_checkpoints',
  'audit_trail', 'c2c_correspondence_issues', 'c2c_document_sections', 'cer_exports',
  'chat_messages', 'cmc_document_versions', 'coauthor_document_versions', 'csr_details',
  'document_versions', 'embedding_audit_log', 'fda_510k_stage_progress',
  'lumen_atom_citations', 'lumen_atom_conflicts', 'lumen_atom_quality_scores',
  'lumen_atom_versions', 'program_milestones', 'rag_chunks',
  // The CSR/CTD families, which had RLS ENABLED and NO POLICY — inert rather
  // than leaky, and three of them queried by live services.
  'csr_adverse_events', 'csr_biomarkers', 'csr_dose_response',
  'csr_eligibility_criteria', 'csr_endpoints', 'csr_pharmacokinetics',
  'csr_populations', 'csr_references', 'csr_safety_summaries', 'csr_sections',
  'csr_statistical_analyses', 'csr_tables_and_figures', 'csr_treatment_arms',
  'ctd_nonclinical_studies', 'ctd_quality_data', 'ctd_submissions',
  'csr_knowledge_edges', 'ctd_cross_references',
  // Added 2026-09-24 (ledger L201): post-market data keyed by a text program id.
  'complaints', 'mdr_events', 'vigilance_events',
  // Added 2026-09-28 (D3): generated drafts, the same text-program-id shape
  // (docs/evidence/D3/2026-09-28-drafting-tasks/).
  'drafting_tasks',
  // Added 2026-10-12 (D3): the last two of the text-program-id class, found
  // while clearing ci:unkeyed-request-tables:unreviewed to zero
  // (docs/evidence/D3/2026-10-12-unkeyed-table-classification/).
  'capa_records', 'q_submissions',
  // Added 2026-10-13 (D3): the generation BELOW those two. Policying a table
  // makes it a tenant-keyed parent, which makes its own children unprotected —
  // install-fresh's verifier failed the whole provision on exactly that, twice,
  // until the descendant tree was walked transitively instead of one failure at
  // a time (docs/evidence/D3/2026-10-13-capa-qsub-grandchildren/).
  'capa_actions', 'q_sub_meetings', 'q_sub_questions', 'q_sub_timeline_entries',
  'q_sub_commitments',
  // Added 2026-09-24 (ledger L201): every child with a foreign key into a
  // tenant-keyed parent that had row security OFF, bar the four grandchildren
  // named in scripts/db/rls-coverage-check.sql's carve-out.
  'activity_reactions', 'agency_validation_results', 'ai_ml_modifications',
  'c2c_ana_conversation_turns', 'c2c_milestone_sections', 'c2c_secure_attachments',
  'cer_clinical_evidence', 'cer_compliance_checks', 'cer_essential_requirements',
  'cer_faers_data', 'cer_literature', 'cer_sections', 'cer_version_history',
  'cer_workflows', 'charter_sections', 'cognitive_hitl_breakpoints',
  'cognitive_reasoning_traces', 'cognitive_thread_messages',
  'cognitive_workflow_checkpoints', 'context_members', 'dlt_events',
  'document_attachments', 'document_audit_logs', 'document_comments', 'document_locks',
  'doe_analysis_results', 'doe_experiments', 'doe_factors', 'doe_responses',
  'dose_cohorts', 'dose_levels', 'ind_narrative_sections', 'ind_package_plan_documents',
  'ind_package_plan_modalities', 'ind_package_plan_regions',
  'ind_package_plan_requirements', 'ind_package_plan_timelines', 'leaf_citations',
  'leaf_patches', 'lumen_collection_atoms', 'obligation_updates',
  'pdev_program_activities', 'pdev_readiness_snapshots', 'pkpd_compartments',
  'project_predictions', 'report_details', 'report_program_group_projects',
  'resolution_bundle_items', 'risk_detections', 'section_patches', 'sharepoint_comments',
  'sharepoint_file_versions', 'sharepoint_locks', 'sharepoint_shares',
  'simple_document_versions', 'species_comparisons', 'timeline_phases',
  'validation_findings', 'validation_harmonization_opportunities', 'validation_issues',
  'workflow_approvals', 'workflow_history', 'workflow_steps',
  // Added 2026-09-24 (ledger L202): grandchildren, scoped through the parent's
  // own policy by the migration's chained list.
  'ai_claims', 'ai_claim_citations', 'c2c_document_section_evidence',
  'c2c_document_section_versions', 'section_propagations',
];

/**
 * Children OUTSIDE public, scoped by the chained list's schema-qualified entries
 * (ledger L203). A bare CI database has none of these schemas, so this list is
 * asserted only for the tables that exist. A provisioned database has all of
 * them, and that is where the assertion bites.
 */
export const NON_PUBLIC_CHILD_TABLES = [
  'ai.risk_assessments', 'audit.config_bundles', 'audit.dataset_snapshots',
  'audit.idempotency_keys', 'audit.purge_requests', 'audit.purge_approvals', 'audit.tombstones',
  'core.entities', 'ectd.project_folders',
  'global_dossier.content_versions', 'global_dossier.dossier_branches',
  'global_dossier.dossier_sync_events', 'global_dossier.regulatory_comments',
  'manufacturing.rtrt_predictions', 'precedent.csr_precedent_links',
  'regulatory_harmonization.export_job_audit_log',
];

/**
 * Deliberately NOT covered by the migration's spec lists, so they must still
 * have no policy. Each needs a nested predicate through a second parent, and
 * none is referenced by server code. Asserted explicitly rather than left
 * implicit: if a later change policies them, this list is where the decision
 * gets revisited.
 *
 * ── Why the assertion changed on 2026-10-13 (D3) ────────────────────────────
 * It was `policied === false` alone. That is equally true of three states: a
 * table with row security on and FORCEd, which denies every row to every role;
 * one with row security on and not FORCEd, which denies to the runtime role and
 * lets the OWNER read every tenant's rows; and one with row security off
 * altogether, which denies nothing to anybody. Only the first is the deny-all
 * the migration claims for these three, and the assertion could not tell them
 * apart — so it passed while all three sat in the second state, which is what
 * migrations/0005_csr_knowledge_database.sql's ENABLE-without-FORCE loop leaves
 * behind. The suite now asserts row security ON and FORCEd as well; the
 * migration's last block sets both. Against a database provisioned before that
 * block existed this fails, naming the table.
 */
export const STILL_DENY_ALL = ['csr_endpoint_results', 'ctd_module_sections', 'ctd_documents'];

/**
 * Create the parent/child pairs the suite exercises when they are absent.
 *
 * CI's Integration database is not a fully provisioned application schema — it
 * is a bare PostgreSQL service with the extensions installed — so
 * `public.organizations` and the six tables below may not exist there. The
 * first CI run of this suite failed on exactly that:
 *
 *   ERROR: relation "public.organizations" does not exist
 *   STATEMENT: INSERT INTO public.organizations (id, name, slug) ...
 *
 * IF NOT EXISTS throughout, so on a real provisioned database every statement
 * is a no-op and the suite runs against the genuine shapes. Only the columns
 * this suite reads or writes are declared; the migration under test keys on the
 * FK and the parent's tenant column, both of which are present either way.
 *
 * Same idiom as ensureGraphTables() in knowledge-graph-tenant-isolation.dbtest.ts
 * and for the same reason: a real-database test that silently skips when its
 * tables are missing is indistinguishable from one that passes.
 */
export async function ensureTables(pool: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.organizations (
      id   SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.chat_threads (
      id              TEXT PRIMARY KEY,
      organization_id INTEGER,
      title           TEXT
    );
    CREATE TABLE IF NOT EXISTS public.chat_messages (
      id        SERIAL PRIMARY KEY,
      thread_id TEXT REFERENCES public.chat_threads(id),
      role      TEXT NOT NULL,
      content   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.csr_reports (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER,
      report_id       TEXT NOT NULL,
      report_title    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.csr_details (
      id           SERIAL PRIMARY KEY,
      report_id    INTEGER REFERENCES public.csr_reports(id),
      study_design TEXT
    );

    CREATE TABLE IF NOT EXISTS public.csr_studies (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER,
      csr_id          VARCHAR NOT NULL,
      study_title     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.csr_sections (
      id            SERIAL PRIMARY KEY,
      study_id      INTEGER NOT NULL REFERENCES public.csr_studies(id),
      section_title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS public.rag_documents (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id INTEGER,
      document_id     TEXT NOT NULL,
      title           TEXT NOT NULL,
      document_type   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.rag_chunks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID REFERENCES public.rag_documents(id),
      chunk_id    TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL
    );
  `);
}

/**
 * The parents and children the ledger L201 / L202 cases use, created the same
 * way and for the same reason as ensureTables above: a bare CI database has
 * none of them. Kept apart so each function stays readable.
 */
export async function ensureAddedTables(pool: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.regulatory_programs (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id INTEGER NOT NULL,
      name            TEXT NOT NULL,
      code            VARCHAR NOT NULL,
      program_type    TEXT NOT NULL,
      product_type    TEXT NOT NULL,
      primary_agency  TEXT NOT NULL,
      product_name    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.c2c_documents (
      id                TEXT PRIMARY KEY,
      org_id            INTEGER NOT NULL,
      doc_type          TEXT NOT NULL,
      agency            TEXT NOT NULL,
      rule_pack_version TEXT NOT NULL,
      title             TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.c2c_document_sections (
      id          BIGSERIAL PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES public.c2c_documents(id),
      section_key TEXT NOT NULL,
      label       TEXT NOT NULL,
      path_order  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.c2c_document_section_versions (
      id          BIGSERIAL PRIMARY KEY,
      section_id  BIGINT NOT NULL REFERENCES public.c2c_document_sections(id),
      version     INTEGER NOT NULL,
      content     JSONB NOT NULL,
      author_id   INTEGER NOT NULL,
      reason      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.pdev_program_activities (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id   UUID NOT NULL REFERENCES public.regulatory_programs(id),
      activity_key VARCHAR NOT NULL,
      workstream   VARCHAR NOT NULL,
      stage        VARCHAR NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.resolution_bundles (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id INTEGER NOT NULL,
      project_id      INTEGER NOT NULL,
      title           TEXT NOT NULL,
      created_by_id   INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.resolution_bundle_items (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bundle_id          UUID NOT NULL REFERENCES public.resolution_bundles(id) ON DELETE CASCADE,
      object_type        VARCHAR NOT NULL,
      object_id          TEXT NOT NULL,
      action_type        VARCHAR NOT NULL,
      action_description TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.complaints (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id      TEXT NOT NULL,
      complaint_code  VARCHAR NOT NULL,
      source          VARCHAR NOT NULL,
      channel         VARCHAR NOT NULL,
      received_at     TIMESTAMPTZ NOT NULL,
      event_narrative TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.drafting_tasks (
      id SERIAL PRIMARY KEY, task_id TEXT NOT NULL, project_id TEXT NOT NULL,
      ectd_section TEXT NOT NULL, document_title TEXT NOT NULL, draft_content TEXT
    );
    CREATE TABLE IF NOT EXISTS public.capa_records (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id        TEXT NOT NULL,
      capa_code         VARCHAR(64) NOT NULL,
      title             TEXT NOT NULL,
      type              VARCHAR(16) NOT NULL,
      source            VARCHAR(32) NOT NULL,
      risk_level        VARCHAR(16) NOT NULL DEFAULT 'medium',
      state             VARCHAR(32) NOT NULL DEFAULT 'open',
      problem_statement TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.q_submissions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      program_id TEXT NOT NULL,
      q_sub_type VARCHAR(16) NOT NULL,
      title      TEXT NOT NULL,
      stage      VARCHAR(16) NOT NULL DEFAULT 'plan',
      days_in    INTEGER NOT NULL DEFAULT 0,
      summary    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await ensureQSubAndCapaChildren(pool);
}

/**
 * The children of q_submissions and capa_records, declared for a bare CI
 * database (2026-10-13, D3).
 *
 * Split out of `ensureAddedTables` rather than appended to it because that
 * function's single DDL string had reached the 100-line ceiling the lint
 * ratchet enforces. One query per cohesive group of tables also means a
 * failure names the group that failed.
 */
async function ensureQSubAndCapaChildren(pool: {
  query: (sql: string) => Promise<unknown>;
}): Promise<void> {
  await pool.query(`
    -- Columns are the NOT NULL subset of the real tables; nothing here is
    -- read for its value.
    CREATE TABLE IF NOT EXISTS public.q_sub_questions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      q_submission_id UUID NOT NULL REFERENCES public.q_submissions(id) ON DELETE CASCADE,
      n               INTEGER NOT NULL,
      question        TEXT NOT NULL,
      our_position    TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.q_sub_commitments (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      q_sub_question_id UUID NOT NULL REFERENCES public.q_sub_questions(id) ON DELETE CASCADE,
      display_code      VARCHAR(32) NOT NULL,
      text              TEXT NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.capa_actions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      capa_id     UUID NOT NULL REFERENCES public.capa_records(id) ON DELETE CASCADE,
      n           INTEGER NOT NULL,
      type        VARCHAR(32) NOT NULL,
      description TEXT NOT NULL,
      state       VARCHAR(32) NOT NULL DEFAULT 'planned',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}
