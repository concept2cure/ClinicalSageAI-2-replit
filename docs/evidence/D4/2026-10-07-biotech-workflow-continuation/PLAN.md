# Existing biotech workflow qualification — W3 / D4

Parent: `3400f1f32f7bed7bfa041e390b67407420a30d2d`.
Only product/branch: `concept2cure-v2`. No new surface, store, model,
integration, statistical engine or dependency is introduced.

The control tower coordinates three disjoint implementation scopes. Each
regression must reproduce the existing defect before the production change.
Shared regression, lint, server build and release gates follow integration.

## Contracts

1. **Saved draft sources into withdrawal and release.** Existing server-verified
   `provenance.projectSourceReferences` must contribute to the source-impact
   count, active-review blocker and snapshot fingerprint. Match exact tenant,
   document ID and original hash; no model-declared approval is accepted.
   An affected approved/frozen/reviewed document requires governed review before
   withdrawal. Draft references remain reviewable dependencies, not automatic
   deletion targets. Before producing a new Authoring export or Vault rendition,
   selected saved references are checked with the existing source verifier;
   missing, changed, withdrawn-data or superseded versions refuse output.
   References absent on legacy/manual documents do not imply scientific
   qualification. `keep_data` remains usable, with original availability distinct
   from data eligibility. File-to-Vault rechecks selected references inside its
   existing recording transaction under the canonical disposition-program lock.
   This is version/eligibility verification, not claim support or SME review.

   **Reservation addendum.** A successor version is an INSERT, so locking only
   the original row cannot keep it current. Source-linked export and final
   Vault recording reserve the existing Vault document/catalog tables in SHARE
   mode after the programme lock, reverify, then retain that reservation through
   the audit/history receipt commit. Legacy/manual exports retain their existing
   path. The table reservation has a five-second lock timeout; deployed
   contention and independent-session concurrency remain unqualified.

   **Filing snapshot addendum.** Working drafts can be filed, and storage/OCR
   takes place outside the final recording transaction. A same-status section
   edit during admission must not cause the receipt to baseline new text while
   Vault stores the old rendering. Before writing any filing receipt, reserve
   the existing section table for the short recording transaction and compare
   its current rendered fields/order with the initial rendering snapshot. A
   mismatch refuses the filing and uses the existing compensation. Store the
   canonical section digest of the rendered snapshot, never a later re-read.
   No alternate digest or snapshot store is introduced.

   **Tenant-consistency review addendum.** The opted-in current-source reader
   must require the document's recorded organization to match the caller as
   well as its programme's ownership. A legacy conflicting/unknown recorded
   tenant cannot be admitted as a newly verified source through programme
   ownership alone. Demonstrate the actual getter and saved-source verifier
   accepting the conflicting row before correction, and retain same-tenant
   positive controls. Historical default reads are outside this bounded change.

2. **Edited workbook parent dependency.** Detect eligible direct derived captures
   through canonical parent IDs or named parent upload/hash provenance, across
   the organization's projects. A terminal data withdrawal/supersession requires
   review of such children; keeping extracted parent data remains possible.
   Fingerprint the dependencies so a late child invalidates an old preview.
   Do not auto-delete, reparent, supersede or qualify children. Conversation-only
   audit ancestry and a universal transitive dependency graph remain unqualified.
   See the scoped DERIVATION contract.

3. **Recorded CMC assessment.** Unreadable selected-batch payloads, incompatible
   point conditions and conflicting ordinary criteria must not disappear while
   another subset produces an overall supported shelf-life/poolability claim.
   Preserve raw input and independent assessable outputs; unresolved context is
   explicit. No guessed unit conversion, condition aliasing or scientific-rule
   expansion. See the scoped CMC contract.

## Scope ownership

- Control tower: disposition impact/service/types and dialog; saved Authoring
  source verifier/export/file boundary; related source/impact regressions.
- Intake session: direct derived-impact helper, focused SQL tests and evidence.
- Scientific session: recorded CMC assessment, focused regressions and evidence.

## Qualification limits

Local tests include actual PostgreSQL SQL through PGlite, but do not prove
independent-session concurrency, deployed RLS, live provider behavior, complete
client datasets, model PQ, accountable scientific review or regulatory acceptance.
D4 and D1–D10 remain open unless their separately named evidence is produced.
