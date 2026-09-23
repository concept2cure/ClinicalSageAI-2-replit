# RA-001 — Risk Assessment and CSA assurance selection

| Field | Value |
|---|---|
| Document ID | RA-001 |
| Version | 0.3 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §3 |
| Method | FDA CSA (Sept 2025 final; Feb 2026 update): identify intended use → determine risk (process risk and whether the feature can cause a quality/patient/data-integrity failure) → choose the least-burdensome assurance activity that gives confidence → record the result. Risk levels and activities are defined in VMP-001 §3.1. |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | One row per URS requirement; assurance chosen per CSA. |
| 0.2 | 2026-09-23 | W3 | URS-PROJ-010 (the sign-in audit trail) assessed: high, scripted (VSR-001 §13, F-19). |
| 0.3 | 2026-09-23 | W3 | URS-PROJ-011 (signing out ends the session) assessed: high, scripted (VSR-001 §13.9, F-21). |

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
| URS-AUTH-001 | Gate authoring; identity from JWT only | high | scripted | anonymous negative; identity rule is code-reviewed and exercised implicitly by every write |
| URS-AUTH-002 | Create a document with validated inputs | medium | scripted | one negative, one positive |
| URS-AUTH-003 | Sections in filing order | medium — wrong order assembles a wrong dossier, visible at review | scripted | order and structure issues read back |
| URS-AUTH-004 | Revisions with reason; no silent overwrite | high — a lost edit or silent overwrite is a data-integrity failure | scripted | edit, history, stale-save 409 |
| URS-AUTH-005 | Revision hash chain verifies | high | scripted | server recomputation |
| URS-AUTH-006 | Revert is itself recorded | medium | scripted | content restored and history grows |
| URS-AUTH-007 | Comments attributed | low | scripted | trivially scriptable |
| URS-AUTH-008 | Document audit trail complete | high — §11.10(e) | scripted | events, actors, hashes |
| URS-AUTH-009 | Freeze into an immutable, hash-verified snapshot | high — §11.70 record binding | scripted | freeze, retrieve, second freeze refused |
| URS-AUTH-010 | PIN-based e-signature with meaning and intent; refusals; binding to the frozen snapshot | high — §11.50/§11.70/§11.200 | scripted | wrong PIN, wrong meaning, valid signature listed with `pin_verified` and covered hash |
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
| URS-SRDY-005 | Readiness review executes and is readable | medium | unscripted | execution observed and recorded |
| URS-SRDY-006 | Contradiction scan deterministic | medium | scripted | one scan call |
| URS-SRDY-007 | Surface shows the open program's sequence | high — gating the wrong sequence misleads a dispatch decision | scripted | sequence number visible for the open program |
| URS-SRDY-008 | Orchestration / Inconsistency render honestly | low | ad-hoc | screenshots |
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
