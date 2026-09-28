## Microcopy lens: launch catalog, periodic review 2026-09-28

Auditor: this session, read-only, no gate run with `write-baseline`. Head reviewed: `aff7eae16`
(`concept2cure-v2`).

### Scope actually covered

The six launch apps resolved from `shared/constants/launch-scope.ts` → `client/src/concept2cure/v2/surfaceViews.ts`, cross-checked against last week's `../2026-09-24/microcopy.md` scope list:

- **Priority (owed — never swept for Part 11/honest-state in the 09-24 run, so given first pass here too):** Authoring (`DocumentAuthoring.tsx` + `editor/DocumentWorkbench.tsx`, `TemplateLibrary.tsx`, `Review.tsx`, `BiopharmaProject.tsx` / RegulatoryWorkspace, `ProtocolDev.tsx` + its eleven split files `ProtocolDevDesign/Projections/Derivation/Forms/Section/Soa/Workspace/Shared/Compliance/Registers/Reviews.tsx`), Submission Center (`SubmissionCenter.tsx`, `DossierMap.tsx`, `EctdCompile.tsx`, `EctdCoauthor.tsx`, `PublishingCenter.tsx`, `GatewayTransmittals.tsx`), Submission Readiness (`DispatchReadiness.tsx`), QMS (`QmpWorkspace.tsx`, `QualityModule.tsx`).
- **Spot-checked for regression, not exhaustively re-read:** Projects (`TaskBoard.tsx`, `AuthoringFilingBar.tsx`, `AuthoringPlaceIntoFiling.tsx`, `AuthoringSignatures.tsx`) and Vault, since last week's microcopy report already swept them clean/fixed.

### What I did NOT get to

No pass this run over `AuthoringCollab.tsx`, `AuthoringRevisionDiff.tsx`, `AuthoringExports.tsx`, `AuthoringAiDraft.tsx`, `AuthoringCreateExport.tsx`, `ReviewThreads.tsx`, the remaining `editor/*` files beyond `DocumentWorkbench.tsx` (`FileToVaultDialog.tsx`, `ProjectFilesPanel.tsx`, `ReviewTasksPanel.tsx`, `RichSectionEditor.tsx`, `DocumentCanvas.tsx`, `AssignReviewDialog.tsx`), or Vault/Projects surfaces beyond the spot-check named above (`Vault.tsx`, `ArtifactsCenter.tsx`, `Projects.tsx`, `ProjectHome.tsx`, `BiopharmaJourney.tsx`, `FilingsCatalog.tsx` were not re-read this week — last week's report marked them clean and I found no signal to doubt that, but I did not re-verify them line by line). AnA voice / chat-response phrasing was not separately audited beyond the strings incidentally read. No gate (`check:microcopy`, `ci:internals-in-copy`) was run — read-only, no write-baseline, per the harness instruction.

### Reverified (from `../2026-09-24/microcopy.md`)

Both of last week's findings were already recorded as **fixed** in that same report ("this run"), so there was nothing left open to carry forward. I re-verified both hold at head:

- **M1** (eight unredacted catch blocks) — **closed, holds.** `EctdCompile.tsx:963`, `DispatchReadiness.tsx:235`, `TemplateLibrary.tsx:357,388,437`, `GatewayTransmittals.tsx:368`, `Review.tsx:652,684` all still read through `redactInternals(e instanceof Error ? e.message : '', fallback)`.
- **M2** (Project/programme inconsistency in `TaskBoard.tsx`) — **closed, holds.** No live string in the file says "programme"; only historical comments about a removed fixture remain.

No 2026-09-26 microcopy report exists to reverify against — that week's periodic review ran the security lens only (see `../2026-09-26/README.md`).

### New findings this week

Three new defects, none overlapping the above. Numbered M-0928-1 … M-0928-3, full detail (file:line, exact failure, concrete fix) in the structured findings.

1. **M-0928-1 (high, Submission Center).** `GatewayTransmittals.tsx:172` — `readData()`'s bare `catch { return { ok: false, status: 0, data: null, raw: null }; }` swallows the actual HTTP status and body whenever `apiRequest` throws (every non-2xx status except 401). Every specific-refusal branch downstream (409 "already active, roll it back first", 412 "gateway credentials are not configured", 422 "the structural gate rejected the bundle: …", 404, 400 across `transmit()`, `assemble()`, the regulatory-identifiers update and `rollback()`) is dead code as a result; the user gets a generic, factually wrong "Transmit failed (HTTP 0) — nothing was sent" no matter what actually happened. This is a governed agency-transmit action — losing the specific reason is exactly the failure mode the skill's rule 2 ("Specific over Generic") and rule 6 ("Errors Explain + Act") exist to catch, and it is reproducible on any real refusal from this endpoint.
2. **M-0928-2 (medium, Authoring — Protocol development).** Seven Protocol Development files (`ProtocolDevWorkspace.tsx:351`, `ProtocolDevDesign.tsx:74,147,182`, `ProtocolDevProjections.tsx:258`, `ProtocolDevDerivation.tsx:300,380`, `ProtocolDevForms.tsx:363,388`, `ProtocolDevSection.tsx`/`ProtocolDevSoa.tsx`'s shared helper) still use the pre-M1-fix pattern — `e instanceof Error ? e.message : String(e)` with no `redactInternals` — none of the seven import it. Server-status failures are mostly filtered upstream by `apiRequest` already, but a network-level failure (fetch rejecting before any response exists) throws a raw browser `TypeError` that reaches the screen unredacted, the same leak class M1 fixed in five sibling files. Protocol development joined the launch catalog's Authoring app on 2026-09-21, after M1's sweep scope was fixed, and was evidently missed by name (only "ProtocolDev" was listed in scope; the surface is actually split across eleven files).
3. **M-0928-3 (low, Submission Center — Publishing center).** `PublishingCenter.tsx:328` ("No spec versions") and `:366` ("No v3.2.2 coded-attribute lists were returned") are bare `EmptyState` titles with no `hint`, unlike every other loading/error/empty state in the same file, which all explain what happened. Minor, in-file inconsistency rather than a systemic gap.

### Clean, read this run

`DispatchReadiness.tsx` (exemplary honest-state and gate copy — not cheerleading anywhere, distinguishes "unanswered" from "cleared" throughout), `SubmissionCenter.tsx`, `DocumentAuthoring.tsx` + `editor/DocumentWorkbench.tsx` (the empty-state history comment at line 2945 shows deliberate, considered copy work), `EctdCoauthor.tsx`, `DossierMap.tsx`, `Review.tsx` (beyond the already-reverified M1 lines), `TemplateLibrary.tsx` (beyond M1), `QmpWorkspace.tsx` (archive/delete confirmations name the plan and the exact consequence — a model of rule 8), `AuthoringSignatures.tsx`, `AuthoringFilingBar.tsx`, `AuthoringPlaceIntoFiling.tsx`, `TaskBoard.tsx` (beyond M2), most of `GatewayTransmittals.tsx`'s and `BiopharmaProject.tsx`'s user-facing strings (the M-0928-1 defect is a status-handling bug with a copy consequence, not a copy problem in the strings themselves — each individual toast string, read on its own, is fine).

---

## Independent verification (2026-09-28)

Each high, medium or blocker finding above went to a separate agent told to refute it (read the code at head, trace the real call path, reproduce where possible; default to refuted). Low findings were not independently verified.

### M-0928-1 — **confirmed**

The defect is real. I reproduced it at aff7eae16 through the real call path, not a mocked apiRequest.

1. The surface is reachable in the launch catalog. `gateway-transmittals` is listed under Submission Center in shared/constants/launch-scope.ts:90 (surfaces) and :98 (modules). It sits in the 'Submit & file' nav groups at client/src/concept2cure/v2/registryModel.ts:564 and :592, and is mounted from client/src/concept2cure/v2/surfaceViews.ts:574.

2. The code at head matches the report. In client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx:167-172, readData wraps `apiRequest` (imported from '@/lib/queryClient' at :45) and ends in a bare `catch { return { ok: false, status: 0, data: null, raw: null }; }`. The real `apiRequest` in client/src/lib/queryClient.ts:406-424 throws `new ApiRequestError(message, response.status, errorPayload, code, correlationId)` for every non-ok status except 401. `ApiRequestError` exposes `.status` and `.payload` (queryClient.ts:9-21). No other layer catches or unwraps the error first.

3. The server really sends those statuses as JSON through clientError: 412 (credentials) at server/routes/mdx-submission-gateway.ts:302/335, 422 (structural gate, with findings) at :305, 409 (active transmittal) at :432, plus err.httpStatus passthrough at :296.

4. The callers have branches they can never reach. transmit checks 409/412/422 at GatewayTransmittals.tsx:286/295/296. The regulatory-identifiers update checks 400/404 at :380/381. assemble checks 404/409/400/422 at :461-464. rollback's `!ok` message at :556 prints 'HTTP 0' and never shows the server's reason. Only the 401 branches (:285, :555) can fire. The preflight message at :432 uses pf.status and pf.raw, so it also renders 'HTTP 0' with no error text.

5. Why the existing test hides it: client/src/concept2cure/v2/__tests__/gatewayTransmittals.test.tsx:21-24 mocks apiRequest. The 409 case (:156) and the 422 cases (:176, :329, :347, :369) make that mock resolve `{ok:false,status:409/422}` instead of throwing, which the real apiRequest never does. So the tests pass while production behaves differently.

6. Reproduction. I wrote a scratch vitest outside the repo (/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/775f1443-a7b0-541b-9be8-95d919c4cef5/scratchpad/m0928-1/repro.test.tsx). It keeps the real apiRequest, stubs global fetch to return JSON bodies with status 412, 409 and 422 for the transmit POST, and stubs only C2CForm. Observed toasts:
STATUS 412 => Transmit failed (HTTP 0) — nothing was sent.
STATUS 409 => Transmit failed (HTTP 0) — nothing was sent.
STATUS 422 => Transmit failed (HTTP 0) — nothing was sent.
The server's specific refusal (credentials not configured / transmittal #7 holds the lock / structural-gate findings) never reaches the user. The 422 findings card (setRefusal) is never populated. The toast shows a status the server never sent.

Severity: I agree with high. This is a governed agency-transmit surface in the launch catalog. The user is shown a made-up status instead of the server's actual reason, which breaks the fail-closed, honest-state rule in CLAUDE.md. No repo files were edited.

### M-0928-2 — **refuted**

Checked at head aff7eae16. The code pattern is there as described, but the failure it claims cannot be demonstrated, and the proposed fix would change nothing on screen.

1. Server refusals are already filtered. Every call site named goes through `apiRequest` (client/src/lib/queryClient.ts:362). For any non-ok status except 401, it throws `ApiRequestError`:
   - a JSON body's text is passed through `extractApiError` → `serverMessage`, which drops error codes and internal text (lines 211-212);
   - a non-JSON body is replaced by `fallbackMessage(status)`.
   So the `e.message` these catches show is already clean.

2. The only path left is the one the finding names: `fetch` itself rejecting, at queryClient.ts:385. That gives a native `TypeError` with text like "Failed to fetch", "NetworkError when attempting to fetch resource." or "Load failed". I ran the real `INTERNAL_MARKERS` and `redactInternals` code from queryClient.ts:64-121 under node on those three strings. All three come back unchanged. None of them contains SQL, a table name, a file path, an env var, an `/api/` route, a stack frame or an `E*` socket code, so no marker matches.

   Result: wrapping these catches in `redactInternals(..., fallback)` gives byte-identical output for the stated failure. The "same class M1 fixed" framing does not hold either. The M1 sites (EctdCompile.tsx:963, TemplateLibrary.tsx:357/388/437, GatewayTransmittals.tsx:368, Review.tsx:652/684, DispatchReadiness.tsx:235) also let "Failed to fetch" through; `redactInternals` only swaps in the fallback for empty or internal-looking text.

3. "Failed to fetch" is not an internals leak. It exposes no route, schema, path or secret. At most it is a copy-quality nit (vague wording), which the medium-severity information-disclosure framing does not support.

Adjacent, not the reported defect: `apiRequest` resolves rather than throws on a 401. On that branch the per-file `refusal()` / `detailOf()` helpers read the body directly, bypassing `serverMessage`:
- ProtocolDevWorkspace.tsx:158-164
- ProtocolDevDesign.tsx:44-49
- ProtocolDevProjections.tsx:~177
- ProtocolDevDerivation.tsx:~85
- ProtocolDevWrites.ts:73-80

A bare `error` code string such as 'UNAUTHORIZED', or the text `HTTP 401`, can then reach a toast. `redactInternals` would not catch "UNAUTHORIZED Nothing was written." either (I tested it: returned unchanged). It catches "HTTP 401 …" only when the string starts with it, and ProtocolDevWorkspace's "The protocol was not exported — HTTP 401. …" also passed through unchanged in the test. The fix there would be to route those helpers through `serverMessage`/`extractApiError`, not to add a `redactInternals` wrapper. That would be a separate finding, and it is not established here.

### M-0928-3 (low) — not independently verified

