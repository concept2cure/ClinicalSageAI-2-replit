/**
 * Literature recording — the WRITE path for literature_entries.
 *
 * Until this module existed the table had readers (regulatory-programs.service
 * getLiterature — the CER workbench corpus chart) and a seed script, but no
 * production write path: every PubMed search surface had to say "results are
 * not recorded". This is the single recording implementation shared by
 *
 *   - POST /api/cerv2/literature/record   (server/routes/cerv2-document-routes.ts)
 *   - AnA `record_literature` tool        (server/services/ana/AnaToolExecutor.ts)
 *
 * Table shape (canonical: db/migrations/20260801_consolidated_tree_reconciliation.sql):
 *   id uuid PK · title NOT NULL · authors text[] · abstract · publication_date date
 *   · journal · doi · url · source_name NOT NULL · source_id · relevance_score
 *   · organization_id · embedding vector(1536) (optional, pgvector) · timestamps
 *
 * Contract decisions, in doctrine order:
 *
 *   FAIL CLOSED   The caller must hand in a SQL executor (the request-scoped
 *                 client for routes, the shared pool for AnA). No executor, no
 *                 write. Invalid entries throw instead of being silently
 *                 skipped.
 *   NEVER FABRICATE
 *                 relevance_score stays NULL (we have no appraisal score);
 *                 embedding stays NULL (no embedding is computed here); a
 *                 year-only publication date is stored as Jan 1 of that year —
 *                 year precision is all the corpus chart reads
 *                 (EXTRACT(YEAR FROM publication_date)), so no invented
 *                 month/day ever surfaces.
 *   IDEMPOTENT    Recording is keyed on (organization, source_name='PubMed',
 *                 source_id=pmid). Re-recording UPDATEs the stored entry
 *                 (COALESCE-enriching nullable fields, never nulling data a
 *                 previous record supplied) instead of duplicating it. The
 *                 table has no unique constraint on that key, so idempotency
 *                 is update-first-then-insert in application logic.
 *   HONEST LIMITS Screening state and program binding are NOT representable:
 *                 see SCREENING_STATE_UNSUPPORTED / PROGRAM_BINDING_NOTE.
 */

/** pg-style executor: the request-scoped client (requestPgClient(req)) or the
 *  shared pool — anything with `.query(text, params) → { rows }`. */
export interface SqlExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface RecordableLiteratureEntry {
  /** PubMed ID — the idempotency key within the organization. */
  pmid: string;
  title: string;
  abstract?: string | null;
  journal?: string | null;
  /** Publication year (esummary pubDate rarely carries a reliable full date). */
  year?: number | null;
  /** Author list, or the display string PubMed esummary returns ("Smith J, Lee K"). */
  authors?: string[] | string | null;
  doi?: string | null;
  url?: string | null;
}

export interface RecordedEntryOutcome {
  pmid: string;
  /** literature_entries.id (uuid) of the stored row. */
  id: string;
  outcome: 'created' | 'updated';
}

export interface RecordLiteratureResult {
  created: number;
  updated: number;
  entries: RecordedEntryOutcome[];
}

export const LITERATURE_SOURCE_NAME = 'PubMed';

/**
 * literature_entries has NO status column and NO jsonb/metadata column — every
 * column is a scalar bibliographic field. Included/excluded/pending screening
 * state therefore CANNOT be represented without a schema migration, which this
 * write path deliberately does not add. Exported so the HTTP route and the AnA
 * tool state the same limitation verbatim instead of each inventing wording.
 */
export const SCREENING_STATE_UNSUPPORTED =
  'literature_entries has no screening-state or metadata column — entries are stored ' +
  'unscreened; MEDDEV include/exclude appraisal is not persisted';

/**
 * literature_entries has no program/project column either. Entries are
 * org-scoped; the per-program corpus view (getLiterature) matches them by
 * product name against title/abstract, so recording never claims a program
 * binding it cannot store.
 */
export const PROGRAM_BINDING_NOTE =
  'entries are recorded to the organization corpus; the program corpus chart matches them ' +
  'by product name in title/abstract (literature_entries has no program column)';

const PMID_RE = /^\d{1,10}$/;

/** "Smith J, Lee K" → ['Smith J', 'Lee K']; arrays pass through trimmed. */
export function normalizeAuthors(authors: RecordableLiteratureEntry['authors']): string[] | null {
  if (authors == null) return null;
  const list = Array.isArray(authors) ? authors : authors.split(',');
  const cleaned = list.map((a) => String(a).trim()).filter((a) => a.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

/** Year-precision publication date (see NEVER FABRICATE note above). */
export function yearToPublicationDate(year: number | null | undefined): string | null {
  if (year == null || !Number.isInteger(year) || year < 1800 || year > 2100) return null;
  return `${year}-01-01`;
}

/** Canonical public PubMed URL for a PMID — a derived identifier, not a guess. */
export function canonicalPubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

/**
 * Record one-or-many PubMed hits into the organization's literature corpus.
 * Idempotent per (org, pmid): existing entries are updated (nullable fields
 * enriched via COALESCE — a re-record never erases data), new ones inserted.
 *
 * Throws on invalid input (empty batch, malformed pmid, blank title) and on
 * database failure — callers surface the failure honestly, never a fake
 * success.
 */
export async function recordLiteratureEntries(
  dbc: SqlExecutor,
  organizationId: number,
  entries: RecordableLiteratureEntry[],
): Promise<RecordLiteratureResult> {
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error('A positive integer organizationId is required to record literature');
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('At least one literature entry is required');
  }

  // Dedupe within the batch (first occurrence wins) so one request can never
  // both create and "update" the same PMID.
  const seen = new Set<string>();
  const batch: RecordableLiteratureEntry[] = [];
  for (const entry of entries) {
    const pmid = String(entry?.pmid ?? '').trim();
    if (!PMID_RE.test(pmid)) {
      throw new Error(`Invalid pmid "${entry?.pmid}" — a numeric PubMed ID is required`);
    }
    const title = String(entry?.title ?? '').trim();
    if (title.length === 0) {
      throw new Error(`Entry for pmid ${pmid} has no title — refusing to record a blank entry`);
    }
    if (seen.has(pmid)) continue;
    seen.add(pmid);
    batch.push({ ...entry, pmid, title });
  }

  const outcomes: RecordedEntryOutcome[] = [];
  let created = 0;
  let updated = 0;

  for (const entry of batch) {
    const authors = normalizeAuthors(entry.authors);
    const publicationDate = yearToPublicationDate(entry.year);
    const abstractText = entry.abstract?.trim() || null;
    const journal = entry.journal?.trim() || null;
    const doi = entry.doi?.trim() || null;
    const url = entry.url?.trim() || canonicalPubmedUrl(entry.pmid);

    // Update-first: the table has no unique (org, source) constraint, so
    // ON CONFLICT is unavailable without a migration.
    const updateResult = await dbc.query(
      `UPDATE literature_entries
          SET title            = $3,
              abstract         = COALESCE($4, abstract),
              journal          = COALESCE($5, journal),
              publication_date = COALESCE($6::date, publication_date),
              authors          = COALESCE($7, authors),
              doi              = COALESCE($8, doi),
              url              = COALESCE($9, url),
              updated_at       = NOW()
        WHERE organization_id::text = $1::text
          AND source_name = $2
          AND source_id   = $10
        RETURNING id`,
      [
        String(organizationId),
        LITERATURE_SOURCE_NAME,
        entry.title,
        abstractText,
        journal,
        publicationDate,
        authors,
        doi,
        url,
        entry.pmid,
      ],
    );

    if (updateResult.rows.length > 0) {
      updated += 1;
      outcomes.push({ pmid: entry.pmid, id: String(updateResult.rows[0].id), outcome: 'updated' });
      continue;
    }

    const insertResult = await dbc.query(
      `INSERT INTO literature_entries
         (title, abstract, journal, publication_date, authors, doi, url,
          source_name, source_id, organization_id)
       VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        entry.title,
        abstractText,
        journal,
        publicationDate,
        authors,
        doi,
        url,
        LITERATURE_SOURCE_NAME,
        entry.pmid,
        organizationId,
      ],
    );
    created += 1;
    outcomes.push({ pmid: entry.pmid, id: String(insertResult.rows[0].id), outcome: 'created' });
  }

  return { created, updated, entries: outcomes };
}
