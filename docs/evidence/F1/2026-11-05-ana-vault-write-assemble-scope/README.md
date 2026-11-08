# F1: AnA's artifact write and module assembly hold to the person's projects (2026-11-05)

This follows `../2026-11-05-ana-vault-tools-scope/`, which held AnA's seven governed-artifact and governed-document
reads to the projects the person can open and, inside a project, to that project's sponsor's. That change found two
more handlers that select a governed artifact by organization alone:

- **`update_vault_document`** writes a new version of a governed artifact. It checked the organization and nothing
  else: not whether the person can open the artifact's project, not whether they may change it, and not the open
  project's sponsor. A member could have AnA write a new version of a private project's artifact, or of another
  sponsor's.
- **`assemble_ectd_module_from_artifacts`** assembles a module from the artifacts of a `project_id` the model names.
  It read the content of that project's artifacts with the organization as the only filter.

Its README also named `draft_510k_substantial_equivalence`. That handler reads no artifact: it returns a fixed
outline. The artifact read beside it, `readProgramArtifacts` (the Module 2.5 overview's citation suggestions), already
reads only the resolved project, never one the model names.

## What already exists

- **The read scope.** `projectReadScope` (`server/services/ana/AnaToolExecutor.ts`, from the change above) covers
  three things:
  - the projects the sharing policy admits the person to (`getAccessibleReportProjectIds`);
  - with a project open, that project's admission (`admitAnaProjectScope`);
  - its sponsor's narrowing (`narrowToSponsorOf`, `server/services/artifact-registry-read.ts`).
- **The edit right.** `canAccessReportProject(…, { forWrite: true })` (`server/services/report-os/project-access.ts`)
  is the project sharing policy's edit decision (`canEditProject`). The Vault's own writes ask it on the write's
  connection, with the project and its visibility held `FOR SHARE` (`server/routes/mdx-risk-access.ts`).
- **The write's other gates** are unchanged and come first:
  - the approved-model gate (`governed-write-tools.ts`, `governed-write-gate.test.ts`);
  - a person's confirmation (`direct-mutator-confirm-gate.test.ts`);
  - the organization role (`confirmed-write-role-gate.test.ts`).
- **The write's atomicity** (audit row, lineage and provenance in one transaction) is pinned by
  `qms-vault-audit-atomicity.contract.test.ts`.

Searches run: every `concept2cure_artifacts` read or write in `AnaToolExecutor.ts`; `forWrite: true` and
`canAccessReportProject` over `server`; the handlers' tests.

## What changed

- **`update_vault_document`**:
  - It reads the person's scope first, and selects the artifact `FOR UPDATE` only within it. One outside reads as no
    row, answered word for word as a missing id.
  - It then asks the edit right on the write's own connection (`artifactEditRefusal`), as the Vault's writes do. A
    project the person can open but not change is refused (`PROJECT_WRITE_ACCESS_DENIED`, "Nothing was changed."),
    and nothing is written.
  - A check that cannot run is an error with a code, and nothing is written.
  - The selection and the two refusals moved into `lockWritableArtifact`, and the input checks into
    `vaultUpdateInput`, to keep the handler under the complexity limit.
- **`assemble_ectd_module_from_artifacts`**: the model-named project is held to the same scope. One outside reads as
  a project with no such artifacts. The input checks moved into `assembleModuleInput`.

No route, table or tool is added.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `ana-vault-tools-project-scope.pglite.test.ts` with the new cases, against trunk's handlers: 5 of 24 fail, the new ones. Trunk writes a new version of a private project's artifact, of another sponsor's, and of a project the person cannot change, writes even when the access check cannot run, and assembles a private project's and another sponsor's artifacts. |
| `02-green.txt` | That suite and `qms-vault-audit-atomicity.contract.test.ts` with the change: 37 of 37 |
| `03-suites.txt` | Every suite that calls these handlers or the scoped reads: the write gates, the confirm gate, the role gate, machine-draft lineage, the tool-handler suite and the four scoped-read suites. 11 files, 177 tests. |

Two test fixtures changed:
- **`ana-vault-tools-project-scope.pglite.test.ts`** calls the write as an approved model's call that a person
  confirmed, because either gate would refuse every id alike. Its pool lends a connection on the same database, and
  the write's audit, lineage and provenance calls are recorded calls.
- **`qms-vault-audit-atomicity.contract.test.ts`** wrote to an artifact of project 77, which did not exist in its
  database. Project 77 is now a real project under its own program, the actor's organization-admin membership is the
  one its harness already records, and it has a `client_workspaces` table, which the sponsor narrowing reads.

## Not done here

- **Not run on a PostgreSQL server or in a live AnA conversation.** The suites run on PGlite.

## Follow-up: the stated reason is read on the write's own path (2026-11-06)

`governed-reason-not-invented.test.ts` checks statically that every reason carried to a write is bound to
`gatedReason(input)` on that write's path. The refactor above moved that call into `vaultUpdateInput`, so the check read
`update_vault_document`'s reason as unbound and failed: "update_vault_document AnaToolExecutor.ts:21544: reason is not
bound on this path". It is now read in the handler again, and the helper returns no reason. The suite passes, 75 of 75;
no behaviour changed. Found by the lead session while reviewing the next slice; the pre-push gates do not run that
suite.
