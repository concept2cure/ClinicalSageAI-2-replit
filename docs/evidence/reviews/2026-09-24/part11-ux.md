# Part 11 UX lens: launch catalog, 2026-09-24 (run 2026-09-25 01:10 UTC)

Auditor: `part11-ux-auditor` (`.claude/agents/part11-ux-auditor.md`), read-only. Head reviewed:
`f14f5510` (`concept2cure-v2`). Its report is condensed here with every finding kept.

## Scope

Resolved via `client/src/concept2cure/v2/LaunchScopeGate.tsx`, `shared/constants/launch-scope.ts`
(`LAUNCH_APPS`) and `client/src/concept2cure/v2/surfaceViews.ts`, matching last week's table. One
scope change since 2026-09-22: `launch-scope.ts:101-114` now limits Submission Readiness to
`dispatch-readiness` only — `Inconsistency` / `Orchestration` (P3's surface) are no longer
launch-scoped, though the components remain registered in `surfaceViews.ts:477,507` and should be
caught by `LaunchScopeGate` (not independently re-verified).

## Findings still real at head, most severe first

| # | Sev | App | Finding | Where | Requirement | Status |
|---|---|---|---|---|---|---|
| Q1 | **blocker** (new) | Authoring | Review quorum is not bound to the version it approves. `PUT …/artifacts/:artifactId` blocks edits only when `status==='locked'`; an artifact in `status='review'` can be edited — `version` bumps, `status` is untouched. `reviewQuorumVerdict` checks completion and decisions by `review_round` only, with no version argument. Both governed acts (review→approved, and `approve-artifact`) call it, then stamp `approvedVersionId = artifact.version` — the version current now, not the one reviewers decided on. A reviewer approves v1; an editor bumps to v2; the approver approves; v2 is recorded and filable and no reviewer saw it. | `server/routes/c2c/artifacts.ts:758-793,832,903-933,2682-2699`; `server/services/artifact-approval-act.ts:48-94`; `server/routes/authoring-actions.ts:794-907` | §11.10(a)/(e) | open → follow-through |
| Q2 | **blocker** (extends P5 / handed-off) | QMS | `POST /api/mdx/qms/documents/:id/retire` has no role gate (only `approve` checks org role in that file); `reason` is `string \| null`, unenforced; `create`/`patch`/`revise` have no role gate either. The client sends retire as a free-text prompt into AnA chat ("Ask me for the reason … then move it to retired") rather than a governed dialog. The AnA tool `retire_qms_document` takes the same unenforced reason and, when none is given, writes `'Controlled document retired via AnA'` into the hash-chained ledger — a placeholder that reads as a real reason. | `server/routes/mdx-qms.ts:680-710` (vs `:510-546`); `client/src/concept2cure/quality/SopRegister.tsx:373-384`; `server/services/ana/AnaToolExecutor.ts:13649-13683` | §11.10(e)/(g); skill hard rules 2/4 | open → follow-through |
| Q3 | medium (P5, worse variant) | Authoring | Reason-for-change is still client-only on three endpoints. Section save: `changeReason` accepted as any string or `null`, no minimum. Freeze: `frozen_reason` nulls an empty reason, but the hash-chained `createAuditTrail` row writes `reason \|\| 'Document frozen for compliance'` — a canned sentence in the Part 11 ledger when no reason was given, the "reason field the server ignores" anti-pattern. Review verdict: `review_comments` used raw with zero validation (client requires ≥8). `protocol-development.ts:92` already does `z.string().trim().min(8)`. | `server/routes/authoring.router.ts:1907-1923, 3676,3815-3838, 2710-2781`; `AuthoringFilingBar.tsx:99`; `DocumentWorkbench.tsx`; `Review.tsx` | §11.10(e) | open → follow-through |
| Q4 | gap (P7) | Projects | Activity feed shows `'User ' + a.actor_id`, a bare id. The server selects `COALESCE(al.actor_id, al.user_id) AS actor_id` with no join to `users`, which `c2c/projects.ts:554,940,1118` already do elsewhere in the same file. | `client/src/concept2cure/v2/surfaces/ProjectHome.tsx:1073`; `server/routes/c2c/projects.ts:1301-1307` | §11.10(e) attribution | open → follow-through |
| Q5 | gap (V1) | Vault | Filing / "Move to…" confirm captures no reason. Write is audited, atomic, reversible — affordance gap only. | `client/src/concept2cure/v2/surfaces/Vault.tsx:1422-1450` | §11.10(e) | open |
| Q6 | gap (P6) | Authoring | Revert is not disabled on a sealed document; the server refuses with `DOCUMENT_FROZEN`. Affordance gap only. | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:4270-4276` | role-scoped visibility | open → follow-through |

## Confirmed fixed at head (from 2026-09-22)

- **P1** Authoring finalize / disposition run `signProtocolAct` (`protocol-signature.ts:142-221`): re-auth, SoD, `electronic_signatures` row, one transaction; UI through the shared `EsignModal`. Fixed.
- **P2** QMP create / patch / delete route through `governedQmsWrite` / `recordGovernedAction` with a required ≥8-char reason client and server (`quality-management-api.ts:629-698`; `QmpWorkspace.tsx:86-246`). Fixed.
- **P3** Contradiction resolution renders the server's `resolvedBy` (`Inconsistency.tsx:114-296`); server audits the write. Now outside `LAUNCH_APPS` (scope note above). Fixed regardless.
- **P4** eCTD release-signature panel shows signer name/title, `signedAt` and `signatureMeaningLabel` (`EctdCompile.tsx:1069,1459-1481`). Fixed.
- **T1** Task ledger writes use `auditTaskActionInTx` in the route's own transaction (11 call sites; `task-audit.ts:248`). Fixed.
- **T2** Every task-write route carries `requireEditorAccess` (`taskManagement.routes.ts:181…1535`). Fixed.
- **T3** 401 handled explicitly at every task write site (`TaskBoard.tsx:499-545,1131-1134,1349,1473,1563-1655`). Fixed.
- **T4** `archiveTaskSchema` requires `z.string().trim().min(3)` server-side. Fixed.

## Not independently re-traced this run

- Handed-off items #6 (MCP connector accepts suspended accounts), #9 (file-to-vault orphan row),
  #13 (AnA default-module misread) from `../2026-09-22/follow-through/README.md` — outside this
  pass's time budget; still listed open there.
- The AnA tool path for QMS beyond `approve_qms_document` / `retire_qms_document` (for example
  `revise`) was not traced for the same role-gate gap as Q2; worth the same check.
