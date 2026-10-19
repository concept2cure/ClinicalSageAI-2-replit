# eSTAR tracking and technical-file audit outcomes — continuation

This work repairs five discarded audit outcomes: two registration branches, tracked-filing creation, a nonsigned lifecycle transition, and the shared MDR/IVDR packaging spine. Existing stores, package bytes, filing signatures and export refusal gates remain authoritative.

## Completed contracts

`upsertEstarRegistration` and `createEstarSubmission` return their actual supplemental `auditTrail` alongside the existing row. Nonsigned `advanceEstarSubmission` does the same. The three HTTP mutation endpoints preserve their original row fields and publish the result at `meta.auditTrail`; an unavailable supplemental audit preserves a completed mutation and produces a bounded warning. Unexpected audit rejection follows the same contract. The existing signed `filed` branch continues through its transaction and governed signature/audit writer; it receives no invented supplemental outcome.

The real `useEstarFiling` mutation hooks now call the canonical `probeAuditRowOutcome` before consuming each response. Their existing authentication headers and business-refusal classification are preserved. Tests mount those hooks with the existing `GlobalMutationErrors` consumer and verify visible warnings and intact successful results. The hooks belong to the existing K510/IVD/PMA filing panels. This work does not activate those fenced device surfaces; the launch Submission Center retains its read-only tracked-filing consumer.

The tracked-filing HTTP routes now use canonical `requireCurrentProjectActor` and `requireProjectAdmission`: current persisted membership, active organization for writes, current project sharing, writer permissions, workspace and archival policy. Create, detail, list and transition respect the actual integer `projects.id` relationship. Lists exclude inaccessible projects and preserve organization-scoped records with no project. Access checks that cannot run produce an error, not a fabricated empty result. Explicit invalid, empty or repeated project/status filters are refused with 400 rather than widening a list.

Nonsigned lifecycle updates also compare the state actually validated. When two requests read the same state, only one update succeeds; the other receives 409 `STATE_CHANGED` without a second transition audit. The signed filing implementation is unchanged.

Both technical-file assemblers return the actual shared packaging audit outcome. Their existing HTTP delivery endpoints expose it at `meta.auditTrail` only after the real export consequence succeeds. The final export has its own enforced audit policy: a refused audited-unplaced export still delivers no bytes. No synthetic “healthy export” outcome is created and no failed delivery is represented as a successful mutation. Readiness and the ZIP manifest are unchanged by audit availability.

## Verification

- **170 tests / 17 files** pass in the scoped regression run, including hook/UI, signing, official export and both technical-file sources.
- **13 native cases / 1 file** pass through genuine authentication, async tenant scope, the lazy request connection, verified TLS and non-superuser/non-bypass `app_service` on the canonically provisioned 387-migration database. No schema, grant, RLS or immutability policy is modified by these tests.
- Native cases verify private and foreign project refusals, malformed filters, current viewer/member/account changes, real chained audit readback, actual foreign-tenant RLS rejection of both audit stores, bounded unexpected rejection, successful mutation/readback/recovery, and unsigned filing refusal.
- A real concurrent nonsigned update test holds both actual PostgreSQL UPDATEs until both requests have validated. It proves one success, one 409 and exactly one audit row. Removing the state comparison makes that test fail with two successful transitions.
- Native MDR cases assemble a real ZIP from actual `c2c_documents`/`c2c_document_sections`. A failed assembly audit remains visible after the separately audited delivery. A failed final export audit refuses delivery, and recovery succeeds after the fault is removed.
- Controlled regressions fail when hook response inspection is removed (**3 failures / 3 passes**) or assembly outcomes are omitted (**3 failures / 2 passes**). The source is restored before accepted verification.
- Scoped ESLint reports zero errors. Eight warnings remain in the existing 510k route monolith, including list-handler complexity; forcing lint of the normally ignored legacy hook/test reports three DOM-type `no-undef` warnings. No lint configuration or baseline is changed.

Accepted outputs and controlled red receipts are in `estar-mdr-proof/`. These scoped counts overlap the integrated suite and must not be added to it. Native fixtures use synthetic organizations 94970/94971 and preserve their audit history. This is local functional and integrity evidence; it does not qualify an FDA filing, EU submission, clinical conclusion or live external service.
