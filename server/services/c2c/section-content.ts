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
