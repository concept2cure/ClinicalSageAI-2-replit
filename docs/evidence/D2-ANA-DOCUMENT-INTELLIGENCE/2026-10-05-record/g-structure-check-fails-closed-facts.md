# g-structure-check-fails-closed — facts relied on

Step: the writing gate (`server/services/ana/writing-precision-gate.ts`) says
when it did not check structure. Verified finding 14 (`critique-stored-documents`),
Problem 2 only. Problems 1 and 3 (critiquing stored sections, section-level
structure) belong to other steps.

No regulator text is relied on. The change concerns what the platform claims
about its own check, not a regulatory requirement.

| # | Fact | Basis | Where it is used |
|---|------|-------|------------------|
| 1 | At HEAD (9ccf42b3), `critiqueDraft({ text, documentType })` returned verdict `pass` and `metrics.missingSections` 0 for `'clinical_study_report'`, `'2.7.4'` and `'iss'`. `reviewMedicalWriting` returns no `missingSections` for a type `getDocumentTypeStandard` does not resolve, and `structureDimension` read that as 0. | Code at HEAD, reproduced by the red run (`g-structure-check-fails-closed-red.txt`: the handlers return `pass`, `verify_revision` returns `passesNow: true`). | Why an unindexed type is now a `not-checked` status and a high finding. |
| 2 | The indexed whole-document types are the `DOCUMENT_TYPES` ids in `server/services/ana/medical-writing.ts`: protocol, csr, ib, clinical_overview, clinical_summary, cer, pmcf, per, manuscript, plain_language_summary, regulatory_response, rmp, meeting_package. | Code, read at run time through `listMedicalWritingCatalog()`. It is not copied, so the tool contract cannot drift from the checker. | `indexedDocumentTypes()`, the notice text and the three tools' `documentType` descriptions. |
| 3 | Each indexed type's `structure` is the outline of a whole document. For example, csr is ICH E3's sixteen top-level headings, via `e3TopLevel()`. So a single section checked against it reports most headings as missing. | Code (`medical-writing.ts`, csr entry). The E3 outline itself is covered by earlier steps' facts. It is not restated here. | Why the `documentType` description says to pass it only for a complete document and to omit it for a single section. |

What is now true:

- `PrecisionReport.structure` is `{ status: 'checked' | 'not-checked' | 'not-applicable', reason }`.
- `metrics.structureChecked` is a boolean.
- `metrics.missingSections` is `null` whenever structure was not checked. It is no longer 0.
- `RevisionVerdict.structure` and `DocumentCritique.structure` carry the same status.

When a `not-checked` finding is raised:

- `documentType` is not indexed. The message begins "Structure not checked: '<type>' is not an indexed document type." and lists the indexed types.
- `documentType` is indexed, but there is no text to check.

The finding is high severity, so the verdict is `revise`. It reaches all three tools through fields their handlers already serialise:

- `critique_draft`: `findings`, `revisionBrief` and `metrics`.
- `verify_revision`: `result.structure`, with `passesNow` false.
- `critique_document`: `crossSectionFindings`.

Known limits, stated rather than hidden:

- The `critique_draft` handler (`AnaToolExecutor.ts`) does not yet put `report.structure` at the top level of its JSON. Its `metrics.structureChecked` and the finding carry the same information. Adding it is noted for the executor's owner.
- The not-checked finding takes the usual high-severity 18 points off the score. The score means "every deterministic check passed", and this one did not run.
- A type that the loose alias match resolves is still checked as that whole document. For example, 'm2.7.4' matches clinical_summary. Section-level structure is the separate `critique_authoring_section` step.
