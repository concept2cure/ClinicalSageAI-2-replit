/**
 * The CSR endpoint and CTD chains for child-table-parent-scoped-rls.dbtest.ts
 * (2026-10-29, D6): the case that exercises the deepest of them, and their
 * bare-CI declarations. Split out of child-table-parent-scoped-rls.cases.ts so
 * that file stays under the 500-line lint ceiling; a non-.dbtest sibling, so
 * vitest does not collect it.
 *
 * Until 2026-10-29 csr_endpoint_results, ctd_module_sections and ctd_documents
 * were deny-all (row security on and FORCEd, no policy). The migration's
 * chained list now scopes each through its parent's policy, because the tenant
 * export must return the rows the purge erases with their study or programme
 * (docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/).
 */
import type { Case } from './child-table-parent-scoped-rls.cases';

export const CTD_DOCUMENTS_CASE: Case = {
  // Added 2026-10-29 (D6): the deepest chain, three hops. A CTD document's
  // policy asks only "is the section visible", the section's "is the
  // submission visible", and only the submission's (`specs`) names the
  // tenant, on ctd_programs. Until then all three hops below the submission
  // were deny-all, so the tenant export, reading as the runtime role in the
  // tenant's scope, returned none of the rows the purge erases with their
  // programme (docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/). The literal
  // 'fda' and 'm3_quality' are labels of the provisioned enums and plain text
  // on a bare database.
  child: 'ctd_documents',
  parent: 'ctd_module_sections',
  fk: 'section_id',
  parentTenant: 'organization_id (on ctd_programs, through ctd_submissions and ctd_module_sections)',
  seed: async (q, org, tag) => {
    const program = await q(
      `INSERT INTO public.ctd_programs (organization_id, program_name) VALUES ($1, $2) RETURNING id::text AS id`,
      [org, `CTD programme ${tag}`],
    );
    const submission = await q(
      `INSERT INTO public.ctd_submissions (program_id, submission_title, submission_type, target_agency)
       VALUES ($1::int, $2, 'ind', 'fda') RETURNING id::text AS id`,
      [program.rows[0].id, `submission ${tag}`],
    );
    const section = await q(
      `INSERT INTO public.ctd_module_sections (submission_id, module, section_code, section_title)
       VALUES ($1::int, 'm3_quality', '3.2.S', $2) RETURNING id::text AS id`,
      [submission.rows[0].id, `section ${tag}`],
    );
    await q(
      `INSERT INTO public.ctd_documents (section_id, document_title, document_type) VALUES ($1::int, $2, 'report')`,
      [section.rows[0].id, `document of org ${org}`],
    );
    return section.rows[0].id;
  },
  countOwn: `SELECT count(*)::int AS n FROM public.ctd_documents WHERE section_id = $1::int`,
};

/**
 * The CSR endpoint and CTD chains, declared for a bare CI database
 * (2026-10-29, D6): csr_endpoints and ctd_submissions are scoped by the
 * migration's `specs`, and their children by its chained list. Text where the
 * provisioned table has an enum; the NOT NULL subset of each real table.
 */
export async function ensureCsrCtdChains(pool: { query: (sql: string) => Promise<unknown> }): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.csr_endpoints (
      id                SERIAL PRIMARY KEY,
      study_id          INTEGER NOT NULL REFERENCES public.csr_studies(id) ON DELETE CASCADE,
      endpoint_category TEXT NOT NULL,
      endpoint_name     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.csr_endpoint_results (
      id          SERIAL PRIMARY KEY,
      endpoint_id INTEGER NOT NULL REFERENCES public.csr_endpoints(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS public.ctd_programs (
      id              SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      program_name    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.ctd_submissions (
      id               SERIAL PRIMARY KEY,
      program_id       INTEGER NOT NULL REFERENCES public.ctd_programs(id) ON DELETE CASCADE,
      submission_title TEXT NOT NULL,
      submission_type  VARCHAR NOT NULL,
      target_agency    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.ctd_module_sections (
      id            SERIAL PRIMARY KEY,
      submission_id INTEGER NOT NULL REFERENCES public.ctd_submissions(id) ON DELETE CASCADE,
      module        TEXT NOT NULL,
      section_code  VARCHAR NOT NULL,
      section_title TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS public.ctd_documents (
      id             SERIAL PRIMARY KEY,
      section_id     INTEGER NOT NULL REFERENCES public.ctd_module_sections(id) ON DELETE CASCADE,
      document_title TEXT NOT NULL,
      document_type  VARCHAR NOT NULL
    );
  `);
}
