# Saved source withdrawal and new rendition verification

Canonical branch: `concept2cure-v2`. Starting source:
`3400f1f32f7bed7bfa041e390b67407420a30d2d`. Contract: [PLAN.md](PLAN.md).

## Corrected behavior

Existing server-verified `provenance.projectSourceReferences` now contributes
to the disposition impact count and fingerprint using the exact tenant, Vault
document ID and original hash. Active review, approval and sealed/submitted
states block withdrawal for governed review; an ordinary draft remains a
visible dependency. A late saved dependency invalidates the old preview.
Wrong IDs/hashes and another tenant's documents are not dependencies.

Saved-source verification now requires the current Vault version. Explicit
historical reads remain available to existing historical workflows, while
draft source selection/save and new renditions reject an older predecessor.
Current-source admission also requires the source's recorded tenant to match
the caller, in addition to its programme's ownership. Foreign or unknown legacy
recorded tenants are refused without rewriting the record. The actual getter
and verifier defect/controls are recorded in
[SOURCE-TENANCY-REVIEW.md](SOURCE-TENANCY-REVIEW.md).
New renditions also refuse a missing source, terminal data withdrawal,
supersession, failed extraction, changed hash/text extent, incompatible scope,
malformed receipt or unavailable verifier. `keep_data` retains its existing
data eligibility and original-availability presentation. Legacy/manual records
without selected references make no new claim of scientific qualification.

The actual sealed export SELECT reads saved provenance and its owning programme.
Source-linked exports begin a transaction, take the canonical programme lock,
reserve `vault.documents` and `vault.document_catalog` in SHARE mode, then
reverify. The EXPORT audit, renderer and export-history writer use that same
executor, and response bytes are sent after its commit. A new source version is
an INSERT, so a predecessor row lock alone would not contain the race. Lock
failure refuses output. File-to-Vault performs the same revalidation in its
existing final recording transaction; a late source refusal uses the existing
admission compensation rather than leaving an unrecorded visible Vault file.

## Behavioral receipts

| Receipt | Actual result and assurance |
| --- | --- |
| [SAVED-SOURCES-RED.txt](SAVED-SOURCES-RED.txt) | 18 failures / 2 passes before production changes: actual disposition SQL and renderer behavior exposed missing dependencies and rendition refusals. |
| [SAVED-SOURCES-INTEGRATED.txt](SAVED-SOURCES-INTEGRATED.txt) | 8 files / 98 cases passed after integration: impact SQL, source-current SQL, parser/verifier, source reservation sequencing, UI and existing signed export gate. |
| [saved-source-route-projection-red.txt](saved-source-route-projection-red.txt) | Isolated executor mutation restores the exact old export SELECT: 4 actual HTTP cases fail with 200 instead of 409; 2 controls deliberately skipped. Production code was not reverted. |
| [saved-source-route-green.txt](saved-source-route-green.txt) | Actual router, PGlite source/catalog SQL, XML renderer and history writer: 6 cases pass. Withdrawn/noncurrent/unreadable/malformed receipts produce no EXPORT audit or history row. Current and retained-data controls commit successfully. |

The route controls explicitly prove BEGIN, SHARE reservation before current-only
source read, audit on the transaction executor, history INSERT and COMMIT.
The audit writer is an explicit test seam. The narrow renderer/reservation unit
tests use an explicit catalog loader mock; they do not substitute for the actual
SQL route and impact regressions. Initial source/current/UI receipts are kept
as intermediate evidence; the final manifest recorded in README supersedes
their counts for integrated validation.

## Limits

These are source identity, eligibility and version checks. They do not prove a
claim is supported by a selected excerpt, that the excerpt belongs to the stated
section, model PQ, accountable scientific review, or regulatory acceptance.
PGlite proves executed PostgreSQL SQL and transaction order, not independent
sessions, production runtime privileges/RLS, source-store lock contention or
provider/storage operation. SHARE reservations briefly affect both source
tables across programmes; their deployed latency still needs qualification.
No migration, model, dependency, alternate store, historical file deletion or
automatic scientific approval was introduced. D4 remains open.
