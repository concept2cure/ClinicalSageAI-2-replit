# The MDX journey's two handoffs to filing types, closed — 2026-11-02

**Plan:** F1 (defects in shipped behaviour, as the MDX journey handed them on). **Completes:**
`server/services/ana/AnaToolExecutor.ts`. **Handed on in:** the MDX journey's row of
`.design/claude-convergence/COORDINATION.md` (`01P6GW…`), after its slice 3
(`../2026-11-02-slice-3-estar-exits-ask-the-filing/`) and M8 (`../2026-11-02-m8-labeling-empty-state-action/`).

## 1. `advise_device_readiness` dropped the filing's verdict on its filed copy: fixed

**The defect.** MDX slice 3 (P-29.3) taught every eSTAR exit to ask whether the filing holds the document's text.
`loadProgramDeviceAssemblyInput` sets `filedCopyDiverged`
(`server/services/pathway-engines/device-assembly/assemble-device-submission.ts`). `assembleDeviceSubmission` then
produces nothing, and names the section and the remedy (Re-file saved text). `assemble_device_submission` passes the
loaded input whole, so it says so. `advise_device_readiness` rebuilt that input field by field for
`adviseDeviceReadiness` and left `filedCopyDiverged` out. So in project mode AnA advised "Ready: an official,
submittable FDA eSTAR … can be produced" over a filed copy that is not the document's text, which every exit refuses.

**What already exists (RULE 3).**
- **The advisor:** `adviseDeviceReadiness` (`server/services/ana-advisory/device-market-advisor.ts`) takes
  `filedCopyDiverged` and states it in its headline and its artifact finding. Its half landed with MDX slice 3.
- **The loader:** `loadProgramDeviceAssemblyInput` sets the field from the filing agreement.
- **The engine:** `assembleDeviceSubmission`, and its test of a diverged filed copy
  (`assemble-device-submission.test.ts`, "a filed copy that is not the document's text").
- **The handler** (`AnaToolExecutor.ts`, `advise_device_readiness`), whose `advise` closure is the one gap.

Nothing is added. The closure now passes the field through, as the advisor and the engine already expect.

**The change.** One line in `advise`: `filedCopyDiverged: a.filedCopyDiverged`.

**Proof.** `server/services/ana/__tests__/advise-device-readiness-filed-copy.test.ts` stubs only the open-project
lookup and the loader. The engine, the advisor and the handler are real.
- `red/before.txt`: on trunk `2732409d0` the diverged-copy case fails: `assemble_device_submission` refuses the
  rewritten copy (`artifactKind: 'none'`), while the advice reads the same project as producible
  (`canProduceOfficialEstar: true`). The control, where the filing agrees or was not compared, passes.
- `green/after.txt`: 2 of 2 pass. The advice's headline reads "Not yet assemblable for this 510(k) (device). The
  filed copy of section E1 is not the document's text …", and its blockers equal the engine's.
- The device neighbourhood passes: 31 files, 540 tests. It covers this test, the device tools' project-scope and
  admission suites, the advisor's suite, and the device-assembly and eSTAR engines' suites, including the eSTAR
  exits' pglite test.
- **Gates:** typecheck 0; ESLint ratchet unchanged; no tool definition changes, so the capability manifest does not
  move.

**User-visible:** asked whether a device project is ready to file, AnA no longer says an official eSTAR can be
produced while a section's filed copy is not the document's text. It names the section and says to re-file it, as
the exits do.

## 2. `create_labeling_document` and a deleted project: already refused, no change

**The handoff said** that `create_labeling_document` stores `program_id` without the project admission
`POST /api/mdx/labeling` makes (`admitProject`), so a deleted project is not refused.

**What the code does.** The tool is refused before its handler runs.
- Every AnA handler is registered through `registerToolHandler` (`AnaToolExecutor.ts`). Its wrapper runs
  `foreignProgramRefusal` (`server/services/ana/tool-record-scope.ts`) first, on every path: the stream, the agentic
  loop, MCP, and a tool calling a tool.
- That asks `programInOrganization` (`server/services/c2c/program-access.ts`) about every `program_id`,
  `programId` and `device_program_id` the call names. It is the same question the route's
  `admitProject` (`server/lib/admit-project.ts`) asks.
- By default that question admits only a live project (`deleted_at IS NULL`).
- So a deleted project's id is refused with `PROGRAM_NOT_IN_ORGANIZATION`, and nothing is written. An ownership
  check that cannot run is refused with `PROGRAM_CHECK_UNAVAILABLE`.

**Pinned since 2026-10-29** by `server/services/ana/__tests__/device-tools-admit-program.test.ts`, through the real
wrapper, the real `tool-record-scope`, the real `programInOrganization` and the real handler. Its case "refuses the
organization's own deleted project, and writes no row" passes on trunk for `create_labeling_document` and
`create_udi_record`: 16 of 16 (`item-2-pinned.txt`).

The admission therefore sits in one place for AnA's tools: the registry wrapper over `programInOrganization`. The
routes word the same answer through `server/lib/admit-project.ts`. No second copy is added to the handler, and
nothing is imported from a route.
