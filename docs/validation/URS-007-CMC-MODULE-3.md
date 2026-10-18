# URS-007 — User Requirements Specification: CMC / Module 3

| Field | Value |
|---|---|
| Document ID | URS-007 |
| Version | 0.4 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 |
| Verified by | OQ-008 — **owed**: neither the protocol nor its runner exists yet. `ci:validation-traceability` refuses a protocol that names no runner, which is why no OQ-008 document is filed ahead of one. Decision P-28 states that CMC is not described as validated until OQ-008 executes in the W3 posture beside IQ-001 and OQ-001…007, with a named expert's signature on the reference-record verification. |

**App:** CMC / Module 3 (the eighth launch app, decision P-28, 2026-10-12)

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-10-12 | Claude | Drafted from the shipped code as the catalog flip landed: the register writers, the one compile, the contradiction lifecycle, the final-export gate, the placement path and the composition boundary. |
| 0.4 | 2026-10-18 | Claude | URS-CMC-023 added: the signing ceremony generalised to every register that has a signed state. Four registers — analytical methods, process validation, QC testing and comparability — had the signature columns and no signature: the status word, the signer and the date were all request-body fields (`docs/evidence/CMC-M3-GA/2026-10-18/05-ungoverned-signed-states/`). |
| 0.3 | 2026-10-18 | Claude | URS-CMC-022 added: a section approval is independent of whoever entered the records it cites, and an authorship meaning is refused (`docs/evidence/CMC-M3-GA/2026-10-18/03-section-approval-four-eyes/`). |
| 0.2 | 2026-10-18 | Claude | URS-CMC-021 added: the §11.10(e) operator on every register create, written on the row's own transaction, with one insert path per register (`docs/evidence/CMC-M3-GA/2026-10-18/02-register-create-attribution/`). |

## 1. Intended use

CMC / Module 3 is where a sponsor keeps the chemistry, manufacturing and
controls record for a programme and builds the quality module of its filing.
The registers (drug substance, drug product, analytical methods,
specifications, batch records, stability, process validation, change control,
comparability, formulation, materials, container closure, characterisation)
are the record. One deterministic compile projects that record into Module 3
sections; a contradiction sweep names what disagrees; a fail-closed export gate
holds the module until every composed section is approved under 21 CFR Part 11;
and placement writes the approved sections into the programme's own IND
sequence as leaves.

**Scope boundary.** What this app composes is **small-molecule Module 3 for a
US IND**. A biologically derived or ATMP substance, a programme recorded as
anything but a drug, a marketing application (NDA/ANDA/BLA/MAA) and a non-US
clinical-trial application (EU CTA, Health Canada CTA, Japanese CTN/J-NDA) are
**refused by name**, because the quality requirements they carry — ICH Q6B,
Q5A(R2), Q5C, the §3.2.S.4.5 / §3.2.P.5.6 justification of specification,
4-level granularity, an IMPD Quality part — are not modelled. The refusal names
Document editor & authoring, Vault (DMS) and the Submission center.

**Entitlement.** The app's surface is inside the launch boundary; the module
stays in the professional band (product owner, 2026-08-24). A launch app's
surface list lifts the launch-scope lock and never widens an entitlement
verdict.

## 2. Requirements

| URS id | Requirement | Part 11 | Risk | Source |
|---|---|---|---|---|
| URS-CMC-001 | Every `/api/cmc` endpoint requires an authenticated member of the organisation; a read-only (viewer) session is refused on every write and still served every read and every computation that saves nothing. | §11.10(d) | high | `server/middleware/orgMembership.ts` |
| URS-CMC-002 | A register write files under the open programme, is scoped to the caller's organisation, and a programme of another organisation is not found. | §11.10(d) | high | `server/services/cmc/register-writes.ts`, `server/services/cmc/project-membership.ts` |
| URS-CMC-003 | Each register write reaches Module 3 only as a canonical source object; no screen or request body writes a Module 3 section record. | none | high | `server/services/cmc-write-through.ts`, `server/services/cmc/module3-compile.ts` |
| URS-CMC-004 | Module 3 is composed by one deterministic engine from the programme's own canonical sources — core §3.2.S / §3.2.P / 3.1 / 3.3, the emittable 3.2.A appendices, and 3.2.R for the region the linked submission records. A compile of a programme with no sources is refused and says what to record. | none | high | `server/services/cmc/module3-compile.ts`, `server/services/module3Composer.ts`, `server/services/module3-extensions.ts` |
| URS-CMC-005 | Composition is refused, 409, for a biologic or ATMP substance, a programme recorded as anything but a drug, an application that is not a US IND, and a substance whose modality the record does not establish. Each refusal names the guidelines not modelled and the path that does author it. | none | high | `server/services/cmc/composition-scope.ts`, `server/services/cmc/substance-modality.ts` |
| URS-CMC-006 | A section's stored record is the compiler's own output and its completeness is the compiler's verdict; a request body cannot supply either. | §11.10(a) | high | `server/services/cmc/module3-compile.ts`, `server/api/cmc/module3OperatingSystemRoutes.ts` |
| URS-CMC-007 | A section approval is an electronic signature: it requires a role with signing authority, a stated reason of at least the governed minimum, and re-authentication of the signer; it records the signature, the version snapshot and a chained audit row, or nothing. | §11.10(e) §11.50 §11.70 | high | `server/services/part11/signing-authority-gate.ts`, `server/api/cmc/module3OperatingSystemRoutes.ts` |
| URS-CMC-008 | What the signer read is what is signed: a section recompiled since the read is refused 409, and the state change is guarded on the content hash the transaction itself read. | §11.70 | high | `server/api/cmc/module3OperatingSystemRoutes.ts` |
| URS-CMC-009 | The contradiction sweep reports what it examined, keeps a recorded resolution across sweeps, treats changed data as a new finding, and clears a finding the data no longer shows. Resolving a critical finding requires signing authority and a reason. | §11.10(e) | high | `server/services/cmc/contradiction-lifecycle.ts`, `server/services/cmc/contradiction-registers.ts` |
| URS-CMC-010 | The final-export gate refuses unless every composed section is approved, no critical contradiction is open, no approved section is stale, the provenance chain is complete, each approved section matches what the compiler established, and no critical finding in the current records is unrecorded. Each blocker is named. | none | high | `server/services/cmc/final-export-gate.ts` |
| URS-CMC-011 | Placement writes the approved sections into the programme's own US IND sequence as leaves, in one transaction, requires the regulatory-author role and a reason, is idempotent on retry, and refuses a sequence or submission that is not the programme's. | §11.10(e) | high | `server/services/cmc/place-module3-into-submission.ts` |
| URS-CMC-012 | The Module 3 version history and the provenance events are append-only in the database: the runtime role cannot update, delete or truncate them. | §11.10(c) §11.10(e) | high | `migrations/20261005c_cmc_module3_history_append_only.sql`, `server/services/audit/audit-immutability-triggers.ts` |
| URS-CMC-013 | A signed or released record is closed to an ordinary edit (409); a batch cannot be created already released, nor dispositioned twice; a release is refused over QC results that are not recorded and reviewed. | §11.10(e) | high | `server/api/cmc/routes.ts`, `server/services/cmc/register-writes.ts` |
| URS-CMC-014 | The quality engines — ICH compliance judged at the programme's stage against current revisions, QbD, control strategy, process capability, shelf-life estimation, stability trending, poolability, dissolution comparison — are deterministic, cite what they judged, and answer 404 for a programme of another organisation. | none | medium | `server/services/cmc/ich-compliance-checker.ts`, `server/services/cmc/knowledge/index.ts` |
| URS-CMC-015 | The Overview board states section approvals, the portfolio, the build state and a readiness lead taken from the gate's own verdict; a figure it cannot compute is reported as not computed, never as zero. | none | medium | `client/src/concept2cure/v2/surfaces/CmcModule.tsx`, `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx` |
| URS-CMC-016 | Only the CMC specification interview commits to a record; an interview of any other kind is refused where the launch boundary is enforced, because its answers reach no record. | none | medium | `server/services/cmc/interview-commit.ts`, `server/services/ana/AnaToolExecutor.ts` |
| URS-CMC-017 | A release signature clears a dispatch only when its signed leaf manifest is the sequence's current manifest; a signature over different content reads as no release signature for that sequence. | §11.70 | high | `server/services/ectd/signed-manifest-covers-sequence.ts`, `server/services/ectd/release-signature-status.ts` |
| URS-CMC-018 | An original US IND sequence that carries no 3.2.S and no 3.2.P, and no cross-reference with a Letter of Authorization covering them, is not dispatch-ready; the finding cites 21 CFR 312.23(a)(7) and (b) and names both ways to clear it. | none | high | `server/services/ectd/assess-dispatch-readiness.ts`, `server/services/ectd/dispatch-readiness.ts` |
| URS-CMC-019 | The CMC surface claims only the API paths its screens call; every other path under `/api/cmc` is unattributed and refused in production. | none | high | `shared/constants/ui-surface-registry.ts`, `server/services/entitlements/launch-scope-api.ts` |
| URS-CMC-020 | A submission package carries a programme's Module 3 only when that programme's export gate is open; the orchestrator composes none from unapproved records, and inline CMC data in a request is refused outside development. | none | high | `server/services/cmc/load-approved-cmc-sources-for-project.ts`, `server/routes/submission-orchestrator.ts` |
| URS-CMC-021 | Every register create records the person who recorded it, on the tenant's audit chain, in the same transaction as the row: a create that names no operator writes nothing, and no register row is created by any other path. | §11.10(e) | high | `server/services/cmc/register-audit.ts`, `server/services/cmc/register-writes.ts`, `server/api/cmc/routes.ts` |
| URS-CMC-022 | A section approval is independent of the people who entered the records the section was composed from: the operator of a cited record cannot approve it, a cited record with no recorded operator refuses the approval and is named, and an authorship-meaning signature is not accepted at all. A failed check refuses; it never reads as no conflict. | §11.10(g) §11.50(a)(3) | high | `server/services/cmc/register-operators.ts`, `server/services/governance/separation-of-duties.ts`, `server/api/cmc/module3OperatingSystemRoutes.ts` |
| URS-CMC-023 | A register's signed state — a method *validated*, a process-validation record or a comparability assessment *approved*, a QC result *reviewed* — is reached only under a signature with a reason and re-authentication, never by a create or an ordinary edit, and the record names the person who signed it. A record already in that state is closed to content edits and is retired rather than reversed. The signature is refused when the thing it would accept is not recorded. | §11.10(a) §11.50 §11.70 §11.200 | high | `server/services/cmc/signed-record.ts`, `server/services/cmc/register-writes.ts`, `server/api/cmc/routes.ts`, `client/src/concept2cure/v2/surfaces/cmcRegisterForms.ts` |

## 3. Assumptions and constraints

- **The module is professional-band.** A standard-tier organisation holds it
  only through an explicit grant; the 2026-08-24 migration granted every
  organisation entitled at that time.
- **Composition is small-molecule US IND only** (URS-CMC-005). Biologics,
  marketing applications and non-US clinical-trial applications are out of
  scope for this release and refused, not partially served.
- **Placement is not one transaction with the sequence build.** The placement
  itself is atomic; the eCTD build that follows is a separate governed act.
- **A 4-level section granularity, a repeating `m3-2-p` per product and a
  QOS-CE are post-GA**, and depend on the packager's F00/F02 heading
  attributes (row D7).
- **"Fileable, DTD-valid eCTD Module 3 sequence" is not claimed** until D7
  lands (decision P-28).
- **A section approval is independent of the data entry** (URS-CMC-022,
  2026-10-18). The approver may not be one of the operators the chain records
  for the registers the section cites, and a cited record entered before the
  platform recorded its operator (2026-10-18) refuses the approval by name
  rather than passing as "no conflict". The specification, batch-release and
  register-qualification signatures have their own authority gates; four-eyes
  against the data entry is claimed for the Module 3 section approval only.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
