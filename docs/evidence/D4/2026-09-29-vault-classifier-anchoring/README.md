# VR-04: filing proposals you can trust, vocabularies held on save, labels instead of tokens (row D4)

**Plan item:** VR-04, `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md`.
**Requirement:** URS-VAULT-007, rated high in `docs/validation/RA-001-RISK-ASSESSMENT.md`.
**Date:** 2026-09-29.

## The findings

1. **The CTD classifier matched inside words.** `/iss/` matched "Perm**iss**ion"
   and "subm**iss**ion", and `/ise/` matched "Otherw**ise**" and "prem**ise**".
   Each was proposed at 5.3.5.3 with *high* confidence. `submission.zip` was
   proposed as an Integrated Summary of Safety.
2. **The generic safety pattern ran before ISS**, and the ISS pattern could not
   match "Summary **of** Safety". So "Integrated Summary of Safety.pdf" went to
   5.3.5. "Safety Data Sheet - ethanol.pdf" (a chemical SDS) was a
   high-confidence clinical safety study. "Clinical Pharmacology report" went
   to Module 4 because the bare pharmacology pattern ran first.
3. **A module fallback invented sections.** "Item2 notes.pdf" became `2.0`,
   because `m2` matched inside "item2". "Module 3 notes" became `3.0`. A bare
   module is a container, not a section.
4. **The uploader's declared type was ignored.** A file declared as a Protocol,
   with a neutral name, landed unfiled with no kind. A declared type that
   contradicted the name was silently overridden by the name.
5. **A filing decision was not held to its vocabulary on save.** The placement
   service (`POST /:id/file`, AnA's `place_project_document`) and the ingest
   (`POST /api/vault/ingest` with a folder) stored any evidence kind and any
   section: `banana`, `nonsense`, a bare `3`. The chained audit trail recorded
   each as a person's decision.
   - Found on the way: **authoring's file-to-vault stored its module label
     `M2` as the document's CTD section.** The new check refused it, and the
     authoring suite went red. `M2` is the folder, not a section; it now sends
     none.
6. **A transient database error filed against the wrong taxonomy.**
   `resolveVaultView` caught every error and returned the service (TMF) view.
7. **The Vault showed the stored token.** The detail pane and the data-room
   tooltip read "csr", not "Clinical study report".

## The change

| Piece | File |
|---|---|
| Word-bounded patterns; specific before generic (ISS/ISE before efficacy and safety, clinical pharmacology before pharmacology); a lone safety word is medium confidence; an SDS is not CTD content; a module-only name gives the module and **no section** | `server/services/ctd-ingestion-service.ts` (`detectCTDSection`) |
| The declared type informs the proposal. It gives the kind (and the module, in a dossier view) when the name says nothing. A contradiction is flagged for review naming both, never overridden. | `server/services/vault/vault-filing.service.ts` (`classifyForFiling`, `reconcileDeclaredType`) |
| One vocabulary check, `filingVocabularyRefusal`: `VAULT_DOC_KINDS` for the kind, and `validateSectionCode(…, 'ctd')` for the section, the rule `upsertLeaf` uses | `vault-filing.service.ts`; called by `vault-placement.service.ts` (422) and `vault-ingest.service.ts` (400, before any byte is stored, when a folder is named) |
| Authoring files its draft into the module folder without claiming a section | `server/services/authoring/authoring-file-to-vault.ts` |
| The view falls back only on 42P01 (the table missing); anything else propagates | `vault-filing.service.ts` (`resolveVaultView`, `resolveOrgVaultView`) |
| Singular kind labels on the one list, and `vaultDocKindLabel()` | `shared/constants/domain/vault-taxonomy.ts`; used at both places in `client/src/concept2cure/v2/surfaces/Vault.tsx` |

No schema change. CHECK constraints are deliberately not added: existing rows
hold the classifier's `N.0` values, and a CHECK, even `NOT VALID`, would block
every later UPDATE of those rows.

## Verified by making it fail

| Check | Red | Green |
|---|---|---|
| Classifier, declared type, view fallback (`vault-filing.service.test.ts`, `vault-view-resolution.test.ts`) | `red/classifier-and-view.txt`: 9 failed | `green/classifier-and-view.txt`: 27/27 |
| Vocabulary on save, both writers, as `app_service` with RLS enforcing (`tests/db/vault-filing-vocabulary.dbtest.ts`) | `red/db-filing-vocabulary.txt`: 5 failed. `banana`, a bare `3` and `nonsense` were all stored. The positive control passed. | `green/db-filing-vocabulary.txt`: 6/6. 422 or 400; no row, no audit row, no stored bytes. |
| Labels (`vaultSurfaceLabels.test.tsx`, `vaultDataRoomCounts.test.tsx`) | `red/vault-surface-labels.txt`: *"expected 'csr' to be 'Clinical study report'"* | `green/vault-surface-labels.txt`: 7/7 |

**Every changed proposal** from the one classifier with a second caller
(`server/routes/ctd-onboarding.ts` `detect-section`, which no client calls):
`green/changed-proposals.md`. Both versions were run over 101 file names, the
test suites' plus the plan's cases. 12 changed, all corrections; 89 are
identical.

Wider runs: 229 unit/pglite files that reach the Vault, classifier or
authoring, 3499/3499. The whole `tests/db` tier, 836/836 in 82 files
(`green/test-db-full-tier-summary.txt`). ESLint is unchanged per file.

## Owed, stated

- **OQ-002 re-run.** The plan asks for OQ-002 to be re-run with this change. Its
  runner (`npm run validation:oq -- vault`) needs a booted server and the
  validation identities with their enrolled authenticators, which this session
  does not hold. None of OQ-002's twelve steps changes its expected result. The
  closest is OQ-VAULT-07, which files into `module-5` with no section, and that
  still passes the check. Handed to the W3 validation lane in
  `docs/work-orders/README.md`.
- `validateSectionCode` still accepts `2.0` by shape (and EU Module 1 has a real
  `1.0`). The classifier no longer proposes `N.0`. Tightening the shared
  validator for modules 2-5 would move leaf placement, so it is handed to the
  D7 lanes, as the plan directs.
