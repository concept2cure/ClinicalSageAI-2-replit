# RA-001 — Risk Assessment and CSA assurance selection

| Field | Value |
|---|---|
| Document ID | RA-001 |
| Version | 0.20 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §3 |
| Method | FDA CSA (Sept 2025 final; Feb 2026 update): identify intended use → determine risk (process risk and whether the feature can cause a quality/patient/data-integrity failure) → choose the least-burdensome assurance activity that gives confidence → record the result. Risk levels and activities are defined in VMP-001 §3.1. |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | One row per URS requirement; assurance chosen per CSA. |
| 0.2 | 2026-09-23 | W3 | URS-PROJ-010 (the sign-in audit trail) assessed: high, scripted (VSR-001 §13, F-19). |
| 0.3 | 2026-09-23 | W3 | URS-PROJ-011 (signing out ends the session) assessed: high, scripted (VSR-001 §13.9, F-21). |
| 0.4 | 2026-09-23 | W3 | URS-SRDY-005 reassessed: high, scripted (was medium, unscripted). A readiness review that reports an all-clear it did not compute is a silent failure (VSR-001 F-23). |
| 0.5 | 2026-09-23 | W3 | URS-SRDY-006 reassessed: high, scripted (was medium). A clean scan is read by Authoring's preflights as "no blocking contradictions" (VSR-001 F-25). URS-SRDY-008 reassessed: medium, scripted (was low, ad-hoc); it is now the launch boundary. |
| 0.6 | 2026-09-23 | W3 | URS-AUTH-010 reassessed for the signing ceremony that replaces the PIN (URS-003 v0.2): still high, scripted; the assurance now covers the PIN's removal, the password, the enrolled second factor, and §11.300. |
| 0.8 | 2026-09-26 | D6 | URS-PROJ-013 (a session left alone ends) assessed: high, scripted, with the rule pinned by unit tests on both authenticators, the verifier and the refresh (plan P1-1). |
| 0.7 | 2026-09-23 | W3 | URS-PROJ-012 (an account taken out of use can do nothing) assessed: high, scripted, with the refusals the OQ run cannot reach covered by an automated test on real PostgreSQL (VSR-001 §16, F-28, F-29). |
| 0.9 | 2026-09-30 | `…01DiJJAk` (VR-08) | URS-VAULT-011 (version check-in) assessed: high, scripted. |
| 0.10 | 2026-10-01 | `…01DiJJAk` (VR-09) | URS-VAULT-012 (a document listed once; every version listed, downloadable and in its history) assessed: high, scripted. |
| 0.11 | 2026-10-01 | `…01DiJJAk` (VR-13) | URS-VAULT-013 (review and approval of a Vault version, with an e-signature and supersession) assessed: high, scripted (credentialed). |
| 0.12 | 2026-10-01 | `…01DiJJAk` (VR-11) | URS-VAULT-014 (filing captured sources from the data room, with a result for each) assessed: high, scripted. |
| 0.13 | 2026-10-01 | `…01DiJJAk` (VR-11b) | URS-VAULT-015 (confirming suggested filings together with one reason) assessed: high, scripted. |
| 0.14 | 2026-10-01 | `…01DiJJAk` (critique 15) | URS-VAULT-016 (version compare) assessed: medium, scripted. |
| 0.15 | 2026-10-01 | `…01DiJJAk` (critique 15) | URS-VAULT-017 (library search across projects) assessed: medium, scripted. |
| 0.16 | 2026-10-01 | `…01DiJJAk` (critique 15) | URS-VAULT-018 (re-proving stored versions) assessed: high, scripted. |
| 0.17 | 2026-10-01 | `…01DiJJAk` (critique 15) | URS-VAULT-019 (document relationships) assessed: medium, scripted. |
| 0.18 | 2026-10-01 | `…01DiJJAk` (VR-14a) | URS-VAULT-020 (where each version is placed) assessed: medium, scripted. |
| 0.19 | 2026-10-01 | `…01DiJJAk` (VR-14c) | URS-VAULT-020 extended to official eSTAR exports; still medium, scripted. |
| 0.20 | 2026-10-01 | `…01DiJJAk` (critique 15) | URS-VAULT-021 (review annotations) assessed: high, scripted. |

## 1. Risk model

- **Patient / product risk**: none of the launch apps administers treatment or controls manufacturing; the direct patient risk is indirect — wrong or unattributable content in a submission that a regulator relies on, or a procedure (SOP) that staff follow without valid approval.
- **Data-integrity risk (ALCOA+)**: attributable (who), legible, contemporaneous (when), original (hash-verified bytes and snapshots), accurate (deterministic engines, no fabricated data), complete (audit chain intact), consistent, enduring, available.
- **Process risk** is *high* where a failure would be silent (a chain that reads intact when it is not, an approval without a signer), *medium* where a failure is visible and recoverable, *low* where it is informational.

The columns below are parsed by `scripts/validation/build-traceability.mjs`; keep the first five columns in this order.

## 2. Assessment

| URS id | Intended use | Risk (patient / data integrity) | Assurance activity | Rationale |
|---|---|---|---|---|
| URS-PROJ-001 | Gate every program read/write behind an authenticated organisation member | high — unauthenticated access would expose or alter regulated records | scripted | Part 11 §11.10(d); anonymous negative test plus browser login |
| URS-PROJ-002 | Refuse malformed program intake | medium — bad vocabulary produces a mis-classified filing, visible at review | scripted | deterministic validation, cheap to script both negatives |
| URS-PROJ-003 | Persist and list the program | high — the program is the root of every downstream record | scripted | create → list → read round trip |
| URS-PROJ-004 | Attribute program creation and keep it in the chained log | high — unattributable creation breaks ALCOA "attributable" | scripted | activity feed, chain verifier, ledger surface each checked |
| URS-PROJ-005 | Render Projects and Project Home | medium — a non-rendering surface stops work but corrupts nothing | unscripted | rendering check with screenshot; observed state recorded |
| URS-PROJ-006 | Raise and list tasks, ledgered | medium — tasks drive but do not constitute the filing | scripted | create → board → surface |
| URS-PROJ-007 | Honest empty/unavailable states for journey and catalog | low — informational | ad-hoc | render and record; no fixture data may appear |
| URS-PROJ-008 | Enforce the launch boundary | medium — an out-of-scope surface reachable in production would expose unvalidated functions | scripted | payload verdicts plus deep-link gate |
| URS-PROJ-009 | Refuse foreign/unknown program ids | high — cross-tenant read | scripted | negative test; full RLS under D3 |
| URS-PROJ-010 | Enter every sign-in attempt in the organisation's audit trail | high — without it an attack on an account, or a session opened on it, leaves no record an inspector can read (§11.10(e)); F-19 showed the trail empty under RLS while every other check passed | scripted | the attempts made by the step itself, read back on the ledger in order, hash-chained, with the server's chain verdict |
| URS-PROJ-011 | End the session when its user signs out | high — a session that survives sign-out stays usable by whoever holds its token, on a shared machine or from a copied header, for up to 24 hours, and everything done with it is attributed to the user who signed out (§11.10(d)); F-21 showed logout answering success while ending nothing, and no step checked | scripted | a session opened by the step itself, refused by the API and the session check once it is signed out, and the sign-out read back on the ledger, hash-chained |
| URS-PROJ-012 | Refuse an account taken out of use | high — suspension and deprovisioning are how an organisation recalls a person's access (§11.10(d), §11.300(b)); F-28 and F-29 showed that neither changed anything the person could observe: the account signed in, signed, and kept every session it held, so offboarding in the identity provider revoked nothing | scripted, credentialed (a platform administrator); automated on real PostgreSQL for what the OQ run cannot reach | a dedicated account suspended through the product's own route, then refused by the API, the session check and sign-in, the refusal read back on the ledger, hash-chained, and the account restored; `tests/db/account-standing.dbtest.ts` for signing, the challenge, the refresh token, the per-router gate and SCIM's deprovisioning, each shown to catch its own removal |
| URS-PROJ-013 | End a session left alone; end every session at 12 hours | high — an unattended workstation, or a token that sits unused, is how a session becomes someone else's (§11.10(d); Annex 11 §12.4; HIPAA §164.312(a)(2)(iii)); until P1-1 nothing measured inactivity and a refresh renewed any session | scripted, credentialed or development (the step sets the organisation's window to one minute, so the run identity must be an organisation administrator); automated on both authenticators, the verifier and the refresh (`server/middleware/__tests__/auth-inactivity-logoff.test.ts`, `server/routes/__tests__/auth-refresh-inactivity.test.ts`, `server/services/__tests__/session-inactivity.test.ts`) | a session of the step's own, left alone past a one-minute window, refused by the API and the refresh with SESSION_IDLE and reported signed out by the session check, while the run's own session, in use, keeps reading; the window restored |
| URS-VAULT-001 | Gate vault endpoints | high | scripted | Part 11 §11.10(d) |
| URS-VAULT-002 | Ingest a document with a recorded SHA-256 | high — the hash is the identity of the evidence | scripted | hash recomputed locally and compared |
| URS-VAULT-003 | Refuse disallowed file types | medium — a refused upload is visible; an accepted executable is a security defect | scripted | negative test with `.exe` |
| URS-VAULT-004 | Honest read model of the data room | medium | scripted | documentCount and tree membership |
| URS-VAULT-005 | Search by title | low | scripted | cheap to script; one positive query |
| URS-VAULT-006 | Return bytes unchanged | high — ALCOA "original" | scripted | byte-level SHA-256 comparison |
| URS-VAULT-007 | Human-confirmed filing decision, audited, modality-guarded | high — a wrong placement lands the document in the wrong CTD slot | scripted | positive placement and cross-modality negative |
| URS-VAULT-008 | Chained audit of ingest/filing; chain verifies; ledger surface shows it | high — Part 11 §11.10(e) | scripted | chain verifier and ledger read model |
| URS-VAULT-009 | Render the data room | medium | unscripted | screenshot; observed state recorded |
| URS-VAULT-010 | Refuse foreign program ids | high | scripted | negative test |
| URS-VAULT-011 | Version check-in: server-assigned version, kept code and filing, a validated predecessor link | high — a wrong link or number misstates which bytes a filing used | scripted | positive check-in, known-bytes and stale-head negatives; database refusals in `tests/db/vault-version-checkin.dbtest.ts` |
| URS-VAULT-012 | One entry per document at its current version; every version listed, hash-verified on download, and in the document's history; search shows current versions unless asked | high — a superseded version shown as current, or a version missing from the list or history, puts the wrong bytes in a filing or hides who changed what | scripted | tree, versions, download, history and search checks; the legacy-link, cross-tenant and check-in agreement cases in `tests/db/vault-versions.dbtest.ts` |
| URS-VAULT-013 | Review and approval of a Vault version: e-signatures bound to the version's bytes, separation of duties, only the current version approved, supersession in the same transaction, approved details frozen | high: an approval over other bytes, a self-approval, or two approved versions of one document misstates what was approved for a filing | scripted (credentialed) | OQ-VAULT-13/14. The refusals, supersession, rollback and the start's audit row are in `tests/db/vault-lifecycle.dbtest.ts`, on PostgreSQL with RLS on |
| URS-VAULT-014 | File captured sources from the data room through the governed ingest, with a result for each | high: changed bytes filed under a capture's name, a source filed into the wrong project, or a partial batch read as done would put the wrong evidence in the Vault | scripted | OQ-VAULT-15. The byte-check, antivirus, cross-tenant, cross-project, superseded and viewer cases are in `tests/db/vault-data-room-file.dbtest.ts`, on PostgreSQL with RLS on |
| URS-VAULT-015 | Confirm suggested filings together with one required reason, each with its own audit row; a filing changed since the list was loaded is refused | high: a confirmation without a reason, or one that lands on a placement the person did not see, puts a machine's guess in the dossier under a person's name | scripted | OQ-VAULT-16. The reason, conflict, viewer and count cases are in `tests/db/vault-placement-batch.dbtest.ts`, on PostgreSQL with RLS on |
| URS-VAULT-016 | Compare two versions of one document: bytes, details and text | medium: a comparison that hides a change, or shows two documents as versions of one, misleads a reviewer, but changes no record | scripted | OQ-VAULT-17. The family, tenancy, missing-text and refusal cases are in `tests/db/vault-version-compare.dbtest.ts`; the caps and the edit budget in `server/services/vault/__tests__/vault-version-compare.test.ts` |
| URS-VAULT-017 | Search every project of the organisation at once | medium: the risk is disclosure across tenants, which RLS and the statement's own organisation predicate each prevent; a missed hit misleads but changes no record | scripted | OQ-VAULT-18. The cross-tenant, version and empty-query cases are in `tests/db/vault-library-search.dbtest.ts`, and the predicate itself in `server/services/vault/__tests__/vault-search.test.ts` |
| URS-VAULT-018 | Re-prove every stored version against its recorded SHA-256, each verdict chained | high: undetected alteration or loss of a stored record defeats ALCOA "original"; a check that called a changed file intact would be worse than none | scripted | OQ-VAULT-19 on an untampered installation. The altered and missing cases, with real files changed on disk, and the chained verdicts are in `tests/db/vault-fixity.dbtest.ts`; unreadable, unverifiable and the batch limit in `server/services/vault/__tests__/vault-fixity.test.ts` |
| URS-VAULT-019 | Relate one Vault version to another, remove a relationship with a reason, each change chained on both documents | medium: a relationship is context a reviewer follows, not the record itself, so a wrong one misleads but alters no document; a relationship that changed or vanished silently, or reached another organisation's document, would be a data-integrity and confidentiality failure | scripted | OQ-VAULT-20. The refusals (self, same document, duplicate, unknown kind, another organisation's document or project, a viewer), the table's refusal of every other change, DELETE and TRUNCATE for every role, row security, and the tenant purge are in `tests/db/vault-document-relationships.dbtest.ts` |
| URS-VAULT-020 | List the live submission leaves that carry each Vault version | medium: a read that informs a revision (replace, not new), and transmits nothing. A placement left off could lead to a wrong lifecycle operation in the next sequence; another organisation's placement shown would be a confidentiality failure | scripted | OQ-VAULT-21. The removed leaf and removed sequence, another organisation's leaf, and the read's organisation filter with row security bypassed are in `tests/db/vault-where-used.dbtest.ts`, with the eSTAR exports written by both real export writers: the registry and the unplaced audit row, a record naming no source (not inferred), and another organisation's record |
| URS-VAULT-021 | Annotate a Vault version; reply; resolve with a note or retract with a reason; read its text to quote a passage | high: a change request that silently vanished, was reworded or was attributed to the wrong person, a quote that drifted from the text it named, a program DELETE that erased the review record, an unrecorded disclosure of document text, or a cross-tenant read, would each misstate the review record | scripted | OQ-VAULT-22. The record's own guards (posted open and checked in SQL, frozen words and anchor, write-once outcome, author-only retraction, DELETE only by the owner once the version is gone, proven against the trigger-depth bypass and the program cascade, no TRUNCATE), the purge, the history window and 15 mutants are in `tests/db/vault-version-annotations-record.dbtest.ts`; the flows, code-point anchoring and roles in `tests/db/vault-version-annotations.dbtest.ts`. Accepted: a page anchor is checked against the page count only (a passage carries no page); re-anchoring after a text change is not attempted, it is shown as stale |
| URS-AUTH-001 | Gate authoring; identity from JWT only | high | scripted | anonymous negative; identity rule is code-reviewed and exercised implicitly by every write |
| URS-AUTH-002 | Create a document with validated inputs | medium | scripted | one negative, one positive |
| URS-AUTH-003 | Sections in filing order | medium — wrong order assembles a wrong dossier, visible at review | scripted | order and structure issues read back |
| URS-AUTH-004 | Revisions with reason; no silent overwrite | high — a lost edit or silent overwrite is a data-integrity failure | scripted | edit, history, stale-save 409 |
| URS-AUTH-005 | Revision hash chain verifies | high | scripted | server recomputation |
| URS-AUTH-006 | Revert is itself recorded | medium | scripted | content restored and history grows |
| URS-AUTH-007 | Comments attributed | low | scripted | trivially scriptable |
| URS-AUTH-008 | Document audit trail complete | high — §11.10(e) | scripted | events, actors, hashes |
| URS-AUTH-009 | Freeze into an immutable, hash-verified snapshot | high — §11.70 record binding | scripted | freeze, retrieve, second freeze refused |
| URS-AUTH-010 | E-signature re-verified by the platform ceremony (password, enrolled second factor, lockout) with meaning and intent; refusals; binding to the frozen snapshot | high — §11.50/§11.70/§11.200/§11.300 | scripted | PIN refused and PIN route absent; wrong password, missing code, wrong meaning refused with nothing stored; valid signature listed with its verified method and covered hash |
| URS-AUTH-011 | Signing authority by role | high — §11.10(g) | scripted (positive only locally) | negative case needs a second identity on staging |
| URS-AUTH-012 | AI drafting fails closed without a provider; governed candidate with one | high — fabricated content in a filing | scripted (fail-closed) / deviation (drafting) | provider absent locally; drafting re-executed with a PQ-passed model |
| URS-AUTH-013 | Review request, workflow submit, reviewer visibility, decision with meaning | medium | scripted | request, submit negatives/positive, board visibility |
| URS-AUTH-014 | Template stores answer | low | ad-hoc | two GETs |
| URS-AUTH-015 | Render authoring and review surfaces | medium | unscripted | screenshots |
| URS-SUBC-001 | Gate submissions behind the author role | high | scripted | anonymous negative |
| URS-SUBC-002 | Validated submission creation, audited | high | scripted | region negative, positive with audit outcome |
| URS-SUBC-003 | Sequence creation | high — the sequence is what is transmitted | scripted | create and list |
| URS-SUBC-004 | Leaf placement with a closed source vocabulary | high — a leaf pointing at an un-resolvable source cannot be assembled | scripted | positive placement and refused table |
| URS-SUBC-005 | Lifecycle state machine | high — an illegal transition could dispatch an unvalidated sequence | scripted | allowed and disallowed transitions |
| URS-SUBC-006 | Freeze/dispatch only via governed e-signature | high | scripted | generic transition refused; freeze without signature refused |
| URS-SUBC-007 | Re-authenticated sign with ledger + `electronic_signatures` in one transaction | high — §11.200 | scripted (negative) / deviation (positive) | the positive case requires a password the runner does not hold |
| URS-SUBC-008 | Honest gateway capabilities | medium | scripted | all `configured:false` locally |
| URS-SUBC-009 | Dossier map for the open program | medium | scripted | id-space consistency between shell and route is the risk |
| URS-SUBC-010 | eCTD compile answers or refuses, never 500 | medium | unscripted | observation of compile and status |
| URS-SUBC-011 | Render submission surfaces | medium | unscripted | screenshots |
| URS-SUBC-012 | Transmit never fabricates an acknowledgement | high | scripted (negative) | signature-less transmit refused; real transport under D7 |
| URS-SRDY-001 | Gate readiness endpoints | high | scripted | anonymous negative |
| URS-SRDY-002 | Deterministic dispatch gate with blockers | high — a false "cleared" dispatches an unready sequence | scripted | fresh sequence must be blocked with reasons |
| URS-SRDY-003 | Dispatch QC uses server assessment; no model in the decision | high | scripted | client zeros vs server assessment; provider absence exposes any model dependency |
| URS-SRDY-004 | Readiness review template registered; input validation | medium | scripted | template inventory, missing projectId |
| URS-SRDY-005 | Readiness review executes, is readable, and states what it read | high — a review that completes on reads that failed tells a regulatory lead "No critical issues found" about a program nobody examined, and nothing on the record shows it (F-23) | scripted | a program id the engine cannot read must be refused or fail with the reason; an anchored project must be assessed and named |
| URS-SRDY-006 | Contradiction scan reads the project it names, or refuses | high — a clean scan of a project nothing was read from is read by Authoring's preflights as "no blocking contradictions", and nothing on the record shows it (F-25) | scripted | the program id and a project the organisation does not hold must be refused; an anchored project must be scanned |
| URS-SRDY-007 | Surface shows the open program's sequence | high — gating the wrong sequence misleads a dispatch decision | scripted | sequence number visible for the open program |
| URS-SRDY-008 | Keep the Orchestration and Inconsistency boards out of the release | medium — an out-of-scope board reachable in production shows users a board that cannot see their programs | scripted | payload verdicts plus both deep-link gates |
| URS-QMS-001 | Gate QMS endpoints | high | scripted | anonymous negative |
| URS-QMS-002 | Validated, unique, audited document creation | high | scripted | 422, 201 with audit outcome, 409 duplicate |
| URS-QMS-003 | Draft v1.0, listed, readable, tenant-scoped | medium | scripted | list and detail |
| URS-QMS-004 | Approval stamps approver/time, audited, state-guarded | high | scripted | approve, re-approve refused |
| URS-QMS-005 | Approval is an electronic signature (credential + meaning) | high — §11.50/§11.200: an SOP made binding without a verified signer | scripted (negative) | approve with no credential must be refused |
| URS-QMS-006 | Revision requires reason; major bump; back to draft | high | scripted | 422 then positive |
| URS-QMS-007 | Retire with reason | medium | scripted | positive |
| URS-QMS-008 | Training acknowledgement against version | medium | scripted | positive plus compliance report |
| URS-QMS-009 | Review-due report | low | scripted | positive |
| URS-QMS-010 | Change control raise/list/summary | medium | scripted | positive create and list |
| URS-QMS-011 | QMP create/list | low | scripted | positive |
| URS-QMS-012 | Render Quality and QMP surfaces | medium | unscripted | screenshots with the created records visible |
| URS-QMS-013 | Templates served | low | ad-hoc | one GET |

## 3. Residual risks carried into VSR-001

- Tenant isolation at the database layer (RLS on a non-superuser role) is not assessed here — row D3.
- Model behaviour (drafting quality, groundedness) is not assessed here — the launch apps are qualified for failing closed without a provider; PQ of an approved model is a separate exercise per CLAUDE.md Rule 2.
- Real agency transport is not assessed here — row D7.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
