# g-assemble-device-project-scope: facts relied on

Step: `assemble_device_submission` reads the project's governed content instead of the leaves the model types.
Verified finding: `verified-all.json[62]` (`devices-assemble-submission-project-scope`).

## Regulatory facts

This step adds no regulator fact. It changes where the inputs to the existing
deterministic engine come from: the open project, not the model. The engine's
section registries (`estar-mapper`, `pma-mapper`) and the template gate
(`estar-template-registry`) are unchanged.

The verifier checked the FDA facts below against fda.gov search results; fda.gov
itself is blocked for fetch. This step did **not** re-check them and does not
encode them. They are recorded only because the finding cites them, and they
justify the follow-up work listed under "Not in this step".

| Fact | Basis | URL | Checked |
|---|---|---|---|
| eSTAR 510(k) submissions get a technical screening within 15 days. It verifies that eSTAR responses accurately describe the device and that each applicable attachment-type question has at least one relevant attachment. | regulator text (FDA guidance "Electronic Submission Template for Medical Device 510(k) Submissions", 2023-10-02), quoted by the verifier | https://www.fda.gov/media/152429/download | 2026-10-05, by the verifier through search results, not by this step |
| eSTAR submissions are not anticipated to undergo refuse-to-accept (RTA). A submission that fails technical screening can be held for up to 180 days, then is withdrawn. | regulator text (FDA "510(k) Submission Process" page), quoted by the verifier | https://www.fda.gov/medical-devices/premarket-notification-510k/510k-submission-process | 2026-10-05, by the verifier through search results, not by this step |
| PMA filing review falls under 21 CFR 814.42. | **recall**, not checked against regulator text | none | none |

## Code facts this change relies on (read at HEAD d68ab20b)

- **The AnA handler trusted the model.** At HEAD, `AnaToolExecutor.ts` (handler `assemble_device_submission`) accepted three inputs from the model and never read `ctx`:
  - `substantive: l.substantive === true`;
  - `deviceFlags`;
  - `presentTemplates`.
- **The route already loaded inputs server-side.** `POST /api/510k/estar/assemble` (`510k-estar-routes.ts`, about lines 1339-1380 at HEAD) used:
  - `resolveDeviceContentScope`, then `loadDeviceContentLeaves`;
  - `loadProgramDeviceFlags`;
  - `listVendoredTemplates`, filtered by `isUsableEstarTemplate`.
- **The scope resolver falls back to the legacy store and lets failures surface.** `resolveDeviceContentScope` (`estar-content-leaves.ts`) answers from the legacy store, org-wide when no `documentId` is given, if the program's governed document holds no authored section. A failed governed read throws; it is not swallowed.
- **Substantive comes from the section status.** `sectionsToLeaves` derives `substantive`: `drafted`, `drafting`, `in_review` and the other in-progress statuses are never substantive.
- **The open project resolves in one place.** `resolveOpenProgram(pool, ctx)` (`server/services/c2c/program-access.ts`) is the single open-project resolver. It throws `VerificationUnavailableError` when the lookup cannot run.
- **The honesty pattern is mirrored.** `plan_submission_from_database_lock` (`regulatory-knowledge-tools.ts`) logs the driver message and tells the model the read failed, never that steps are missing. This step copies that pattern as `status: 'read_failed'`.

## What is now true

- **One loader for every caller.** `loadProgramDeviceAssemblyInput(orgId, {...})` in `server/services/pathway-engines/device-assembly/assemble-device-submission.ts` is the only place the device assembly inputs are loaded for an organization or program. `assembleProgramDeviceSubmission` is that loader plus `assembleDeviceSubmission`; POST `/api/510k/estar/assemble` calls it, and its former inline body is gone from the route. Both AnA tools (`assemble_device_submission`, `advise_device_readiness`) read through the loader and run the same engine.
- **Project mode ignores the model's content claims.** With a project open, the AnA tool ignores model-supplied `leaves`, `substantive`, `deviceFlags`, `presentTemplates`, `availableArtifacts` and `environment`.
  - The response lists any of these that the model sent, under `ignored_input`.
  - It echoes `deviceContentSource`, and adds a `source_note` when that is `legacy_org_wide`.
- **A failed read is reported as a failed read.** If the project lookup or the content read throws, the tool returns `status: 'read_failed'` with `standing_error`. It never returns missing sections, and never the driver message.
- **Hypothetical mode cannot pass.** `mode: 'hypothetical'` is declared in `deviceSubmissionTools.ts`. In that mode every leaf is forced to `substantive: false` and `presentTemplates` to `[]`. The result is labelled "hypothetical — not this project's content; cannot report a producible official eSTAR".
- **No project means no verdict.** With no project open and no hypothetical mode, the tool returns `status: 'needs_project'`.
- **`advise_device_readiness` follows the same rule (fix round 1).** With a project open it shapes the advice from the loaded project input and echoes `mode: 'project'`, `programId`, `deviceContentSource` and `ignored_input`. With none, a model outline gets the hypothetical treatment: every leaf unfinished, `presentTemplates: []`, and the model's `environment` and `requireTemplate` dropped. With no outline either, it returns `needs_project`. A failed read returns `read_failed`. `pathway: 'pma'` is refused there and pointed at `assemble_device_submission`; the advisor's own spec declares only `510k` and `de_novo`.
- **Only reads are caught.** The `read_failed` catch now wraps only `resolveOpenProgram` and `loadProgramDeviceAssemblyInput`. An exception from the pure engine reaches the tool's outer `error` envelope and is no longer mislabelled as a read failure.

## Fix round 1: code facts (read at HEAD d68ab20b and in the working copy)

- **The parallel copy.** At HEAD, `advise_device_readiness` (`AnaToolExecutor.ts`, about line 2321) passed the model's input straight to `adviseDeviceReadiness`. That function (`server/services/ana-advisory/device-market-advisor.ts`) calls `assembleDeviceSubmission` with the input's `leaves` (substantive as typed), `presentTemplates` (by name), `deviceFlags`, `environment` and `requireTemplate`. The tool is exposed to the model through `ANA_ADVISORY_TOOL_SPECS` (`AnaToolDefinitions.ts`). Red: with a project of drafted sections open, it returned `canProduceOfficialEstar: true`.
- **No change to the advisor was needed.** `adviseDeviceReadiness` is a pure shaping of `assembleDeviceSubmission` over the input it is given, so handing it the loader's input yields the same assembly as `assembleProgramDeviceSubmission`. The test "the advice and assemble_device_submission give the open project the same verdict" pins that.
- **Two reads, two failure points.** `resolveDeviceContentScope` queries `c2c_document_sections` once, to ask whether anything is authored. `loadDeviceContentLeaves` queries it again for the content. The round-0 failed-read test failed the first read only, so a `.catch(() => [])` on the second survived. The round-1 test fails the second read; that mutation now fails 2 tests (green.txt section 2).

## Not in this step (corrected proposal items 4 and 5)

These need files outside this step's list, so they are reported as needs_elsewhere:

- **Item 4, contradiction check.** Add `summary.contradictions` to `estar-mapper.ts`: a substantive leaf on a slot that the program's own flag makes not-applicable. This is FDA's "responses accurately describe the device" ground. Surface it as an `assembleDeviceSubmission` blocker.
- **Item 5, RTA wording.** Replace "RTA-style" with "eSTAR technical screening" in the 510(k)/De Novo paths: `estar-mapper.ts:6, :228, :242` and the section-gate comments in `assemble-device-submission.ts`. Leave the PMA wording alone.
