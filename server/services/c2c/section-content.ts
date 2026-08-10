/**
 * One definition of "this section has a body".
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * Three shipped queries decided whether a section had content with:
 *
 *     (content -> 'paragraphs') IS NOT NULL
 *
 *   server/routes/c2c/documents.ts      GET /:id/outline
 *   server/routes/c2c/projects.ts       project section list
 *   server/routes/c2c/project-vault.ts  vault section list
 *
 * The live editor saves `content: { text: "…" }`
 * (client/src/concept2cure/mdx/hooks/useSectionSave.ts:89). That shape has no
 * `paragraphs` key, so has_content came back FALSE for every section a user had
 * actually written, and three surfaces drew the wrong conclusion:
 *
 *   • useDossier.ts:131 gates its body re-fetch on has_content, so a written
 *     section RELOADED EMPTY — type, save, reload, and your work is gone from
 *     the screen while the text sits safely in the database.
 *   • project-vault.ts:203 sets `pct: hasContent ? 100 : 0`, so every written
 *     section reported 0% complete.
 *   • project-vault.ts:169,176 falls back to `hasContent ? 'draft'
 *     : 'not_started'`, so sections with an unrecognised status read as
 *     never-started.
 *
 * The reader was never the problem: contentToBody (useDossier.ts:80-99) already
 * handles `{paragraphs}`, `{markdown}`, `{text}` and a bare string. Only the
 * server's presence test was narrow, and it was narrow in three places
 * independently.
 *
 * This was unreachable until recently — the section save itself returned 500 on
 * every request (a bind parameter passed to `SET LOCAL`, fixed in #1188), so
 * nothing was ever stored to be lost. Repairing the save is what made it
 * reachable.
 *
 * ── Why a shared SQL fragment and not a SQL function ──────────────────────────
 * A `c2c_section_has_content(jsonb)` function would be the tidier data model,
 * and it is the wrong trade here. It would put these three endpoints behind a
 * schema object that has to exist before the code that calls it — and
 * scripts/db/deploy-migrate.mjs applies the migration set with
 * stopOnFirstFailure, so ANY earlier failure in that list would leave the
 * function absent while the services roll anyway. The failure mode would change
 * from "a boolean is wrong" to "42883 on the project page, the vault and the
 * outline". Nothing else needs the predicate in SQL — no index, no other query —
 * so the dependency buys nothing and risks an outage.
 *
 * A single exported fragment removes the actual defect (three copies drifting
 * from one writer) with no schema dependency at all: the fix is live on every
 * database the moment the code deploys.
 *
 * ── Semantics ─────────────────────────────────────────────────────────────────
 * True when the section carries a body in ANY shape the reader accepts.
 * Deliberately false for:
 *   • '{}'                 the scaffold's placeholder — an outline is not a
 *                          draft, and reporting it as content would be exactly
 *                          the fabrication this codebase has been removing
 *   • {"text": ""}         a key with nothing in it
 *   • {"paragraphs": []}   an empty list (the old expression called this TRUE)
 * Whitespace-only counts as empty: a section holding a single space has not
 * been written.
 */

/**
 * SQL boolean expression: does `column` hold a section body?
 *
 * @param column a column reference, optionally table-qualified (`ds.content`).
 *        Callers pass a literal from this file's own call sites — it is never
 *        derived from a request, and the guard below keeps it that way.
 */
export function sectionHasContentSql(column = 'content'): string {
  // This value is interpolated into SQL, so it is constrained to an identifier
  // or a qualified identifier. Every current caller passes a hard-coded string;
  // the check is here so that stays true if someone later reaches for a
  // variable.
  if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(column)) {
    throw new Error(`sectionHasContentSql: unsafe column reference ${JSON.stringify(column)}`);
  }
  const c = column;
  // `!~ '^\s*$'` rather than `length(btrim(…)) > 0`: btrim's default character
  // set is the SPACE alone, so a body of "\n\t" would have counted as written.
  // A single backslash reaches Postgres here — standard_conforming_strings has
  // been on by default since 9.1, so '^\s*$' is passed through to the regex
  // engine verbatim. A missing key yields NULL, which COALESCE reads as empty.
  const blank = "!~ '^\\s*$'";
  return (
    `CASE
       WHEN ${c} IS NULL THEN false
       -- A bare JSON string is a legacy shape contentToBody still accepts.
       WHEN jsonb_typeof(${c}) = 'string' THEN ${c} #>> '{}' ${blank}
       WHEN jsonb_typeof(${c}) <> 'object' THEN false
       ELSE COALESCE(jsonb_typeof(${c} -> 'paragraphs') = 'array'
                       AND jsonb_array_length(${c} -> 'paragraphs') > 0, false)
            OR COALESCE(${c} ->> 'text'     ${blank}, false)
            OR COALESCE(${c} ->> 'markdown' ${blank}, false)
            OR COALESCE(${c} ->> 'xml'      ${blank}, false)
     END`
  );
}

/**
 * The canonical plain text of a section body, for span lineage.
 *
 * ── Why this lives beside the SQL predicate ───────────────────────────────────
 * Both answer the same question — "what is this section's body?" — and the whole
 * reason the predicate exists is that three copies of that answer drifted from
 * the editor. This is the fourth place that has to agree, so it is here rather
 * than somewhere else.
 *
 * It was somewhere else, and it had the same defect. sectionPlainText in
 * server/routes/c2c/documents.ts read only `content.paragraphs`, so for the
 * shape the editor actually saves — `{ text: "…" }` — it returned the empty
 * string. The section save gates its whole lineage block on
 * `plain.trim().length > 0`, so for every section a user typed into, the gate
 * that exists to guarantee "content and its provenance commit together or
 * neither does" silently did neither: the text committed, and not one span was
 * recorded. A later coverage report reads real rows for other write paths,
 * returns a figure, and says nothing about those sections — partial provenance
 * reading as complete, which is the failure that gate was written to prevent.
 *
 * ── Stability is a correctness property here ──────────────────────────────────
 * Spans are recorded as half-open character ranges against the string this
 * returns and later VERIFIED against the string this returns. A second
 * serialisation, or a changed one, shifts every offset after the change and
 * makes provenance point at the wrong words. So the `{paragraphs}` branch below
 * is byte-for-byte what it always was; the other shapes are additive, and each
 * one previously produced '' — no lineage rows exist against them to invalidate.
 *
 * Key precedence matches contentToBody (client/src/concept2cure/mdx/hooks/
 * useDossier.ts:80-99), so the server and the reader never disagree about which
 * key wins when a row carries more than one.
 *
 * `xml` is deliberately absent: contentToBody cannot render it either, so it
 * stays out of both. That leaves an `{xml}` section reporting has_content with
 * no lineage — an honest gap, recorded here rather than papered over with a
 * serialisation nothing can display.
 */
export function sectionPlainText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return '';
  const c = content as Record<string, unknown>;

  if (Array.isArray(c.paragraphs)) {
    // Unchanged from the original: non-string or absent text contributes
    // nothing rather than the four characters of "undefined".
    return (c.paragraphs as unknown[])
      .map((p) => (p && typeof p === 'object' ? (p as { text?: unknown }).text : undefined))
      .filter((t): t is string => typeof t === 'string')
      .join('\n\n');
  }
  if (typeof c.markdown === 'string') return c.markdown;
  if (typeof c.text === 'string') return c.text;
  return '';
}

/**
 * The section statuses that count as COMPLETE.
 *
 * Not a fresh opinion — this mirrors `c2c_recompute_document_readiness()`
 * (migrations/20260528_phase9_document_schema.sql), the trigger that maintains
 * `c2c_documents.readiness`:
 *
 *     COUNT(*) FILTER (WHERE s.status IN ('approved','locked')) / COUNT(*)
 *
 * The database is the authority; this is the TypeScript reading of it, and
 * tests/schema-contract/c2c-section-completion.contract.test.ts parses that
 * migration and fails if the two ever disagree.
 */
export const C2C_SECTION_COMPLETE_STATUSES: ReadonlySet<string> = new Set(['approved', 'locked']);

/**
 * A section's completion percentage, on the same definition the document's is.
 *
 * ── The defect this replaces ──────────────────────────────────────────────────
 * The project vault emitted `pct: hasContent ? 100 : 0` for every section leaf,
 * while the DOCUMENT row beside it emitted `pct: readiness` — the proportion of
 * that document's sections which are approved or locked. Two different meanings
 * of the same column in the same tree.
 *
 * The consequence was a false completeness claim on a regulated surface: type
 * one sentence into a section and it reported **100%**, next to a document
 * reporting 0% because nothing had been approved. On a filing checklist that is
 * not a cosmetic inconsistency — it is the surface telling a regulatory affairs
 * lead that a section is finished when nobody has reviewed a word of it.
 *
 * ── Why binary, and why no middle value ───────────────────────────────────────
 * A document's number is a proportion because it has sections to count. A
 * section has no sub-parts, so the only honest answers are 0 and 100. Returning
 * 40 for "drafted" would be inventing a number, which is the thing this codebase
 * keeps removing.
 *
 * No signal is lost. Drafting progress is still carried by the leaf's `status`
 * ('not_started' / 'draft' / 'review' / 'approved' / 'final'), and a mandatory
 * section with no content still raises its own blocker flag.
 */
export function sectionCompletionPct(status: string | null | undefined): number {
  return typeof status === 'string' && C2C_SECTION_COMPLETE_STATUSES.has(status) ? 100 : 0;
}
