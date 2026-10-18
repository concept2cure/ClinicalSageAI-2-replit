# D2 processing recovery: existing read-side integration proposal

14 October 2026. Read-only preparation against canonical `concept2cure-v2`, baseline `87b27c897c5d1be20b0527009bcaf425ebbf3af6`. Production changes require the lead's published recovery contract. No application files changed in this preparation.

## Smallest reachable path

`GET /api/c2c/projects/:id/sources` is already the canonical paged Data Room read. Its tenant/project admission, totals, currentness, disposition, catalogue facts and source-use summaries remain the contract. [shapeSource, projects.ts:1840](../../../../server/routes/c2c/projects.ts#L1840) forwards ingestion/extraction status but drops processing metadata and errors. [searchDataRoom:144](../../../../server/services/clinical-regulatory-evidence/data-room-search.ts#L144) returns every required list column except the extracted text, preserving bounded payloads.

Two existing, reachable consumers need the same factual state:

- Project Home → Evidence → Data room. [ProjectHome.tsx:436](../../../../client/src/concept2cure/v2/surfaces/ProjectHome.tsx#L436) distinguishes extracted/failed/pending, but its label and [grounding predicate:447](../../../../client/src/concept2cure/v2/surfaces/ProjectHome.tsx#L447) trust extractionStatus alone. A superseded historical extracted source displays green Read even though pinning is correctly disabled.
- Existing document editor → Project files → Data room. [ProjectFilesPanel.tsx:608](../../../../client/src/concept2cure/v2/editor/ProjectFilesPanel.tsx#L608) mounts `DataRoomSourcesPanel`. [sourceReadLabel:12](../../../../client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx#L12) collapses extraction failure and pending work into Text not yet available; [Ask AnA eligibility:26](../../../../client/src/concept2cure/v2/editor/DataRoomSourcesPanel.tsx#L26) and [citation eligibility:53](../../../../client/src/concept2cure/v2/editor/projectSourceCatalog.ts#L53) trust extractionStatus alone.

The smallest secondary integration is the existing Vault lane: [project-vault.ts:1419](../../../../server/routes/c2c/project-vault.ts#L1419) computes `readState`; [Vault.tsx:573](../../../../client/src/concept2cure/v2/surfaces/Vault.tsx#L573) already renders that string. A shared server projection can improve this lane without a new UI. Capture/classification/filing stages and their project-wide counts remain separate from text-processing status.

## Necessary additive contract

1. **Durable text availability.** Return an actual nonblank persisted-text flag in the existing source read. A legacy row claiming extracted while its text is null must not display as readable or feed pin/Ask/citation eligibility. Read the flag in the same source SELECT; never return the large text body. Test null, empty and whitespace-only text against the core's nonblank rule. `charCount`, in-memory extraction words, completed metadata and extracted status alone are insufficient authority.
2. **Whitelisted processing summary.** Project only the approved `metadata.dataRoomProcessing` fields needed by the user: state, retryability, safe reason code, and relevant retry/lease timing. Do not expose stored artifact paths, full private identity metadata, raw thrown errors or the whole metadata object. Malformed/unrecognized processing metadata must not be promoted to completion.
3. **Separate content availability from attempt outcome.** Preserve raw extractionStatus. A failed new attempt can be described without inventing loss of existing committed readable text. An obsolete worker's `stale_source` result must not overwrite the display of a newer committed successful attempt. In the source list, authoritative `isCurrent=false` supplies Superseded source independently of any historical extraction.
4. **Shared labels/eligibility.** Reuse one small status/grounding helper across Project Home and the editor, with labels for not processed, processing, text not readable, processing needs retry, processing blocked, readable and superseded. Keep `sourceImportUnavailableReason` unchanged: work on the original and use extracted text as AnA context are different abilities. Preserve retained eligible readable text when the original file is unavailable.
5. **Existing schema/paging semantics.** Extend the source DTO/parser additively. The editor's [parseProjectSourcePage:35](../../../../client/src/concept2cure/v2/editor/projectSourceCatalog.ts#L35) confirms project, every row, total and paging before supplying citation authority; extend that validation for supplied status fields rather than bypassing it. Missing fields from a legacy response need an explicitly documented compatibility policy. An explicitly unavailable flag always overrides a historical extracted label.

The core agent's draft (not yet approved) uses metadata state running/completed/failed/blocked and additive processing outcomes. The read side should consume the final published names rather than introduce a competing state machine. A Retry needed label does not promise that an automatic worker is scheduled. Existing list retry/refresh actions only reread status; they must not claim to reprocess files. No new processing mutation endpoint is needed for this slice.

## Proposed ownership after approval

Read-side owner:

- `server/services/clinical-regulatory-evidence/data-room-search.ts`: actual nonblank-text flag in the existing SELECT.
- `server/services/clinical-regulatory-evidence/types.ts` and a **narrow** `adaptSource` projection in `evidence-spine.service.ts`: additive availability field, if approved. `adaptSource` should use an explicit SQL boolean when present, or actual loaded `extracted_text` when present; it must not invent availability from extractionStatus. This lets the existing `listClientDocuments` SELECT `s.*` expose the same flag to the Vault lane without a second query.
- `server/routes/c2c/projects.ts`: `shapeSource`/source GET block **only**. Adoption belongs to the caller owner, even though it shares this file.
- `server/routes/c2c/project-vault.ts`: Data Room `readState` projection only. Vault classification/filing/document readers stay untouched.
- `client/src/concept2cure/v2/editor/projectSourceCatalog.ts`, `DataRoomSourcesPanel.tsx`, and the Data Room block in `surfaces/ProjectHome.tsx`: additive contract validation, shared labels and persisted-text eligibility. Optional light helper may live beside the existing source DTO; it is code reuse, not a product module.
- Focused existing route/editor/Project Home fixtures; one small shared-projection test if that helper is introduced.

The recovery-core owner retains `data-room-processing.ts`, claims/admission/CAS and core tests. Upload, duplicate upload/adoption, derived-save outcomes and attachment hooks remain with their assigned caller owners. No scope unlock, scientific fact approval, new module, dashboard, worker, search index or schema is required.

## Meaningful integration fixture

Use the actual existing source route/projection and actual existing Project Home/editor rendering, with mocked storage/DB inputs rather than a full environment:

1. A current eligible source is captured with the same id/checksum, legacy extracted status, **no persisted text**, and a committed retryable processing failure. The GET reports unavailable text/retry-needed; both views show the failure/retry state, the pin/Ask actions are disabled and no readable count includes it. A readable original may still offer Work on document.
2. A later successful recovery commits nonblank text for that exact source. A fresh GET exposes completed/readable status. Refresh/reread restores grounding for that same id without another capture, and stale prior failure prose is absent.
3. A stale worker result from the first attempt arrives after success. It must not regress that fresh read. A separate superseded source remains visible as historical/superseded and ineligible even when its historical text exists.

Additional narrow controls: missing/null/whitespace persisted text; extraction_failed with successful recording is not readable; running/expired lease; retry not due/exhausted without a promised scheduler; malformed processing metadata; tenant/project refusal; withdrawn data; retained readable text with unavailable original; strict pagination completeness; failed GET versus empty room. Preserve the existing source-change banner: stale citation usage and stale processing attempts are different facts.

## Existing baseline evidence

Command, local Node v24.19.0, mocked routes/components, no live provider/model calls:

```sh
node node_modules/vitest/vitest.mjs run server/routes/c2c/__tests__/projects-sources-window.test.ts server/routes/__tests__/vault-data-room-counts.test.ts client/src/concept2cure/v2/__tests__/projectHomeDataRoom.test.tsx client/src/concept2cure/v2/editor/__tests__/projectSourceCatalog.test.tsx client/src/concept2cure/v2/editor/__tests__/editorSourceLibraries.test.tsx client/src/concept2cure/v2/editor/__tests__/sourceUiRules.test.tsx
```

`read-side-existing-baseline.log`: **45/45 passed**, six files, exit 0. This confirms current route/projection/rendering behavior and useful seams; it does not prove the proposed recovery-status contract. Existing evidence for premature extracted/null-text rows and stale commits is in `docs/evidence/D2-PROCESSING-RECOVERY-STUDY/2026-10-14/` and remains separate.
