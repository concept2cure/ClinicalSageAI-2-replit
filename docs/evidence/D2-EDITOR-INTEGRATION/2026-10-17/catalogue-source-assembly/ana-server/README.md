# Exact selected sources in section drafting and acceptance

W1 / D2, canonical `concept2cure-v2`, starting at `ff5e065a7`. This extends the
existing section draft/accept endpoints and candidate generator JSON. No new
provider, schema, editor, dependency or parallel source reader was added.

Explicit `sources` receipts are decoded and passed to the canonical private
resolver with the saved document's project and verified actor. Invalid or
changed selections refuse before dispatch and never become broad retrieval.
The model sees each complete recorded excerpt, including text beyond the
ordinary 600-character search preview. The resolver rechecks the exact saved
spans after generation before a candidate can be retained. Existing requests
without a selection keep their canonical Vault retrieval behavior.

Acceptance first verifies the saved section base, then reserves and verifies
the retained source manifest inside its transaction before the content update.
Malformed stored receipts remain visible to that verifier. The exact manifest
survives candidate consumption in the canonical chained acceptance audit, both
under `generator.assemblySources` and as `assemblySources` with
`assemblySourceUse: verified_generation_input`. That designation records input
to generation, distinct from structural assembly reference intent. It does not
assert claim support, whole-document review or scientific qualification.
Only genuine canonical CRE identities feed source lineage; an unlinked Vault
upload remains uncited.

The adjacent uncertain-acceptance defect was also corrected. An unconfirmed
COMMIT reply causes `503 DRAFT_ACCEPT_UNCONFIRMED` and `release(Error)` without
an application rollback or retry. A failed precommit rollback also discards the
client and returns that unknown outcome. Confirmed rollbacks retain existing
source/base/lineage refusals and candidate preservation. This prevents the old
`LINEAGE_REQUIRED` response from claiming that a committed acceptance was not
saved.

`initial-sources-red.txt` retains three failures: null, malformed and empty
source selections previously returned model drafts. `uncertain-accept-red.txt`
retains three further failures: lost replies before/after actual COMMIT and a
failed rollback previously returned a definite lineage refusal. The after-COMMIT
case queries the actually saved content and consumed candidate before asserting
the truthful response requirement.

`final-green.txt` passes 89 cases across 12 files, including 14 new actual
HTTP/PGlite cases. These cover exact mixed unfiled Data Room/Vault excerpt
parity, before/after generation checks, retained manifests, actual audit
persistence, source refusal and writer-fault rollback, and the three uncertain
transaction cases. Earlier source/base/Vault/lineage regressions also pass.
`proof.json` contains the exact command, counts, raw/stored log hashes and 17
source/test/shared hashes that match before and after the final run. Stored
logs normalize only line endings, trailing line whitespace and the final
newline. `lint.json` records zero errors and unchanged warning counts: router
23, candidate store 1, new test 0. No baseline was changed.

The subsequent official compiler identified the selected-source test's
`JourneyDb.pool` query result as `unknown[]`, which is wider than the resolver's
required record rows. The fixture now delegates directly to the same
instrumented PGlite connection with `query<Record<string, unknown>>`; no cast,
production code or shared harness was changed. `typing-remedy-green.txt`
records the final 14-case replay after that annotation, and
`typing-remedy-proof.json` retains 17 matching before/after source pins.
`typing-remedy-lint.json` records zero errors and warnings for the corrected
fixture. The original 89-case proof and pins remain unchanged. The lead session
owns the official compiler result.

Only model generation and optional broad retrieval are synthetic in the new
HTTP suite. Selected-source reads, source admission, candidates, acceptance,
lineage, revisions and audit SQL run on PGlite. Audit-writer and transport faults
are injected. PGlite has one connection: direct fixture cleanup after an unknown
response emulates disconnect of a still-active transaction outside the recorded
application query lane. The test proves the `release(Error)` eviction request,
not a native socket close. This is not native PostgreSQL scheduling, production
RLS, live-provider, human-review, deployment or regulatory-readiness qualification.
