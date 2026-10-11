# Source-to-authoring and Vault-to-submission CI follow-up — W3 / D4

Repository `concept2cure/ClinicalSageAI-2-replit`, branch `concept2cure-v2`.
Current reproduction source: `714506d7cd8ac499e07450542b74e72ec5630a5c`.
Scope is the six existing suites assigned by `CI-FOLLOWUP-PLAN.md`.
Only test setup and one explicit retained refusal control change. Production
predicates, shared helpers, migrations and original assertions are unchanged.

## Current RED and bounded repair

The explicit current-source run reproduced 33 failures and 38 passes across
71 cases in six physical files, with no pending/skipped cases, process exit 1,
and duration 42.25 s (`CI-SOURCES-RED.txt`). Counts match the prior `40697292`
artifact's six assigned boundaries, but this receipt is a new execution on the
current source before setup edits.

| Suite | Current RED failed / total | Demonstrated cause | Setup correction |
|---|---:|---|---|
| `server/routes/__tests__/authoringWritesBoundAndAudited.pglite.integration.test.ts` | 7 / 20 | SQLSTATE `42P01`: citation read/refresh reaches an omitted `public.document_data_dispositions` ledger. | Apply the exact existing disposition migration in its own literal migration list. Reuse the unchanged test-only lineage-store fixture to supply its omitted `file_uploads`; existing audit JSON remains its original store. |
| `server/services/ana/__tests__/draft-authoring-document-tool.pglite.integration.test.ts` | 1 / 20 | The positive source is seeded with `organization_id=NULL`; current source admission explicitly requires its own recorded tenant to equal the caller under `currentOnly`. | Seed each positive/project/foreign source with its actual tenant. The foreign source retains `OTHER_ORG`. Keep the original NULL input as an explicit admission refusal with zero authoring writes. |
| `server/services/ectd/__tests__/assemble-from-core.vault-uuid.pglite.test.ts` | 2 / 5 | SQLSTATE `42P01`: the real Vault binary-availability predicate reads the omitted disposition ledger. | Apply the exact existing disposition migration after local Vault prerequisites. |
| `server/services/ectd/__tests__/leaf-source-resolver-vault-finalized.test.ts` | 12 / 12 | Same omitted ledger; execution fails before approval/currentness checks. | Same exact migration after local Vault prerequisites. |
| `server/services/ectd/__tests__/leaf-source-resolver-vault.test.ts` | 9 / 12 | Same omitted ledger; execution fails before storage/byte checks. | Same exact migration after local Vault prerequisites. |
| `server/services/pathway-engines/mdr-ivdr/__tests__/assemble-technical-file-vault-uuid.pglite.test.ts` | 2 / 2 | Same omitted ledger in Vault-backed technical-file resolution. | Same exact migration after local Vault prerequisites. |

The reused migration is `migrations/20261006_document_data_dispositions.sql`,
including its constraints, normalizers and applicable guards; no reduced table
copy or eligibility mock is introduced. The unchanged fixture is
`server/services/document-data-disposition/__tests__/lineage-stores-fixture.ts`.
No existing common helper was edited.

The AnA change follows the existing `loadDocumentForOrg` contract:
`currentOnly` requires both `d.organization_id = caller` and current-version
truth, in addition to programme scope. Its original source identity, digest,
text and reference remain the explicit NULL-organization refusal input. That
control checks no saved document/id and unchanged document, section, revision
and CREATE-audit counts, then restores the fixture tenant. Original wrong-project,
foreign-tenant, stale hash/catalog and committed-withdrawal controls remain.

## Execution and preservation

`CI-SOURCES-GREEN-SETUP.txt` records all original 71 cases passing across six
files, no skipped/pending cases, 51.48 s, exit 0, before the added NULL-tenant
refusal control. The final explicit six-file run including that control
(`CI-SOURCES-GREEN.txt`) passed all 72 cases with zero skipped/pending cases,
41.53 s, process exit 0. `CI-SOURCES-SCOPE.json` records its six physical files,
per-file counts and both earlier executions.

Final scoped lint (`CI-SOURCES-LINT.txt`) has zero errors and zero warnings,
process exit 0. Scoped `git diff --check` passes. No existing assertion line was
removed. Every original positive and negative case is retained; the new refusal
adds one case. `CI-SOURCES-SCOPE.json` names all changed files, migration/helper
use, executable scope and results.

The unchanged controls continue to measure section/citation ownership,
transaction-client mutation and audit placement, previous checksums and text,
audit-refusal rollback, no-change no-write behavior, current/project source
provenance and CREATE audit metadata, Vault UUID identity, caller organization
on storage reads, raw staged bytes, hash/PDF checks, explicit unresolved reasons,
approval/currentness and approval-for-these-bytes, missing-source ZIP readiness,
and draft-leaf transmit blockers. The fixture repair lets those existing
assertions execute through the canonical guards.

## Limits and integration ownership

These results establish the six existing contracts under local PGlite and the
suites' original HTTP/storage/audit/provider seams. They do not establish live
transport, provider qualification, deployed RLS/runtime roles, independent
connections, production race/latency qualification, full intended-use validation
or signed scientific release. Missing unrelated stores in nonfatal telemetry
seams are not claimed as complete deployed fixture qualification.

The control tower owns the final combined manifest (the preceding 69-file gate
plus all follow-up suites), warning ratchet, builds, branch gates, publication
and actual broad CI verdict. No full local TypeScript, production change,
commit, push, branch or worktree was made by this worker. GitHub supplies the
24-GiB semantic TypeScript gate on the exact final source. D4 and D1–D10 remain
open until their named evidence is obtained.
