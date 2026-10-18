# Current project access for AnA's saved-document reads

W1 / D2, 2026-10-16. This increment strengthens the three existing AnA tools
used by the existing editor's saved-record oversight: `list_authoring_outline`,
`read_authoring_section` and `search_authoring_sections`.

A conversation's project was admitted at the beginning of a turn, but later
authoring tool calls only resolved the program's organization. A private-project
member revoked during that turn could still receive saved section text, search
hits and outline entries. These handlers also did not require an identified
actor or check current account/organization membership themselves.

Each invocation now calls the existing `admitAnaProjectScope` on the executor
used for its protected read. That canonical function reads current membership,
account and organization status, the unique program/project anchor and private
project sharing. A denied or unavailable admission returns an error before any
authoring-table query. The request's RLS-bound `sqlClient` takes precedence over
an injected source; background callers use `withTenantConnection`. Existing
successful result shapes, service rendering, result budgets and paging remain
unchanged. No model, tool, editor, UI pattern or access-policy implementation is
added.

The new real-SQL test first admitted an active member, then revoked private
project access or organization membership and called each actual tool handler.
It also exercised disabled accounts, missing actors, policy-read failure and
contradictory project identities. PGlite executes the actual canonical admission
and sharing queries; no authorization service is mocked.

- [RED](red.txt): 18 access failures, 3 valid-access passes across the original
  21 cases. The failures returned saved authoring data despite denial conditions.
- [First GREEN](green-focused.txt): the same 21 cases passed after the fix.
- [Related regressions](regression-first.txt): 5 files, 184 cases passed,
  including the existing service/tool budget, paging, pending-change rendering,
  registration and project-admission cases. Their older SQL-aware fake and
  PGlite fixtures were supplied with real membership, anchor and private-project
  prerequisites; admission was not bypassed.
- [Final focused GREEN](green-final.txt): 27 cases passed after adding six
  executor-routing cases. This is a separate run from the 184-case regression.
- [Strict lint](lint-final.txt): zero errors and warnings on all four changed
  source/test files. The [initial lint](lint-first.txt) found one unused type
  import, which was removed.

The full compiler subsequently found one fixture-only type error: the generic
`ToolContext` has optional identity keys, while `AnaProjectScopeInput` requires
those keys explicitly. The test now passes explicit organization, actor and
project keys, without a cast or weaker assertion. Production sources did not
change. After that correction, the [27 focused cases](green-type-fixture.txt)
and [strict lint](lint-type-fixture.txt) passed again. The summary retains both
the previous fixture hash and its corrected hash; the root session retains the
failed compiler receipt and owns the full compiler recheck.

Run the focused regression with Node 22 and the repository's installed Vitest:

```bash
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run \
  server/services/ana/__tests__/authoring-read-current-project.pglite.test.ts \
  server/services/ana/__tests__/authoring-read-tools.test.ts \
  server/services/authoring/__tests__/authoring-read.test.ts \
  server/services/ana/__tests__/authoring-read-registration.test.ts \
  server/services/ana/__tests__/project-scope-admission.pglite.test.ts
```

[summary.json](summary.json) records the base commit, check outcomes, frozen
source/dependency hashes and receipt hashes. Stored receipt copies remove only
extra LF bytes at the end of files so repository whitespace checks pass; original
operation-log hashes and stored-copy hashes are both retained.

This evidence qualifies current project access in isolated PGlite, without a
provider call. It does not qualify native PostgreSQL RLS, a browser, human
review, deployment or provider-backed AnA execution. Document/section view-policy
expansion is deferred: legacy HTTP content reads remain tenant-visible while
complete saved-document critique separately requires a whole-document view
grant. This increment changes neither policy. The root publication session
owns compiler/build checks and normal direct-publication hooks.
