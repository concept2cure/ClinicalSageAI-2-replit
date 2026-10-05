# Product decisions for the regulatory record (2026-10-05)

The plan in [`docs/design/ANA_REGULATORY_RECORD.md`](../../../design/ANA_REGULATORY_RECORD.md)
named 26 questions for the founder. The product owner answered them all at once
on 2026-10-05: *"Yea too all… make the best choice for our niche client base."*
This lane, acting as product manager, decided them as follows.

**The clients.** Small and mid-size biotech, medtech and diagnostics sponsors.
They file first with FDA, then with EU notified bodies and EMA, then with PMDA.
Few have a regulatory-operations department, so a wrong answer or a false
"ready" reaches an agency before anyone catches it.

**Principles.**
1. Fail closed. A clear "not checked" or "not indexed" is better than a
   confident wrong answer.
2. CLAUDE.md binds:
   - Rule 1: data reaches a deployed database only through migrations.
   - Rule 2: no new external integration, surface or model before launch.
   - Nothing user-facing is removed without its replacement named by path.
3. The owner's scope: FDA, EU and Japan, for medicines, devices and
   diagnostics.

## Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Name of the one acceptance-rules tool | **`list_validation_rules`** survives. It is extended to every jurisdiction and absorbs `list_fda_technical_rules`, which is deleted in the same change, with no alias. The persona and routing pins move with it. | One registry and one tool. The neutral name fits FDA, EU and Japan. Replacement by path: `server/services/ectd/validation-rule-corpus.ts` through `list_validation_rules`. |
| 2 | How corrected seed templates reach deployed databases | **A Rule-1 migration.** It writes a new version row and deprecates the old one in the same file. The boot seeder never writes. | Rule 1 names migrations as the only deployed seed path. |
| 3 | maa:ema mandatory flags and whether to mint v2.2 | **Not minted yet.** The deltas are recorded as expected in the parity test until the EU M1 v3.1.1 text is read. | No rule pack is minted from text nobody has read. |
| 4 | Device acceptance outcomes (eSTAR, PMA, CTIS, Shōnin) | **Pathway-engine rows in `RULE_CORPUS`**, each pointing at its engine. | One corpus. The engines keep their verdicts. |
| 5 | The Japanese post-lock chain | **Regional nodes labelled recall, with transmission failing closed.** | Clients get the sequence. Nothing is sent on unread rules. |
| 6 | Persisted data with wrong codes (projects, documents, Vault rows, templates, stored classifications) | **Detect and surface; never rewrite silently.** Readiness and drift checks name each affected row. Correcting existing customer records is a governed data change, done per tenant with an audit trail, and is not done in this round. | Part 11: a sponsor's record is not changed behind their back. |
| 7 | Primary texts (ICH M11, IVDR Annex II §6, QRD v10.4, PMDA/MHLW notices, eCTD v3.2.2 DTDs, eSTAR 7.1) | **Kept as recall or blocked until read.** Each owed read is listed. | The regulator hosts are blocked in this environment, and the Lawstronaut connector needs re-authorisation. |
| 8 | Retire `/api/ind-generation` | **Not yet.** It fails closed now (`g-ind-generation-route-fails-closed`). Retirement waits until Authoring's section generation is shown reachable for every caller. | A deletion needs its reachable replacement by path. |
| 9 | Module 1 for CA, UK, CH, AU | **Kept `not_indexed`, with the sources owed.** | Outside the owner's scope of US, EU and JP. A clear "not modelled" never borrows another regulator's tree. |
| 10 | New integrations (EMA AS2 gateway, Japan eCTD v4.0 packager, JP STED e-application, licensed validator, EDC) | **None in this round.** AnA says plainly that centralised MAAs are build-only, that new J-NDAs are blocked at dispatch, and that external validation has not been run. | Rule 2. |
| 11 | US path-limit severities and underscores | **Error at 230; warning at 150 (180 for eCTD v4.0). Keep the strict ICH file-name set.** | The planner's recommendation, from the verified FDA guide text. |
| 12 | PDF leaf severities | **PDF version and image-only pages are errors. Bookmarks, fonts and links are warnings.** | An error on bookmarks would stop packages that carry scanned literature references. |
| 13 | Completeness prediction for types with no profile; device pathways | **Refuse to score a type with no profile. 510(k), De Novo, PMA and IVDR return `not_assessed` and point at the eSTAR or device engine.** | Fail closed. |
| 14 | Japan devices and IVDs | **Inside D2 as content and engines**, with no new surface. | The owner asked for Japan devices and diagnostics. |
| 15 | Retire `advise_ctd_structure` | **Yes**, once it and `get_document_section_requirements` read the same matcher. The replacement is named in the commit. | Zero duplication. |
| 16 | Where `applicationFiled` comes from | **Submission Center sequence state**: a transmitted sequence for the application. | That is the platform's record of filing. |
| 17 | CTIS Part II member state | **Kept in the slug.** No schema change. | The smallest correct change. |
| 18 | `US_LDT` in the filing catalog | **Kept, as a regulatory-status entry** that records the 2025 vacatur. | Removing it would remove a reachable filing type. |
| 19 | `reconcile_dossier_numbers`, `check_dossier_consistency` and a new `reconcile_clinical_dossier` | **Keep the two existing tools. Do not build `reconcile_clinical_dossier` yet.** | The cross-document clinical-figure lexicon was not shipped (see the depth README). After four adversarial review rounds, free-text extraction still produced false conflicts on correct CSR wording. Cross-document figure reconciliation will read structured outputs (TLFs and datasets) once the Vault can hold them. |
| 20 | House style for submission documents | **ICH/FDA usage** (p<0.001, 0.05). Manuscripts keep journal style. Convention rules are advisory only. | The regulator's register for regulator documents. |
| 21 | Vault dataset size | **Keep the 50 MB cap with an honest 413** that names the limit. Disk or stream ingest of multi-GB SDTM/ADaM is the next architecture step. | Honest now, and no half-built ingest. |
| 22 | `/api/conversation-os` quality/lint | **Rewired onto the writing gate**, as planned. | Nothing user-facing is removed. The parallel rules engine is deleted. |
| 23 | EU product-information labelling mode | **Not in this round.** | A new capability, and the QRD text is unread. |
| 24 | CSR as a governed document; Protocol Development on M11 | **Not in this round.** Provenance and numbering are corrected only. | Both change persisted documents. |
| 25 | PSUR cadence after COM(2025) 1023; a fact with no Official Journal date | **Current law until adoption. A proposal is stored with status `proposed`, never as in force.** | Never present a proposal as law. |
| 26 | Japanese facts known only from recall (e.g. the 2025 PMD Act) | **Shipped, labelled recall.** AnA says they are unverified against MHLW/PMDA text. | Better that clients know what changed, marked honestly, than hear nothing. |

## Changes to the plan

These follow from the decisions and the completeness critic:

- `g-reconcile-clinical-dossier` is dropped (decision 19).
- `g-m1-template-seeds` writes a migration (decision 2).
- Every step that changes persisted rows detects and reports only (decision 6).
- The critic's hazard fixes are applied:
  - B3 re-exports move to B4;
  - the inventory ratchet depends on the Module 1 move;
  - two copy-deletions no longer wait on the seed decision;
  - migration steps rebase on the CMC lane's entries in `migration-set.mjs`.
- The critic's 13 added steps are in the plan.
