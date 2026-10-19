# Weekly periodic review: launch catalog, 2026-10-19

The weekly review `docs/LAUNCH_DEFINITION_OF_DONE.md` (operating cadence) requires. The last full review was
2026-10-08, so this one was due by 2026-10-15. Its subject is the change no periodic review had read:
**`e1f3fd425`** (2026-10-17, the `concept2cure` account, published through the GitHub app — 1,288 files,
+293,524 / −8,414, "Land audited service, governance, and UI integration remedies").

- **Head reviewed:** `9795a1e1e` (lenses), re-checked at `32d9ba953`+ by the reviewing session.
- **Lenses:** the four the cadence names, invoked by name, read-only: `security-auditor`, `part11-ux-auditor`,
  `honest-state-auditor`, `design-system-auditor`.
- **Scope:** the landing's diff (against its parent `4b0e3ff1e`), per lens:
  - security: 88 files (`server/routes`, `server/middleware`, tenant, vault, submission-gateways);
  - Part 11: 39 signing, QMS, authoring, IND and gateway files;
  - honest state and design system: 48 launch-catalog client surfaces.
  Each lens re-checked its findings at HEAD and states its own coverage at the end of its report.
- **Verification.** Every high or medium finding was checked by the reviewing session before being filed as
  confirmed — by reading the code at HEAD, re-running the lens's probe, or computing the contrast — not taken on the
  lens's word. Low findings were not independently verified.
- **Lane rule.** Fixes only in files outside another lane's 24-hour window; findings in live files go to that lane.
- **Rows informed:** D4, D5, D6. **No row turns green.**
- **Performed by:** session `…01VB8JEG` (claim in `docs/work-orders/README.md`).

| File | Lens |
|---|---|
| `security.md` | security and tenant isolation |
| `part11-ux.md` | 21 CFR Part 11 (no shell: attribution inferred, findings traced at HEAD) |
| `honest-state.md` | honest state (probes in `probes/`, red output in `probes/red-at-HEAD.txt`) |
| `design-system.md` | design system (gates run on exported parent, landing and HEAD trees) |

## Verdicts

| ID | Lens | App | Verified | Owner | What |
|---|---|---|---|---|---|
| **IAM-31** | security | Projects / AnA | **confirmed, raised to high** | **fixed here** | `PATCH /projects/:id/ownership-preferences` wrote `settings.customInstructions` — the text `getProjectInstructionsBlock` puts into AnA's prompt for every session on the project (`submission-chat-handler.ts:1488`, `chat/send-message.ts`) — with the router's org check only and no audit row. Any member, a viewer included, could rewrite a **private** project's AI instructions. Raised from medium: it is cross-user, persistent prompt injection on a launch surface, unaudited. |
| **L-1** | Part 11 | QMS controlled documents | **confirmed, high** | → `…01TTTQ1hp` (live in these files) | QMS approval's self-approval test reads `author_id` and recorded controlled-text contributors only (`document-approval-signature.ts:297`); for a document bound to Authoring, `authorizeQmsAuthoredSignature` asks whether the signer *may approve*, never whether they *wrote* the text. Whoever rewrote an SOP in the workbench can approve it. Fix in the lens report. |
| **L-2** | Part 11 | QMS change control | **confirmed, high** | → `…01TTTQ1hp` | `updateChange` (`changeControl.service.ts:193`) edits any non-deleted change whatever its status; the route's own comment says PATCH is for *draft* edits. An approved change can be re-classified and stays "approved", its signature appearing to cover the new text. A service-only fix would read a locked change as "not found"; the route (live) has to map it to 409, so both go together. |
| **DP-80** | security | Projects | **confirmed, medium** | **audit rows fixed here**; soft delete + required reason → **founder** | Visibility changes, member grants and member removal were authorized (`canManageProject`) but wrote no audit row; removal is a hard delete. Each now writes an UPDATE with the sharing state before and after. |
| **HS-F1** | honest state | Submission Center (gateway) | **confirmed by probe** | → `…01KZK3jgt` (`GatewayTransmittals.tsx` live) | Recording an agency receipt shows its outcome — "FDA transport rejected …", "did not reconcile a sequence attempt" — and the refresh it triggers unmounts the row and erases it. |
| **DS-F5** | design system | Submission Center (gateway) | **confirmed, 1.19:1 light / 1.09:1 dark** | → `…01KZK3jgt` | `var(--muted, inherit)` on the sequence, account and **§11.50 "signed · meaning:"** lines: `--muted` is defined (a surface tint), so the fallback never applies and the signature meaning shown back on each transmittal is invisible. `--text-300` gives 5.21:1 / 6.82:1; `--muted-foreground` only 3.37:1, below AA for 11px. |
| **HS-F2 / HS-F3** | honest state | Projects / Task board | **confirmed by probe** | → `…011Fyq3hX` (ProjectHome), `…011HLkYCa` (TaskBoard) | A partial read (one store unread) with nothing in the readable stores renders as "No tasks or approvals" / "No tasks on the board". |
| **L-3** | Part 11 | Authoring / QMS | confirmed (lens) | → trunk-CI keeper `…01YZFCXRX` and the Authoring lane | Why `ci:lineage-save-gate` is red: org-template document creation and QMS revise of a bound document copy content with no span lineage. Reachable; what it means for the record is in `part11-ux.md`. |
| **L-4 / DP-81** | Part 11 + security | Submission Center (gateway) | confirmed (two lenses independently) | → `…01KZK3jgt` | An unverified AS2 response (any HTTP answer, a proxy 502 included) is served as `provenance: 'agency'`; a receipt upload overwrites the earlier response. |
| **DS-F1** | design system | Authoring (protocol dev) | **confirmed** | **fixed here** | The protocol scope and protocol selects lost the class their style keys on (`.pde-picker`) when the landing moved them; they fell to the shell reset and read as bare text. |
| **DS-F4** | design system | QMS | **confirmed, 1.19:1 / 1.39:1** | → `…01YZFCXRX` (`quality/app.css` live) | The new QMS dialogs' field borders use `--bg-200` (3:1 required, WCAG 1.4.11; `--border-control` gives 3.91:1), and their footer buttons get zero padding (the landing's `:where()` edit is a no-op under `.c2c-v2 button`). |
| **Authoring honest reads** | honest state | Authoring | **confirmed: 13 of 13 erroring at mount**, and five more Authoring suites the same way (38 tests) | **fixed concurrently by `…011HLkYCa`** (`84b415e24`, 39 suites) | `documentAuthoringHonestReads.test.tsx` mocked `authService` without the `authService.getUser()` that `useAuthoringAssemblyBuild` began calling (`ad372567d`); no assertion in it could turn red. This session found the same in the editor, sources-rail, audit-rail, comment-thread and save-label suites, then found `84b415e24` had repaired all of them an hour earlier, and dropped its own copy rather than land a duplicate. |
| DS-F2, DS-F3, L-5 … L-10, IAM-32, IAM-33, HS-F4 … F7, DS-F6 | various | various | low or not verified | in the lens reports | |

**Decisions for the founder, raised by the lenses (not code):**
- **RULE 2.** `BlaAssessmentWorkbench` and `IvdAssessmentWorkbench` are new capability inside `nda-cockpit` and
  `ivd-completeness`, which are not launch surfaces (`isLaunchSurface` false for both).
- **Deletion rule.** The landing deleted the CMC change-to-Authoring simulator; its replacement,
  `CmcVariationAssessment`, renders only when `launchScopeEnforced === false`, so at launch the capability is gone with
  no reachable replacement. CLAUDE.md makes that a founder decision.
- **DP-80's remainder.** Whether removing a project member should be a soft delete with a required reason.

## What was fixed here, each shown failing first

| Finding | Change | Red → green |
|---|---|---|
| IAM-31 | `concept2cure.ts`: the PATCH carries its sibling PUT's `projectRecordAdmission(true)` and writes the same `logAuditEntry` UPDATE (before/after), disclosed as `meta.auditTrail` | 5 new cases red on the unfixed route (a member never shared on the private project, a read share and a viewer-with-edit-share all got 200 and changed the instructions; the owner's change wrote no row); green after. Probes: guard removed → the 3 refusals fail; audit stubbed → the audited case fails |
| DP-80 | the three sharing routes write an UPDATE with the sharing state before and after | member-removal audit stubbed → its case fails |
| DS-F1 | `ProtocolDevSelection.tsx`: the bar carries `pde-picker` again, reviving the dead rule rather than minting CSS (so the text ramp does not go stale) | new structural test: class removed → fails |

The project-audit harness (`o01-core-project-audits.pglite.test.ts`) never exercised the ownership-preferences
route, so it lacked four tables `getOwnershipDerivationData` reads; they are now created from the canonical DDL and
the real `phase13` migration. One harness default was corrected in the new cases: `app()` claims `admin`, and
production's `authMiddleware` re-reads the role from `organization_users` on every request, so the refused-caller
case is given the role that user actually holds.

**Regression check.** The whole route suite (`server/routes/__tests__/`, `tests/routes/`; 652 files, 6,581 tests) was
run with these changes: 51 failures in 14 files, all in Authoring, QMS, report-os and chat routes, none importing
`concept2cure.ts`. With the changes stashed, the same 14 files fail the same 51 tests on the unchanged head, so they
predate this change and belong to trunk's red (below), not to it.

## Lens claims checked and set aside

- *Security, DP-80:* "only an owner, creator, or admin can change sharing" — right, and confirmed; a first test
  appeared to show a share-holder changing visibility, which turned out to be the harness's `admin` claim, not the
  route (production resolves `req.userRole` from the database).
- *Design system, F5's fix:* `--muted-foreground` does not meet AA at 11px; `--text-300` does (computed above).

## Not covered

- Everything in each lens report's coverage section, notably: the 136 other client files and ~1,100 server/shared
  files of the landing outside the four scopes; no browser rendering; no live database, IdP or AS2 counterparty.
- Trunk CI is red (no green run since 2026-09-23); the trunk-CI keeper `…01YZFCXRX` owns it and was not raced.
  `ci:eslint-ratchet` is 223 under its baseline; left for the keeper, so as not to fail in-flight pushes.
