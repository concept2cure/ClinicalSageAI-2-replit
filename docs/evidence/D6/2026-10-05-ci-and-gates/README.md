# D6: CI gates that could not see, and the red jobs on concept2cure-v2, 2026-10-05

**Row:** D6, security and the controls that hold it. Every gate below is a
control that reports on security, tenancy or Part 11 behaviour; a gate that
cannot see code, or that is red for a reason unrelated to its purpose, is not
holding anything. This session also cleared CI jobs that had been red for
days, because a red Lint job skips every job that waits on it.

## 1. Fifteen gates read string literals as comments (`33b865ad7`)

Fifteen gates stripped comments with `/\/\*[\s\S]*?\*\//g`, most also with a
`//` regex, before scanning. Neither knows what a string is. A literal such as
`'/api/advisory/*'` opened a "comment" that ran to the next real closer, and
`'https://…'` cut off the rest of its line. The code inside those spans was
never scanned.

The fifteen gates cover:
- session RLS bypass;
- 5xx error leaks;
- fabricated signer identity;
- the PQ-only model-evaluation path;
- mock data in production routes;
- purge reach and lineage on save;
- CommonJS `require`, unbacked tables and bundle reachability;
- four client-honesty rules.

Each now uses `scripts/ci/lib/strip-comments.mjs`, and none keeps its own
comment regex.

- **Nothing was hidden.** Every gate gives the same verdict on the tree.
  Where a gate has a `--list` output, it is byte-identical. No violation
  surfaced in the code that had been hidden.
- **Made to fail.** Each gate has a case: a violation after a string holding
  `/*`, and after `'https://…'` where the gate cut `//`. Each case also has a
  control with the violation only in a comment. Every case fails on the gate
  as it was at HEAD and passes now. Three of the self-tests' OPEN known gaps
  are now asserted RED cases.
- **The stripper itself.** An independent critic found that its "safe
  direction" claim was false. A quote inside a regex literal mis-paired every
  string after it, so a later `'/api/x/*'` opened a comment. It now recognises
  regex literals. `measure-stripper-vs-typescript.mjs` compares any stripper
  with the TypeScript parser over every tracked JS/TS file
  (`stripper-vs-typescript.txt`):

  | | Lines where code was blanked | Comment lines left unstripped |
  |---|---|---|
  | Old lib | 10 | 1,481 |
  | New lib | 0 | 98 |

- **Window gates.** `{ lineComments: 'drop' }` keeps three character-window
  gates (server-error-leaks, ungated-fixture-fallback, success-before-ok)
  measuring code rather than a blanked note, as their windows were tuned.
- **Tests.** `scripts/ci/__tests__/strip-comments.test.mjs` has 8 cases, and
  the previous lib fails 3 of them.

## 2. Security Scan and the full-history secret scan

- **`braces`, GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 (`8f64f9e2d`).** No fixed
  release exists.
  - The only production path ran through `http-proxy-middleware`, a declared
    dependency that nothing imported. It is removed, and
    `npm ls braces --omit=dev` is empty.
  - The production bundle builds, and `ci:server-bundle-prod-imports` passes.
  - The dev-only path (jest, danger) is one ledger row, disposition
    unreachable, expiring 2026-11-05, mirrored in `.trivyignore`.
  - Before, the gate exited 1 with "unreviewed Critical/High". After, PASS.
- **Trivy CRITICAL on the secret gate's own fixture (`52681a81`).** It was a
  literal `"type": "service_account"`. It is now spliced like the fixture's
  other values, and the self-test passes 16 of 16.
- **gitleaks, nine evidence-file matches (`113342520`).** Each was opened and
  classified, and none is a credential:
  - four test JWTs: localhost audience, expired, signed with the test secret;
  - a fixture user's reset token;
  - a regex quoted in prose;
  - a connection URI whose password was already elided to `npg_…`. It
    was compared by hash with INF-22's values and the self-test's synthetic
    ones, and is neither.

  They are recorded in `.gitleaksignore` as one "not a secret" block with
  that reasoning. The four credentials the job lists as live (P0-17) are
  unchanged: revoking them is the founder's action.

## 3. The other red Lint and DB-job steps

| Step | Cause | Fix |
|---|---|---|
| Repo health scan | `git ls-files` passed `execFileSync`'s 1 MB buffer, so the scan died with ENOBUFS. The baseline-refresh workflow has died the same way since 2026-10-04 17:53. | 64 MB buffer (`c940af4e6`). The refresh bot absorbs the one file that grew. |
| Gates that ran nowhere → `ci:canonicalizers` | The shape test matched a sorted list of credential names beside an unrelated `JSON.stringify` (`gateway-accounts.ts`). | The sorted keys must feed the output, and comments are stripped first (`c940af4e6`). A 10-case test: all 7 real copies are still found. A detector that never counts fails 7 of the 10. |
| `ci:unverified-verdicts` | DP-77's per-organisation chain verify threw on an unreadable store, so the route answered 500 instead of 503 UNVERIFIABLE. | Treated as "did not run", as the estate branch and `walkTenantChain` already do (`584d31b74`). Gate: 2 failing before, 35 of 35 after. |
| PDF runtime canonicality | `typeset-leaf-pdf.ts` (D2) is a new pdf-lib consumer. | Approved beside its sibling `leaf-pdf-renderer.ts`, on the same byte-determinism grounds, which its test holds (`de49774e1`). The D2 lane may still re-route it. |
| Purge coverage (Blank DB job) | Four org-keyed tables that no purge reached, `organization_gateway_accounts` (client gateway credentials) among them. | Added to `PURGE_CHILD_TABLES` with reasons (`02ee8f2b7`). The gate reports 0 new. 52 of 52 purge and export-contract tests pass. |

## Open, for their owners

- **Tenant export.** The export is catalog-driven, so it returns
  `organization_gateway_accounts.credentials_ciphertext`: encrypted, but key
  material. The contract forbids excluding a purge target, so this needs
  column-level redaction in the export, which does not exist.
- **QMS.** `tenant-quality-validation.ts` answers `valid: true` for every
  section while gating rules cannot be written (recorded in
  `writerless-stores-baseline.json`, 2026-09-23).
- **Test harness.** The freeze-gate row-lock suite misreads the alias table
  on a migrated database (2026-09-23 note in `4226565db`).

## Evidence

| File | Shows |
|---|---|
| `stripper-vs-typescript.txt` | The old and new lib against the TypeScript parser over every tracked JS/TS file. |
| `measure-stripper-vs-typescript.mjs` | How that was measured; run it on any stripper. |
| `gates-green.txt` | The gates above passing on the tree, and `test:ci-scripts` 188 of 188. |
