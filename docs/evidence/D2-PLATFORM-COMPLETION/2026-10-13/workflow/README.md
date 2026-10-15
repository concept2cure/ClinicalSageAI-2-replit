# Connected protocol, CSR and CTD workflow — verified repairs

Baseline: `cd0140cbd21df44b804f793940f324f14607d48b`, branch `concept2cure-v2`.
Owner: platform workflow session; the control tower owns integration and release.
This work preserves the existing document, protocol, submission and signature models.

## Repairs delivered

1. **CSR scope is checked before quota, drafting and persistence.** Both CSR
   launch methods use `csr/project-scope.ts`; direct enqueue repeats the check
   before inserting the job. Explicit malformed IDs are refused. A supplied
   project must belong to the authenticated organization, must match a supplied
   program's unique canonical project anchor, and must match an explicit client
   workspace that belongs to that organization. Conflicting request/context
   organizations, actors or project IDs are refused. New builds against archived
   projects are refused; retained work remains readable. An absent target still
   supports an organization-wide build.
2. **The CSR board follows the selected shell program.** The board accepts
   `programId`, `projectId` and optional `clientWorkspaceId`. It uses the same
   scope resolver and adds `meta.programId` and `meta.computedScope`. A named
   program with no unique anchor does not fall back to the organization's latest
   job. `CsrWorkflow` remounts its board on scope changes, immediately clears old
   study data and discards delayed replies from the previous program. A board
   opened without a selected context remains organization-scoped.
3. **CSR progress is labelled build progress.** The stored job progress measures
   generation work, not clinical or regulatory readiness. The API's existing
   `program.readiness` field remains compatible; its visible text and assistant
   context now describe build progress.
4. **CTD summaries use one completed generation per study.**
   `load-csr-inputs-for-project.ts` filters organization, project and `complete`
   status before selecting the newest generation by creation time and job ID.
   A newer failed or unfinished job does not replace the last completed one.
   Historical jobs and outputs are unchanged and remain readable by job ID.
   Unknown sample size remains null; model prose is still not copied as a
   computed primary result.
5. **Legacy CTD section matching uses the canonical section boundary rule.**
   Compile, status and pre-compile validation reuse `sectionMatches`, including
   its existing normalization of a leading `m` and case. A true child of
   `3.2.S.3` can satisfy that node; `3.2.S.30` cannot. Module filtering, FDA form
   checks and minimum-content checks use the same rule.
6. **Unavailable section reads produce an error.** A failed tracked-section
   query no longer becomes an empty list and a zero-percent readiness response.
   The status route retains its existing contained 500 envelope. A genuinely
   empty project and a program with no legacy section store retain their
   existing explicit empty/unlinked responses. No readiness, approval or
   transmission gate was bypassed.
7. **CSR work respects current private-project sharing.** The shared platform
   project-access reader applies the existing project-sharing policy; this work
   does not add a parallel permission model. Fresh organization membership and
   role are read on the same connection. Builds check access before quota and
   enqueue; queued work checks again before source/section reads or drafting.
   Revoked membership, revoked sharing and role downgrade persist an explicit
   job failure rather than completing work under an old session's authority.
   Saved status, section reads and cancellation also recheck permission.
   Organization-wide boards filter inaccessible project jobs before choosing
   the latest result and retain explicitly organization-scoped jobs.
8. **Submission orchestration checks the actor before input assembly.** Its
   project path verifies current access before loading CMC, nonclinical or CSR
   inputs in parallel. The CSR source reader independently requires the pinned
   actor and current project access. A denial is a 403; a failed permission read
   remains a failure, not an empty clinical-input array.

## Canonical workflow inventory

| Stage | Existing implementation and data | Boundary or remaining condition |
| --- | --- | --- |
| Project/program | `services/c2c/program-project-anchor.ts`, `projects.regulatory_program_id` | Regulatory program UUID and project integer are different identities; use the canonical, tenant-scoped anchor. |
| Study design → protocol | `protocol-development-service.ts` binds `protocol_documents.study_design_id` to an owned `cdisc_prm_studies` record; `study-design-repository.ts` records the design's actual program | The protocol model is organization-scoped. A project association must be derived from the actual bound design, not a selected shell context guessed after creation. |
| Protocol authoring and finalization | `routes/protocol-development.ts`, templated sections, version snapshots, completeness gate and governed signature ceremony | Finalization is a protocol decision. It is not approval of an independently created CTD document. |
| Protocol export | `protocol-export-service.ts` assembles retained text and reads signature facets before exporting a finalized protocol | Protocol export is currently structured data/markdown. It is not an automatically placed submission leaf. |
| CSR generation | `csr-builder.ts` → `csr-job-runner.ts` → `csr_build_jobs` / `csr_section_outputs` | Persisted output is generated draft material. Placeholder and unsupplied-statistics gates remain active. Job completion does not establish review, approval or agency acceptance. |
| CSR → Module 2 | `routes/submission-orchestrator.ts` → `loadCsrInputsForProject` → `m2-summary-builders.ts` | Now uses one latest completed generation per scoped study. The primary result remains a pointer to CSR §11.4; a model's drafted efficacy prose does not become a clinical finding. |
| Draft → governed authoring document | `POST /api/authoring/docs/from-draft`, `authoring-from-draft.ts`, `authoring-documents.ts` | Creates draft content, genesis revisions, provenance and audit records transactionally. Machine attribution and admitted-model proof cannot be replaced by an import attributed to the human. |
| Review/sign/freeze | Authoring workflow and `approveAndFreezeDocument` in `authoring.router.ts` | Existing signature ceremony, approval workflow, immutable snapshot and permissions remain authoritative. |
| Governed document → filing copy/vault | `coauthor-snapshot.ts` via `POST /api/coauthor/documents` with `sourceAuthoringDocId`; `authoring-file-to-vault.ts` | Filing copies read actual saved text/status and verify the governing seal. Draft vault files remain drafts. |
| Filing → sequence | `submission-service/submission-service.ts` (`upsertLeaf`), `leaf-document-tables.ts`, tenant/program source verifiers | Placeable sources include governed authoring sections, filing copies and eligible vault versions. Protocol documents and raw CSR output rows are not registered sources. |
| IND/BLA readiness/compile | `ectd-compile.ts`, `resolveRequiredSections`, canonical submission spine and `assemble-from-core.ts` | Required-section completeness is separate from rendered-package and transmission readiness. The existing real packager, source lifecycle, checksum, sequence and signature gates remain in force. |

## Bounded next integration: reviewer-directed promotion

Raw protocol and CSR stores stop before the governed authoring/finalized filing
source boundary. The safe next connection is an explicit **create authoring
draft from retained source** operation that reuses the existing authoring service,
followed by the existing review, signature, freeze and placement paths.

The operation should read an owned, explicitly selected protocol version or CSR
generation on the caller's tenant connection; resolve its actual program; record
the source table, row/version IDs, content hashes, generation provenance and any
missing source proof; sanitize its content; and create a draft plus source receipt
in one governed transaction. Missing or conflicting project identity must be a
refusal. Machine-produced CSR text must keep its machine attribution and model
qualification; `source: import` must not silently relabel it as human-authored.
Repeated promotion needs a deliberate new generation or an idempotency receipt.

That draft can then enter the existing authoring workflow. A protocol signature
must remain a source signature, not be copied into a CTD approval. Neither a CSR
job marked complete nor a copied protocol may set approved/frozen status, sign
on someone's behalf or become submission-ready automatically. No new promotion
or direct protocol/CSR leaf resolver was introduced in this increment.

## Verification

- Initial scope regression: 5 tests, 4 failed against baseline; the failure showed
  accepted foreign/malformed targets, accepted scope conflicts and loss of an
  explicit request project. The corrected PostgreSQL-compatible SQL tests cover
  organization, project, program, workspace and archive behavior.
- Initial downstream regression: 5 tests, 4 failed against baseline; duplicate
  study generations, adjacent CTD code matching, normalized-child matching and
  unreadable-store zero readiness were reproduced.
- Initial private-project regression: 6 actual-SQL tests, 4 failed before the
  access repair. Revoked sharing/organization membership and failed permission
  reads had still permitted drafting. A separate HTTP regression reproduced
  unauthorized cancellation. The final private-project suite adds role
  downgrade, saved output reads, archive history and protected summary inputs.
- Final focused regression pack: **22 files, 156 tests passed**, including actual
  SQL execution with PGlite, existing CSR placeholder/statistics protection,
  eCTD sequence/lifecycle/vault UUID/external-validator cases, error containment,
  CSR API refusals and browser component scope/cancellation checks.
- Focused lint: **zero errors**; warnings remain in existing large route/service
  and UI functions. The control tower runs integrated typecheck/build/release
  gates separately.

The SQL fixtures contain synthetic test records. PGlite verifies actual query
behavior; it does not establish deployed RLS, agency acceptance, production
transport configuration or clinical validation. No AI request or dependency
installation was needed for this work.
