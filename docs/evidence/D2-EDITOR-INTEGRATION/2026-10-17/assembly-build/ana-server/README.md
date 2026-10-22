# Saved-section candidates and project scope

W1 / D2, local qualification on `concept2cure-v2`, starting at `eceb747d3`.
This is the existing section draft and explicit accept path. No new provider,
model, credentials, storage table or automatic acceptance was added.

New candidates keep a server-captured saved-section base in the existing
generator JSON: exact section and parent, code, title, content digest and saved
timestamp. Accept reserves the parent, then locks the candidate and section.
A changed, missing or malformed base returns `409 SECTION_BASE_CHANGED`
before candidate deletion. Text, lineage and revision remain unchanged; the
candidate remains for inspection and a fresh generation is required. Expired
or already accepted candidates retain `410 DRAFT_EXPIRED`. The existing
transaction still rolls candidate consumption back if lineage, revision or
audit persistence fails. Audit before-content now comes from the locked row.

Generation takes project identity from the saved document, rechecks current
membership and sharing through canonical AnA project admission, and passes the
admitted numeric project to the existing hybrid search. The prompt labels these
chunks as project evidence, distinct from organization reference material.
An unbound standalone document can still request generation, but performs no
organization-wide Data Room search and reports unavailable retrieval scope.
Caller-supplied project/base claims cannot change this binding.

`initial-red.txt` records seven genuine failures and one existing passing case:
saved content/headings/timestamps were overwritten, newly private projects
still generated, and unbound retrieval searched the organization. The separate
`legacy-base-red.txt` proves a missing-base candidate previously accepted.
`fixture-regression-red.txt` retains the first seven-file run's nine failures:
old module mocks hid the new error/helper exports, and the structured-only
fixture had no admitted project. Those mocks now retain real helper exports;
the structured-only test explicitly stubs admission while actual SQL proves
scope in `authoringAssemblyDraftSafety.pglite.test.ts`. The real draft-record
fixture now binds its document to a project with canonical access prerequisites.

The final seven-file run passes 53 cases, including nine new real HTTP/PGlite
cases. `proof.json` records commands, counts, exact source/test SHA-256 values
before and after that run, and raw/stored log hashes. Stored logs normalize only
trailing line whitespace and the final newline. `lint.json` records zero errors
and unchanged warning counts: router 23, candidate store 1, existing accept unit
1; all other edited/new test files have zero warnings. No baseline was changed.

To reproduce after repository setup, use Node 22 and run:

```sh
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run --config vitest.config.ts server/routes/__tests__/authoringAssemblyDraftSafety.pglite.test.ts server/routes/__tests__/authoring-ai-draft-record.pglite.test.ts server/routes/__tests__/authoring-draft-accept-record.pglite.test.ts server/routes/__tests__/authoringAiDraftAccept.test.ts server/routes/__tests__/authoringAiDraftNoProvider.test.ts server/routes/__tests__/authoringAiDraftStructured.test.ts server/services/clinical-regulatory-evidence/__tests__/draft-candidate-store.pglite.integration.test.ts
```

The router, JWT verification, candidate store, authoring SQL, turn records and accept
lineage/audit transactions run for real against PGlite. Generation and Data Room
search are synthetic. Assertions prove fresh project admission and the canonical
search's project argument, not a live vector corpus. The existing atomic accept
fixture does not provision the governed filing store and asserts that honest
non-filing result. This does not qualify native PostgreSQL lock scheduling,
RLS enforcement, a live provider, human review or regulatory readiness.
