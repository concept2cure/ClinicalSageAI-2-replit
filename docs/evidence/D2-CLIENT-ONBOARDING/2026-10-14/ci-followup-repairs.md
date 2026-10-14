# Final CI follow-up for client onboarding

Fresh provisioning and the separate authenticated browser workflow passed at
`342ffc8d`. [CI run 38508480776](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38508480776)
at that head identified bounded follow-up issues. The changes in this delivery
preserve the existing authorization, audit and schema guards.

## API-key request context

The credential/audit transaction initially used the shared runtime transaction
helper. The request-database adoption guard correctly refused that new route
dependency. Create and revoke now use `requestPgClient(req)` and own one
transaction on that pinned connection. Credential changes and their chained
audit write share it. Missing context is refused before a credential mutation;
audit failure rolls the mutation back, and no shared-pool fallback is available.

The new missing-context assertion failed against the earlier route: creation
returned 201 instead of the expected 500. The corrected API/service checks pass
14 tests. A real `LazyRequestDbClient` regression proves that tenant session
setup precedes exactly one BEGIN, credential write, chained row and COMMIT on
one acquired client. The adoption gate passes with 227 current shared-pool
routes against its unchanged 228-route baseline.

## Canonical report and authoring fixtures

The new report-index migration exposed an old baseline-journal fixture that
never declared `immutableReportRecords`. The sweep test now generates that
table's actual Drizzle DDL, including enums, constraints and indexes, using the
existing public kit API. All 19 sweep checks pass, including two complete
migration-set applications and actual cross-tenant isolation. The migration's
missing-base-table refusal and five focused index tests remain intact.

The same hosted failures on the upstream head already named two incomplete
audit fixtures and six omitted authoring migrations across three section
fixtures. Both audit fixtures now use shared `AUDIT_LOGS_PGLITE_DDL`; the seeded
workflow adoption row supplies its UUID. The section fixtures apply the actual
comments-router and immutable-revision-ledger migrations. The audit fixture
guard accepts all 23 declarations and all 17 writer columns. The corresponding
six suites pass 94 distinct tests; earlier subset logs overlap this final total.

## Saved-document actor identity

The inherited saved-document critique actor-email read was not tenant-qualified.
It now joins canonical organization membership and requires the captured tenant
alongside active identity. The raw-SQL isolation guard reports zero candidates
without changing its baseline or scanner. Real PGlite checks use the SQL actually
executed by a successful review: an own-tenant member resolves, a foreign-only
member does not, and that foreign member's identity still exists in its own
organization. A full foreign-member critique produces no verdict or section
read. This additional check is included in the 94-test fixture total above.

## Production bundle initialization

Once schema provisioning passed, production-mode CI exposed an inherited async
module cycle before the server could bind its port. `authoring-export` imported
workflow governance, while workflow governance imported two digest functions
from the export service. That cycle became asynchronous through the existing
CSR provider initialization chain.

Those two pure functions now live in `authoring-content-digests`. Their bodies
are byte-identical to the preserved originals, and `authoring-export` keeps its
public re-exports. Workflow governance imports the pure helper directly. No
digest recipe, stored signature, export verdict or release policy changes.

Using the canonical server build options and Node 22.23.3, the preserved bundle
timed out before reaching composition. The corrected bundle reached the
composition root and exited at a deliberate production posture refusal. The
probe uses a scratch directory, clears inherited environment, supplies only
generated throwaway keys, and has no usable database/provider credentials.
It proves module initialization; it is not a successful `/readyz` or live RLS
boot claim. Eight focused signature/export/workflow/startup suites pass 62
tests, including golden digest values, public-export identity and the actual
bundled-entrypoint regression.

## Safe verdict records

- [API-key and sweep excerpts](ci-followup-api-sweep.txt)
- [Audit, actor and migration fixture excerpts](ci-followup-authoring.txt)
- [Bundled startup negative/positive probe](ci-followup-bundle-boot.txt)
- [Historical checksum dispositions](history-scan-dispositions.md)
- [Full TypeScript check](typecheck-followup.txt)
- [Complete client/server build](build-followup.txt)

These separate runs overlap other evidence totals; they are not a combined
unique-test count. Full type checking, client/server build and final guard
verdicts are recorded alongside them. No guard allowance was increased, no
new dependency was added, and no production deployment was performed.
