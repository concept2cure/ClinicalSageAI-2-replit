# D2 / CSR slice 1 — reach the retained CSR evidence pack from AnA chat (2026-10-29)

Design: `docs/design/CSR_END_TO_END_2026-10-29.md`, slice 1. Launch rows: D2 (Authoring, Submission Center) and D4 (biostatistics evidence).

## What already exists

- `server/services/csr/cortex-authoring-reader.ts` `loadCsrAuthoringEvidence`: reads a retained run through the canonical `readSavedClinicalTables` (project ACL, sealed-run receipt, current source eligibility), then `buildCsrAuthoringEvidence` (`cortex-authoring-context.ts`) builds the section's tables from the E3 section → table map, screens identifiers and binds them to a digest. Before this change its only caller was `POST /api/ana-cortex/csr/evidence-context` and `/api/ana-cortex/chat` with `context.csrEvidence`, and neither has a client caller.
- `cortex-authoring-context.ts` `reconcileCsrTableClaims`: exact-cell agreement of `{table,row,column,value}` claims. Before this change it had the same single, caller-less route.
- `server/services/ana/skills/library/clinical.ts` `clinical.study-report`: the method named no tool that reads study data.
- `get_document_section_requirements` (`regulatory-knowledge-tools.ts`): the E3 brief per heading. It is reachable, and until now the skill did not name it.
- Searches run before building: `loadCsrAuthoringEvidence`, `reconcileCsrTableClaims`, `csrEvidence`, `csr_section_evidence`, `section_evidence` across `server/`, `client/src`, `shared/`. `git log --all --diff-filter=D -- '*csr*evidence*'` found nothing deleted. No AnA tool reads the pack, and `/api/ana-ri/stream` exposes none.

This change **reaches** the existing pack and reconciliation. It adds no evidence logic of its own.

## What changed

| File | Change |
|---|---|
| `server/services/ana/csr-section-evidence-tool.ts` (new) | The AnA tool `get_csr_section_evidence`. The program comes from the open conversation (`admitAnaProjectScope`), and run, study and section come from input. It wraps `loadCsrAuthoringEvidence`. Three modes: overview (tables, digest, limitations, rules); `table` + `row_offset` (whole-row pages within `RESULT_BUDGET`, never cut); `claims` + `evidence_digest` (`reconcileCsrTableClaims`, refused if the digest moved). Every failure is the typed `CSR_SECTION_EVIDENCE_UNAVAILABLE` with a `reason`. |
| `AnaToolDefinitions.ts`, `AnaToolExecutor.ts` | Offer the tool and register its handler, using the same injected-register pattern as the regulatory knowledge tools. |
| `tool-authorization.register.json` | `read` / `writes: none`. `present`: verb `read`, source **`engine`**, preview `section`. |
| `ana-launch-scope.inventory.json` | `inScope` (operates Submission Center records). |
| `tool-pedigree.ts` | `DETERMINISTIC_QUERY_NAMES` (a pure read of engine tables). |
| `skills/library/clinical.ts` | `clinical.study-report` gains step 3. For any results section (2, 10, 11, 12, 13) it calls `get_csr_section_evidence` before writing, writes every figure from its cells, then passes the figures back as claims. It also names `get_document_section_requirements` for the per-heading brief. |
| `server/services/csr/source-access.ts` (new), `vault-source-input.ts`, `saved-clinical-tables.ts`, `source-receipt-eligibility.ts`, `csr/__tests__/saved-clinical-tables.test.ts` | **Shared-file edit, smallest possible.** `CsrSourceInputError`, `CsrSourceScope` and `authorizeCsrSourceProgram` moved verbatim into `source-access.ts`. `vault-source-input.ts` re-exports them, so no other importer changes. The reason is below under the ENGINE gate. |
| `server/services/ana/result-budget.ts` (new), `agentic-loop.ts` | **Shared-file edit.** `RESULT_BUDGET` moved verbatim. `agentic-loop.ts` re-exports it, so it stays one constant with all its importers unchanged. |

## Fail first (red), then green

- `red-fail-closed-disabled.txt`: the suite run against a naive wrapper (no unavailable-status refusal, no digest binding, reader errors turned into an empty pack). **6 of 13 fail.** The failures include the revoked receipt (`CSR_SOURCE_DATA_UNAVAILABLE` shown as an empty pack), no access, §12.5 with no table, a failed read, and reconciling against a moved digest.
- `red-cell-compare-disabled.txt`: the suite run with cell comparison weakened to "the table exists". The test "AE count one off from aeBySOC" (draft `53 (28.9%)`, cell `52 (28.9%)`) fails with `expected 'matches' to be 'needs_review'`.
- ENGINE claim red: `ci:step-presentation` first refused `source: engine`. The handler reached the model gateway in two ways:
  - `CsrSourceInputError` → `vault-source-input.ts` → its dynamic `import('../../routes/c2c/project-vault.js')` (the Vault byte reader) → the upload/ingest/embedding graph → `ai-gateway/gateway.ts`
  - `RESULT_BUDGET` → `agentic-loop.ts` → `step-presentation.ts` → `catalog-scope.ts` → embeddings
  
  Neither path runs on this read, but the gate counts module reach, and that is the correct test. Both moves above remove that reach. The gate now passes with the claim intact: `134 engine claims, none with a reachable model call`.
- `green.txt`: `csr-section-evidence-tool.test.ts` 13/13 and `saved-clinical-tables.test.ts` 12/12.

## End to end: REBYOTA PUNCH CD3 (Study 2017-01), deterministic leg

`punch-cd3-reconcile.ts` → `punch-cd3-reconciliation.json`. The script transcribes the FDA-reported aggregates into the engine's `StudyData`, then runs `buildCSRTables`, then `get_csr_section_evidence` for §10.1 and §11.4.1. It passes each FDA figure back as a drafted claim. One claim is deliberately one off.

| § | FDA-reported | Engine cell | Result | FDA source |
|---|---|---|---|---|
| 10.1 | 193 / 96 randomized | 193 / 96 | matches | Clinical Review Table 22 |
| 10.1 | 289 randomized total | 289 | matches | Clinical Review Table 22 |
| 10.1 | 21 / 12 discontinued | 21 / 12 | matches | Clinical Review §6.2.10.1.3 |
| 10.1 | 13 / 9 not treated | 13 / 9 ("Other") | matches | Statistical Review Table 11 |
| 11.4.1 | 180 / 87 safety | 180 / 87 | matches | Clinical Review Table 22 |
| 11.4.1 | 177 / 85 mITT | 177 / 85 | matches | Clinical Review Table 22, Statistical Review Table 11 |
| 11.4.1 | 167 / 78 PP | 167 / 78 | matches | Clinical Review Table 22 |
| 11.4.1 | 126 (0.71) / 53 (0.62) success, mITT | 126 (0.71) / 53 (0.62) | matches | Statistical Review Table 11 |
| 11.4.1 | **127 (0.71)**, the deliberate error | 126 (0.71) | **mismatch** | — |

§10.1 evidence is `available`, with digest `cd0ca36f…`. §11.4.1 is `partial`, with digest `ae9b1a7f…`. It is partial because `secondaryEfficacy` is absent, and the pack reports that as missing, not as zero.

Engine findings this run surfaced, not fixed here (slice 6):

- The §10.1 builder prints "Death 0", "Lost to follow-up 0" and "Screen failure 0" for statuses the source never recorded. That is a missing value rendered as zero. "Death 0" also contradicts FDA, which reports two RBX2660 subjects who discontinued after fatal TEAEs (Clinical Review §6.2.10.1.3). The transcription counts them under "discontinued".
- "Completed" (159 / 75) is derived as treated minus discontinued. FDA does not state that figure. The builder also labels this row "Completed treatment", although the transcribed quantity is study completion.

## What was not run (blocked)

- **The Vault → `csr.tabulate` → live `/api/ana-ri/stream` leg.** The `concept2cure.csr-source.v1` contract (`shared/csr-source-input.ts`) requires complete demographics and AE records for every randomized participant. The FDA memos give only aggregates, so a valid envelope would need invented subject-level facts. It was not built.
- **A live drafted §10.1 / §11.4.1 paragraph.** Production high-risk drafting fails closed until PQ-DRAFT-001 passes (ADR-0015 §3; this is the design's open founder decision). This session has no running app or model.
- The tool path the live leg would use is the one exercised above. The only differences are the default reader (`readSavedClinicalTables`) and scope admission in place of the injected ones.

## Reproduce

```
npx vitest run server/services/ana/__tests__/csr-section-evidence-tool.test.ts server/services/csr/__tests__/saved-clinical-tables.test.ts
npx tsx docs/evidence/D2-EDITOR-CSR-CRF/2026-10-29-ana-evidence/punch-cd3-reconcile.ts
npm run ci:step-presentation && npm run ci:launch-scope-api
```
