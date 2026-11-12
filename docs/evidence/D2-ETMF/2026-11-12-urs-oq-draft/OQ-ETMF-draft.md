# OQ-0?? (proposed OQ-009): Operational Qualification protocol, the trial master file in the Vault

| Field | Value |
|---|---|
| Document ID | **Not assigned.** Proposed: OQ-009. `docs/validation/**` and `tests/validation/**` are held by Validation for GA (`01QoxbLcnW…`), which numbers, files and implements it. |
| Version | 0.1 |
| Status | **DRAFT, UNSIGNED, NOT EXECUTED, NO RUNNER.** Written by the Vault parity lane for Validation to adopt. |
| Parent | VMP-001 §5; requirements: the URS drafted beside this file (proposed URS-009) |
| Runner (the executable protocol) | **Owed:** proposed `tests/validation/oq/etmf/run.mjs`, on the model of `tests/validation/oq/cmc/` and `oq/vault/`. `ci:validation-traceability` refuses a protocol that names no runner, which is why this is not filed in `docs/validation/`. |
| Record | `docs/evidence/W3/<date>/OQ-ETMF/` (generated on execution; does not exist) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-11-12 | Claude (Vault parity lane, `…01KnUGoX3g`) | First protocol, drawn from the shipped behaviour after eTMF E4. Each step's expected result, except OQ-ETMF-36 and -37 (the launch boundary, before and after admission), is one a development suite already observes (named in the URS draft). None has been executed under the W3 posture. |

## 1. Method

As OQ-001 §1 and OQ-008 §1, with these identities:

- **The run identity**, an organisation admin. It authors the reference records and holds the regulatory-author role
  and the Vault's write role on the project.
- **`OQ_MEMBER`**, a member of the same organisation who is **not** shared on the project under test.
- **`OQ_VIEWER`**, a read-only identity on the project.
- **A second organisation's admin** (`OQ_FOREIGN`), for the tenant steps.
- **`DATABASE_URL_RUNTIME`**, the non-owner runtime role, so the database's refusals are observed from the connection
  that is actually refused.

The posture: RLS enforcing, a non-owner runtime role, launch scope enforced, and unattributed API paths refused
(`LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`).

**The reference project.** It is created by the runner:
- a project with one Protocol Development study (`POST /api/study-design`, which lists the study's `studyId`);
- three live Vault documents in the project: a protocol, an investigator's brochure and a monitoring plan;
- one live document in a **second** project of the same organisation.

The study's id is the `:trialId` of every route below.

A step whose identity is absent is recorded as a deviation, *not executed: credential not supplied*. Every step that
depends on it is recorded as not executed.

## 2. Steps

| Step | URS | Kind | Action | Expected result |
|---|---|---|---|---|
| OQ-ETMF-01 | URS-ETMF-001 | scripted | `GET /api/etmf/trials/:trialId/completeness` with no session | 401 |
| OQ-ETMF-02 | URS-ETMF-001 | scripted | as `OQ_VIEWER`: the completeness read, then a filing | 403 on each; no row written |
| OQ-ETMF-03 | URS-ETMF-002 | prerequisite | create the reference project, its study and its documents (§1) | each 201; the study is listed by `GET /api/study-design` for the project |
| OQ-ETMF-04 | URS-ETMF-002 | scripted | as `OQ_MEMBER` (not shared on the project): read and file against the study | 404 `STUDY_NOT_FOUND` on each; nothing read or written |
| OQ-ETMF-05 | URS-ETMF-002 | scripted | every route, with a `:trialId` that is no study | 404 `STUDY_NOT_FOUND` on each; nothing written |
| OQ-ETMF-06 | URS-ETMF-003 | scripted | as `OQ_FOREIGN`: read the study, and `DELETE /api/etmf/artifacts/:id` of a filing made in OQ-ETMF-08 | 404 on each; the filing stands |
| OQ-ETMF-07 | URS-ETMF-005 | scripted | file `protocol` against the protocol document: with no reason, then a 7-character reason | 400 `REASON_REQUIRED` on each; no filing and no audit row |
| OQ-ETMF-08 | URS-ETMF-005, -013 | scripted | file `protocol` against the protocol document, with a reason | 201; the filing names the study and the document; one `TMF_ARTIFACT_FILED` audit row on the organisation's chain, naming both, with the reason |
| OQ-ETMF-09 | URS-ETMF-005 | scripted | file `protocol` again, against the investigator's brochure document, with a reason | the same row now names the new document; its audit row names the document it replaced |
| OQ-ETMF-10 | URS-ETMF-006 | scripted | file a record against: the second project's document; an id that is no document; `vault://<trialId>/<code>` | 409 `DOCUMENT_NOT_IN_PROJECT` for the first two; the path refused, naming its shape; nothing written |
| OQ-ETMF-11 | URS-ETMF-007 | scripted | `POST .../artifacts/bulk`: one valid item, one unknown code, one with the second project's document | each item reported; only the valid item filed, with its own audit row |
| OQ-ETMF-12 | URS-ETMF-008 | scripted | `DELETE /api/etmf/artifacts/:id` of the filing with no reason | 400; the filing stands |
| OQ-ETMF-13 | URS-ETMF-008, -013 | scripted | remove it with a reason; list the study's filings; remove it again | 204; it is not listed; the row (read as the runtime role) carries who, when and why; one `TMF_ARTIFACT_REMOVED` row; the second removal 404 |
| OQ-ETMF-14 | URS-ETMF-008 | db | as the runtime role: set the row's removal with no reason, rolled back | refused by the database |
| OQ-ETMF-15 | URS-ETMF-008 | scripted | file the removed record again | the same row, live; its audit row names the removal it cleared |
| OQ-ETMF-16 | URS-ETMF-009 | scripted | declare `monitoring_plan` not applicable: with no reason; with a document named | 400 on each; nothing written |
| OQ-ETMF-17 | URS-ETMF-009, -013 | scripted | declare it with a reason; read completeness | 201; who, when and why on the row; one `TMF_ARTIFACT_DECLARED_NOT_APPLICABLE` row; `summary.totalNotApplicable` 1, and it is in neither the present nor the missing list |
| OQ-ETMF-18 | URS-ETMF-009 | scripted | declare the filed `protocol` record not applicable | 409 `RECORD_FILED`; the filing stands |
| OQ-ETMF-19 | URS-ETMF-009 | db | as the runtime role: write a declaration that names a document, rolled back | refused by the database |
| OQ-ETMF-20 | URS-ETMF-009 | scripted | withdraw the declaration with a reason; then declare it again and file the monitoring plan document against it | the record is required again; then the filing ends the declaration on the same row, and its audit row says so |
| OQ-ETMF-21 | URS-ETMF-010 | scripted | read completeness, essential scope, with three essential records filed against live documents | `ready: false`; those three present; every other essential record missing and named; no percentage anywhere in the answer |
| OQ-ETMF-22 | URS-ETMF-010 | db | as the owner role: mark the filed protocol document no longer live (`deleted_at` set), read completeness, then restore it. No launch screen deletes a Vault document today, so the state is set directly, as `tests/db/etmf-study-binding.dbtest.ts` does | while it is not live: `protocol` is not present, its evidence is not `verified`, and it is named among the missing; restored, it is present again |
| OQ-ETMF-23 | URS-ETMF-010 | scripted | with a second study: declare every essential record not applicable, with a reason each; read completeness | `ready: null`, `totalRequired` 0, `totalNotApplicable` 26; the package cover reads "NO VERDICT" |
| OQ-ETMF-24 | URS-ETMF-010 | scripted | read completeness at `scope=all` | every record of the reference model is required |
| OQ-ETMF-25 | URS-ETMF-011 | scripted | list the filings; add a new version to a filed document; list again | each filing names its document's title, version and review stage; after the new version, the filed version reads as not current |
| OQ-ETMF-26 | URS-ETMF-012, -013 | scripted | `GET .../inspection-package` | 200, a ZIP of the four members; its SHA-256 equals the `X-TMF-SHA256` header and the `EXPORT_GENERATED` audit row's; the manifest names the study; the index lists only this study's filings and the declaration with its reason |
| OQ-ETMF-27 | URS-ETMF-012 | scripted | the same download, twice, with nothing changed | the members' content is the same, in the same order (the generation time aside) |
| OQ-ETMF-28 | URS-ETMF-013 | scripted | verify the organisation's audit chain after OQ-ETMF-08 to -26 | intact |
| OQ-ETMF-29 | URS-ETMF-014 | AnA | ask AnA to file a document as "Protocol and amendments" (the catalog name), as "protocol" (the code), and as "quarterly-board-deck.pdf" | the first two name the `protocol` record and ask for confirmation; the third is refused as no record of the reference model, AnA asks which record is meant, and nothing is filed |
| OQ-ETMF-30 | URS-ETMF-015 | AnA | in the project's conversation: "Which gaps in this study's trial master file would an inspector raise?" | AnA calls `get_tmf_view` for the study; its answer states the store's readiness in words and its counts, with no percentage |
| OQ-ETMF-31 | URS-ETMF-015 | AnA | ask AnA to file the IB document as the study's "Investigator's Brochure" record (`investigators_brochure`); confirm with a reason | a confirmation is asked before anything is written; after it, the filing and its audit row exist as in OQ-ETMF-08 |
| OQ-ETMF-32 | URS-ETMF-016 | AnA | as `OQ_MEMBER`: ask AnA to search documents for "protocol" | no hit from the reference project's trial master file |
| OQ-ETMF-33 | URS-ETMF-017 | scripted | run `etmf.completeness_pack` at project scope, as the run identity | each figure equals the completeness read of the same study at the same moment |
| OQ-ETMF-34 | URS-ETMF-018 | scripted | `GET /api/etmf/files` and `/api/etmf/files/1/artifacts` (the retired store's paths) | 404 each |
| OQ-ETMF-35 | URS-ETMF-019 | ui | in the running app: open the project, the Vault, then Trial master file; file a record with upload-and-file, giving a reason; declare one not applicable; download the package | each act shown as done, with the verdict and figures re-read; screenshots filed |
| OQ-ETMF-36 | URS-ETMF-020 | scripted | **before admission**, with launch scope enforced: `GET /api/etmf/reference-model` | refused by the launch boundary |
| OQ-ETMF-37 | URS-ETMF-020 | scripted | **after admission**: the same read for a professional-tier organisation, then for a standard-tier organisation with no grant | served; then refused by the entitlement |

The AnA steps (OQ-ETMF-29 to -32) need a model approved for the run (RULE 2, the approved-models register). Where
none is configured, each is a deviation, *not executed: model not configured*. The tools' mapping is unit-tested
(URS draft, URS-ETMF-015).

## 3. What is owed before this protocol is filed

1. **Its number and its URS's number**, from Validation for GA.
2. **The runner**: `tests/validation/oq/etmf/`, with each step's kind declared as this table does.
3. **Execution** under the posture in §1, at one commit with IQ-001 and OQ-001…008, and the record filed under
   `docs/evidence/W3/<date>/OQ-ETMF/`.
4. **TM-001 regenerated** from that execution, and VSR-001 amended.
5. **The founder's answer** on URS draft §3, first item: whether a read-only identity may read a trial master file.
   OQ-ETMF-02 observes today's behaviour (refused); it changes only if that answer does.

Steps OQ-ETMF-36 and -37 straddle admission: -36 runs before the held change is applied, and -37 after it.

## Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner (founder) | | *unsigned* | |
| Qualified validation contractor | | *unsigned* | |
