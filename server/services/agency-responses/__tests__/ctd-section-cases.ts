/**
 * One case table for what a CTD section on an agency question is, shared by the
 * TypeScript normaliser's unit test (module-view.test.ts) and the SQL CHECK's
 * pglite test (server/routes/c2c/__tests__/cmc-questions-migration.pglite.test.ts),
 * so the two rules cannot drift apart unseen.
 *
 *   [what a person typed, what is stored (null: refused)]
 *
 * The normaliser is shared/regulatory/section-code.ts `normalizeCtdCode`, the
 * repository's one rule for a CTD code. The CHECK on
 * agency_communication_questions.ctd_section (migrations/
 * 20261018b_agency_response_questions.sql) admits exactly its output domain.
 */
export const CTD_SECTION_CASES: ReadonlyArray<readonly [string, string | null]> = [
  ['3.2.P.7', '3.2.P.7'],
  ['m3.2.s.4.1', '3.2.S.4.1'],
  ['M3.2.P.5', '3.2.P.5'],
  ['  3.2.p.8.1  ', '3.2.P.8.1'],
  ['3', '3'],
  ['3.2.P.100', '3.2.P.100'],
  ['3.2.R.US', '3.2.R.US'],
  ['2.3.S', '2.3.S'],
  ['5.3.5.1', '5.3.5.1'],
  ['foo', null],
  ['6.1', null],
  ['3.2.S.4.1 (impurities)', null],
  ['3..2', null],
  ['§3.2.P.7', null],
];

/** Strings the CHECK must refuse when written directly, bypassing the normaliser. */
export const CTD_SECTION_RAW_REFUSED: readonly string[] = ['foo', '3.2.p.7', 'm3.2.P.7', '6.1', '3.2.P.7 ', `3.${'1.'.repeat(20)}1`];
