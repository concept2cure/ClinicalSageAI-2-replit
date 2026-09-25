# Weekly review, second pass, 2026-09-24: re-verification and the other three lenses

`security.md` in this folder covers the security lens and nothing else. This file covers
the rest of the weekly cadence:

- the sixteen findings from 2026-09-22, each re-checked at head;
- the Part 11, honest-state and design-system lenses, as far as they ran;
- two security findings the first lens did not raise. They go in the one register as
  DP-34 and DP-35.

- **Head:** sweeps run at `5117c0cf`. Every verdict below was re-read at `dac69d76` (the remote
  head, 2026-09-25 early UTC) before filing.
- **Rows informed:** D2 (honest states on launch surfaces), D5 (governed writes), D3.
  No row turns green.
- **Performed by:** the periodic-review session `session_015oLV2vDRUbUF8eLLs8zyGt`.
- **Method:** the same as 2026-09-22.
  - Agents re-verified each finding group against the code.
  - Each lens swept its app groups.
  - Every new critical or high finding went to a second agent told to refute it.
- **Not everything ran.** Seven of eighteen agents stopped on a session limit, as listed
  below. Where an agent's verification was lost, this session read the cited code itself
  before filing. Any lens that did not run is listed as **not run**, never as clean.

## Coverage

| Lens | Group A: Projects, Tasks, Vault, Admin, QMS | Group B: Authoring, Submission Center, Readiness |
|---|---|---|
| Re-verify of 2026-09-22 | ran, all 16 | (same run) |
| Part 11 | swept; verification lost, re-read by hand | **not run** |
| Honest state | swept; verification lost, re-read by hand | **not run** |
| Design system | **not run** | **not run** |
| Security (second pass) | swept, adversarially verified | swept, adversarially verified |

Nobody has swept Group B under Part 11 or honest state this week, and nobody has swept the
design system anywhere this week. The next review owes those first. For the design system,
another session this evening ran a token sweep and fixed one class of defect (`02beeb59`,
six phantom tokens). That covers one defect class, not a lens.

## Re-verification of the sixteen 2026-09-22 findings

| Id | Sev | Verdict at `dac69d76` | Evidence |
|---|---|---|---|
| P1 | critical | **holds fixed** | `protocol-development.ts:496-518` and `protocol-reviews.ts:165-195` run `signProtocolAct` (reauth, SoD before the write, ledger row and `electronic_signatures` row on one client). The AnA `finalize_protocol_document` returns `signatureRequired`. |
| T1 | critical | **holds fixed** | Eight sites write through `auditTaskActionInTx` on the write's transaction. The ninth (notify) checks `audit.recorded` and answers 500 `AUDIT_WRITE_FAILED`. |
| P2 | critical | **holds fixed** | `quality-management-api.ts:629,703,835` take a reason and write through `governedQmsWrite` (BEGIN, tenant, write, ledger, COMMIT). |
| P3 | critical | **holds fixed** | `contradiction-engine-service.ts:804-917`: a reason of at least 8 characters, `FOR UPDATE`, and the ledger row inside the transaction. |
| T2 | high | **server fixed; UI half open** | 13 `requireEditorAccess` gates, and the `viewer` role is excluded. But `TaskBoard.tsx:745-746` still offers *Start workflow* and *New task* to everyone, and `:895-896` disables the move controls by status only. A viewer is refused only after acting. |
| P4 | high | **holds fixed** | `submission-package-orchestrator.ts:996-1017` selects the signer, title, meaning and time, and `EctdCompile.tsx:1457-1481` renders them. |
| T3 | medium | **holds fixed** | `archive()` (`TaskBoard.tsx:1131-1134`) and `sign()` (`:1349-1354`) handle the 401. |
| T4 | medium | **holds fixed** | `archiveTaskSchema` is `z.string().trim().min(3).max(1000)`, the same bounds as the UI. |
| P5 | medium | **open** | `authoring.router.ts`: the section save (`:1645`), freeze (`:3673`) and review verdict (`:2710`) validate no reason. The freeze falls back to a canned `'Document frozen for compliance'`. |
| D1 | medium | **fixed tonight** by `02beeb59` (another session) | `Review.tsx` now reads `var(--error)` |
| D2 | medium | **fixed tonight** by `02beeb59` | `TaskBoard.tsx` no longer references `--danger` |
| D3 | medium | **open, and wider** | `Vault.tsx:224` `I.chevronRight \|\| '›'` and `:1052` `I.upload \|\| I.plus`. Neither key exists in `v2/icons.tsx` (`chevRight` does). The same miss occurs at `:227` (`I.folderOpen`) and `:277,290,301` (`I.inbox`), so the open-folder and data-room icons never render. |
| P6 | low | **open** | `DocumentWorkbench.tsx:4270-4276`: Revert has no `disabled`, although `docSealed` (`:868`) already disables Save and Insert. |
| P7 | low | **open** | `ProjectHome.tsx:1073` renders `'User ' + a.actor_id`. `c2c/projects.ts:1302-1311` joins no user name. |
| D4 | low | **open** | `ProjectHome.tsx:432,467` use `var(--border,#d0d5dd)` and `:781` uses `var(--border-subtle,#eaecf0)`. These cool-grey fallbacks disagree with the warm declared tokens. |
| V1 | low | **open** | `Vault.tsx:1428,1452,1465` send no `note`, so `vault-placement.service.ts:185-189` records a canned sentence as the rationale. |

**Summary:** 7 hold fixed, 2 more were fixed tonight by another session, 1 is half fixed,
and 6 are open. None regressed in code that had been fixed.

Residuals the re-verifiers found outside what the findings named, recorded so they are not
lost:

- **Protocol consent-form approve and deviation close write a `sign` ledger row through
  plain `governed()`.** The sites are `protocol-consent.ts:157` and
  `protocol-deviations.ts:192`. Both are already baselined as DEFECT in
  `sign-ceremony-baseline.json:64-70`. No client calls either one.
- **The AnA command executor's task writes**
  (`ana-ri/command-executor.ts:1021,1302`). `docs/work-orders/README.md` item 1 records
  these as done tonight.
- **`contradiction-consequence-service.ts:680-682`** writes `review_state='under_review'`
  with no ledger row. It is not gate-clearing, and `9f3f40d72` already disclosed it.

## New findings

### HS-1: High, QMS: a failed read of the controlled-document register renders as a clean register

- **Where:** `client/src/concept2cure/quality/SopRegister.tsx`, `ChangeControl.tsx` and `App.tsx`.
- **What is wrong:** `useSopRegister`, `useReviewDue`, `useTrainingCompliance` and
  `useChangeRegister` each compute an `error` (`quality/hooks.ts:84,112,141`,
  `changeHooks.ts:110`), and neither pane reads it:
  - `SopRegister.tsx` contains no reference to any hook's `.error`.
  - `App.tsx:300-309` passes `ChangeControl` no error.
- **What the user sees:** with sample mode off, `useSampleRows(null, …)` returns `[]`, so a
  401, a 500 or a network failure renders as a clean register:
  - *Effective documents 0*;
  - *Review overdue 0 — All current*, in the green tone;
  - *No documents due for review.*;
  - *No training-controlled documents yet.*;
  - on the change-control tab, *No changes at this stage.*
- **The failure is detected but never shown.** AnA's page context in the same file already
  says *"a failure, not an empty log"* (`App.tsx:228-231`), and the change-control KPI strip
  says *"Change-log totals are unavailable"*. The table directly beneath that strip then says
  there is nothing to show.
- **Why this matters:** the working agreement says an error is never rendered as an empty
  result. A QA lead looking for overdue periodic reviews is shown a green all-clear by an
  outage.
- **Status:** fixed in this session's next commit (see the commit that names HS-1).

### PX-1: Medium, Vault: *Place into submission* records no reason

- **Where:** `v2/surfaces/VaultPlaceIntoSubmission.tsx`, rendered at `Vault.tsx:1084`.
- **What is missing:**
  - The dialog collects a sequence, section and lifecycle operation, and no reason.
  - `upsertLeafSchema` (`server/routes/submissions.ts:181-203`) has no `reason`.
  - The `LEAF_UPDATED` audit row (`submission-service.ts:2015-2022`) records
    `{ sectionCode, lifecycleOp }`, which says what changed but not why.
- **Why it matters:** the write decides which content goes into a regulator-facing eCTD
  sequence. The dialog's own note says *"audited and org-scoped"*.
- **Status:** open. The same service carries AnA's `place_into_sequence` and the IND and
  CMC placements, so the reason belongs in `upsertLeaf`, not in the dialog alone.

### Part 11 change-control approval: this is DP-31, not new

The Part 11 sweep independently re-found DP-31: *Advance* on a change hands AnA a prompt
promising an e-signature, and no signature is captured. It adds one fact DP-31 does not
state. Even a compliant server could not be rendered in the log: the client's
`ChangeControl` row type (`quality/changeData.ts:46-60`) has no approver, approval time
or meaning field. P1-28's fix needs a client half.

### DP-34: Medium, QMS: `/api/qms/*` is a second QMS write API with no role gate and, for most writes, no audit row

- **Where:** `server/routes/qms.ts`, mounted at `register-document-routes.ts:270` with no
  group middleware. Its only guard is `authenticateToken`.
- **What it allows:** any member of the organisation, a `viewer` included, can do all of the
  following.
  - `POST /documents/:id/transition {to:'retired'|'superseded'}` takes an **effective**
    controlled document out of force.
    - No reason field exists.
    - No signature is captured.
    - `superseded` sets no `superseded_by_id` (`qms.service.ts:61-89`).
  - `POST /suppliers/:id/approval` requalifies or revokes a supplier. It writes **no audit
    row** (`qms.ts:148-159`, `qms.service.ts:150-162`).
  - `POST /nonconformances/:id/disposition` disposes of nonconforming product (use as is,
    rework, scrap and so on). It writes **no audit row**.
    - An omitted rationale keeps the previous disposition's text
      (`COALESCE($2, disposition_rationale)`).
    - The old justification then appears to justify the new decision.
  - `POST /training`, `/suppliers`, `/audits`, `/management-reviews` and `/nonconformances`
    write no audit row either.
- **Why it is medium, not high:**
  - Every write stays inside one tenant.
  - The canonical `/api/mdx/qms/*` doors allow the same state changes to a member. They are
    DP-31 and DP-32, and they do write audit rows.
  - No client calls this router.
  - So the harm is untraceable QMS changes by a deliberate insider, not escalation.
- **Already known as a duplicate:** `docs/work-orders/README.md` item 4 and
  `D5-AUDIT-OUTCOMES/2026-09-24/README.md:124` record it as a zero-duplication violation.
  They leave deletion to "its owner". This finding records what the duplicate permits.
- **Adversarial verification:** confirmed, and rated down from high to medium by the
  refuting agent.
  - The refuting agent confirmed no audit trigger on `qms_suppliers` or
    `qms_nonconforming_products`.
  - `applyAuditTrailMiddleware` does not run in the deployed configuration (DP-06).

### DP-35: Medium, Authoring: freeze makes a document "finalized" with no re-authentication and no signing-authority check

- **Where:** `POST /api/authoring/docs/:docId/freeze` (`authoring.router.ts:3673-3880`).
  - **Who may call it:** a document OWNER, which every creator becomes by trigger, or an
    APPROVER (`authoringObjectAuthorization.ts:35`).
  - **What it does not call:** `assertSigningAuthority` (`:591`) or
    `reverifyAuthoringSigner` (`:781`). Both sibling handlers call them: `/e-sign`
    (`:3901,3923`) and `/sign` (`:5526,5548`).
- **Why it matters downstream:**
  - FROZEN is a locked state (`document-lock.ts:55`).
  - It maps to coauthor `finalized` (`coauthor-snapshot.ts:101-103`).
  - The eCTD leaf-completeness check counts that as approved
    (`leaf-source-resolver.ts:140`, `assemble-from-core.ts:131-135`), and the IND checklist
    counts it as COMPLETE (`ind-checklist-view-assembler.ts:71-102`).
  - So one author, with no re-authentication, can move a document into a state that satisfies
    the per-leaf approval checks. A stolen session can permanently lock any document its
    victim owns, because the router has no unfreeze.
- **Why it is medium, not high:**
  - Freeze writes no signature, so it is not a §11.200 bypass.
  - The actor comes from the verified JWT, and the chained audit row commits in the same
    transaction.
  - Release to the agency is still gated by `reverifySigner` plus `isSigningAuthorized`
    (`submission-sign-release.ts:182,262`).
- **Already open for a founder decision:** the same assembler file already states that
  *"freezing needs no signature"* and leaves whether an unsigned freeze should count as
  complete for the founder to decide. This finding is the security half of that decision.

### Re-verified unchanged, already registered

The Group B security sweep found these still open at head, and each is already on the
register:

- **DP-07:** the AI-draft path's Data Room retrieval (`authoring.router.ts:2871`) embeds
  through `enhancedEmbeddingService`, outside the gateway.
- **DP-16:** raw `INSERT INTO authoring_signatures` in the route file at `:3962` and
  `:5575`.
- **IAM-14:** the template-library upload trusts the client filename
  (`c2c/templates.ts:40`).
- **DP-33:** unchanged.
