/**
 * The authored document's text, read and assembled.
 *
 * 2026-10-17 (D2, document store consolidation step 6): this module used to be
 * the authoring → canonical spine bridge. On submit for review it committed the
 * assembled document into concept2cure_artifacts through the AnA document spine
 * (bridgeAuthoringToCanonical, resolveAuthoringCanonicalProject,
 * authoringThreadKey). That projection is retired: an authoring draft's review
 * state is its own workflow (authoring_documents.status,
 * authoring_workflow_steps), read by the Review board, and a filed Vault
 * version's lifecycle is canonical_documents. The projected row was set to
 * 'review' once and never moved by an approval or rejection. Rows written
 * before stay readable; nothing was moved. See
 * docs/design/DOCUMENT_STORE_CONSOLIDATION.md, step 6.
 *
 * What remains is the one reader of an authoring document's sections
 * (loadDocumentSnapshot, used by the filing copy in
 * services/coauthor/coauthor-snapshot.ts) and the one assembler of its text.
 * The module keeps its path because those callers import it.
 *
 * @module server/services/ana/authoring-canonical-bridge
 */

/** One saved section, as the snapshot reads it. */
export interface AuthoringSectionRow {
  id: unknown;
  code: unknown;
  title: unknown;
  content: unknown;
  order_index: unknown;
}

export interface AuthoringDocumentSnapshot {
  title: string;
  /** Full assembled content across the document's sections. */
  content: string;
  /** eCTD module/section hint if the working doc carries one. */
  module?: string | null;
  /** The rows `content` was assembled from, in the order it was assembled.
   *  2026-09-23 (W5/D7, co-author final pass): returned so a caller that must
   *  check the sections (the filing copy's seal check,
   *  services/coauthor/coauthor-snapshot.ts) checks the very rows it files. */
  sections?: AuthoringSectionRow[];
}

/** Anything with a pg-style query: the pool, or a caller's transaction. */
export interface AuthoringSnapshotQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface AuthoringBridgeDeps {
  /** Reads on `q` when given (e.g. the caller's transaction), else on the pool. */
  loadDocumentSnapshot(
    docId: string,
    organizationId: number,
    q?: AuthoringSnapshotQueryable,
  ): Promise<AuthoringDocumentSnapshot | null>;
}

/** A section as the assembler reads it. */
export type AssemblableSection = { code?: unknown; title?: unknown; content?: unknown };

/**
 * Sections, in the order given, as one document body: "## code — title", a
 * blank line, the section's text; sections separated by a blank line. The one
 * assembler for an authored document's text — the filing copy
 * (services/coauthor/coauthor-snapshot.ts) and the filing's own section for a
 * document filed under one outline node (services/c2c/commit-section-to-filing.ts,
 * 2026-10-08) both use it, and the placement dialog mirrors it.
 */
export function assembleAuthoredSections(sections: ReadonlyArray<AssemblableSection>): string {
  return sections
    .map((s) => {
      const heading = [s.code, s.title].filter(Boolean).join(' — ');
      return heading ? `## ${heading}\n\n${s.content ?? ''}` : String(s.content ?? '');
    })
    .join('\n\n')
    .trim();
}

/** Production deps: load the working doc from Postgres. */
export function defaultAuthoringBridgeDeps(): AuthoringBridgeDeps {
  return {
    async loadDocumentSnapshot(docId, organizationId, q) {
      /* 2026-09-23 (W5/D7, co-author final pass): `q` lets a caller read on its
         own transaction. The filing copy (services/coauthor/coauthor-snapshot.ts)
         used to assemble its text here on the pool, BEFORE its transaction,
         and then check a second read of the sections against the seal — so a
         section changed before this read and restored before that one was
         filed with a seal it is not in. It now calls this on its transaction
         and checks the returned `sections`, the rows the text was built from. */
      const exec: AuthoringSnapshotQueryable = q ?? (await import('../../db.js')).getPool();
      const doc = await exec.query(
        `SELECT title, module FROM authoring_documents WHERE id = $1 AND tenant_id = $2`,
        [docId, organizationId],
      );
      if (doc.rows.length === 0) return null;
      /* 2026-09-23 (W5/D7, co-author final pass): ORDER BY order_index,
         created_at, id — the editor's order (authoring.router.ts GET
         /docs/:docId/sections sorts order_index, created_at; id makes it
         total). By order_index alone, sections sharing an index (legacy
         documents) came back in heap order: filed in a different order from
         the one the author saw, and re-filed in another on re-placement. The
         router's seal queries use the same order. */
      const sections = await exec.query(
        `SELECT id, code, title, content, order_index FROM authoring_sections
          WHERE doc_id = $1 AND tenant_id = $2
          ORDER BY order_index, created_at, id`,
        [docId, organizationId],
      );
      const content = assembleAuthoredSections(sections.rows as AssemblableSection[]);
      return {
        title: String(doc.rows[0].title ?? 'Untitled document'),
        content,
        module: doc.rows[0].module ?? null,
        sections: sections.rows as AuthoringSectionRow[],
      };
    },
  };
}
