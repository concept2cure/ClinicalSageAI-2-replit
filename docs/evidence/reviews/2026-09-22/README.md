# Weekly periodic review: launch catalog, 2026-09-22

The first run of the review the DoD requires weekly (`docs/LAUNCH_DEFINITION_OF_DONE.md`,
operating cadence): *"run the repo's Part 11 UX, honest-state, design-system and
security auditors on the launch catalog; file their reports as periodic-review
evidence under `docs/evidence/reviews/`."* The folder did not exist before this.

- **Head reviewed:** `f9a948422` (remote `concept2cure-v2`, 2026-09-22 ~23:20 UTC)
- **Rows informed:** D2 (launch catalog), D3 (tenant isolation), D5 (Part 11
  evidence). No row turns green as a result; one row's progress note overstates
  where it stands (see *What this changes*).
- **Performed by:** a control-tower session that runs the auditors, re-verifies
  every critical and high finding by reading the server path itself, and runs the
  security gates by hand.

| File | Lens |
|---|---|
| `part11-ux.md` | Part 11 / GxP compliance UX |
| `honest-state.md` | honest state: sample vs live, failed vs empty, unassessed vs clear |
| `design-system.md` | design-system conformance and its gates |
| `security.md` | security and tenant gates (no security auditor exists; see *Gaps*) |

## Scope

Scope is `shared/constants/launch-scope.ts` (`LAUNCH_APPS`), resolved to
components through `client/src/concept2cure/v2/surfaceViews.ts`.

| App | Surface files |
|---|---|
| Projects | `Projects`, `ProjectHome`, `BiopharmaJourney`, `FilingsCatalog`, `TaskBoard` (the `tasks` surface) |
| Vault | `v2/surfaces/Vault.tsx` (the `vault` surface), `ArtifactsCenter` in `AdminSurfaces.tsx` |
| Authoring | `DocumentAuthoring`, `TemplateLibrary`, `Review`, `BiopharmaProject`, `ProtocolDev` |
| Submission Center | `SubmissionCenter`, `DossierMap`, `EctdCompile`, `EctdCoauthor`, `PublishingCenter`, `GatewayTransmittals` |
| Submission Readiness | `DispatchReadiness`, `Orchestration`, `Inconsistency` |
| QMS controlled documents | `quality/QualityRoute.tsx` → `App`, `SopRegister`, `ChangeControl`; `QmpWorkspace` |

### Scope correction (made during the review)

The control tower's first brief said the launch `vault` and `tasks` surfaces were
the device-kit components `mdx/surfaces/VaultSurface.tsx` and `TasksSurface`
(`mdx/workbench/Workbench.tsx`). **That was wrong.** `SURFACE_VIEWS.tasks` is
`TaskBoard` (`surfaceViews.ts:576`) and `SURFACE_VIEWS.vault` is
`v2/surfaces/Vault.tsx` (`:581`). The device components mount only under
`device-tasks` / `device-vault` (`:443,446`), which are not in `LAUNCH_APPS`.

The honest-state auditor resolved the registry itself and caught this. The Part 11
and design-system auditors had followed the brief, so both were re-run on the two
real files:

- **Design-system second pass: 3 violations.**
  - `TaskBoard.tsx:1691`: phantom `var(--danger, #b42318)`. Use `var(--error)`.
  - `Vault.tsx:188`: `I.chevronRight` is not a key in `icons.tsx` (the key is
    `chevRight`), so the raw `'›'` glyph renders on every folder caret.
  - `Vault.tsx:988`: `I.upload` does not exist, so the Upload button shows `+`.
  - Advisories: dead icon keys at `Vault.tsx:149,191,241,254,265`, which fall
    back to real icons; dead `.tb-pri.pri-urgent` hex rule at `app-v2.css:882`.
  - All three violations CT-verified.
- **Part 11 second pass: 1 critical, 1 high, 2 medium on TaskBoard; 1 low on
  Vault.** Rows T1–T4 and V1 below. Vault's governed writes are clean:
  - upload, filing and download are role-gated with `requireEditorAccess`
  - each audit row is written in the same transaction, or the request fails
    closed with `AUDIT_WRITE_FAILED`
  - attribution resolves to names

## Findings: all lenses, most severe first

**CT** = re-verified by the control tower. **Aud** = auditor-verified, not re-traced.

Status re-checked at HEAD on 2026-09-24 (`follow-through/README.md`). Rows still
marked open were confirmed open then; D1–D4 and H1 were not re-checked.

| # | Sev | App | Finding | Where | Owner / status |
|---|---|---|---|---|---|
| P1 | **critical** | Authoring | Protocol finalize and review disposition write `command='sign'` ledger rows with no re-auth, no SoD check and no `electronic_signatures` row | `server/routes/protocol-development.ts:81-108,483`; `protocol-reviews.ts:148` | **fixed** `d622ca53a`; CT |
| P2 | **critical** | QMS | QMP create / activate / delete write no audit record; Activate is one click with no reason | `server/routes/quality-management-api.ts:581,634,726`; `QmpWorkspace.tsx:112,203` | **fixed** `f4c9c50ca`; CT |
| T1 | **critical** | Projects/Tasks | Every task ledger write is best-effort and its outcome discarded, including the PIN-signed completion: `auditTaskAction` catches a write failure and returns `{recorded:false}`; all 9 call sites `await` it bare and none passes `executor` | `server/services/tasking/task-audit.ts:180-196`; `taskManagement.routes.ts:215,395,506,678,865,906,1020,1260,1392` | **fixed** `a7955fc10`, `95aa4216c` (WO-16C); CT |
| P3 | **critical** | Sub. Readiness | Resolving a gate contradiction writes no audit record; UI shows a literal `'AnA + you'` as resolver | `contradiction-engine-service.ts:697-716`; `Inconsistency.tsx:269,784` | **fixed** `9f3f40d72` (`docs/evidence/D5-GOVERNED-PATH/2026-09-22/`); CT |
| P4 | high | Sub. Center | eCTD release-signature panel shows no signer, time or meaning: `findActiveReleaseSignature` selects only `id` | `submission-package-orchestrator.ts:970`; `EctdCompile.tsx:961-1008` | **fixed** 2026-09-24, server `1de2678e5` and client (`follow-through/`); CT |
| T2 | high | Projects/Tasks | No authority check on any task write: create, transition, archive, dependency, auto-assign and from-template are open to a `viewer`; no role gating in the UI (§11.10(g)) | `server/routes/taskManagement.routes.ts` (0 role-gate references); mounted at `register-core-routes.ts:125` and `register-advanced-platform-routes.ts:219` | **fixed** `a7955fc10`; CT |
| T3 | medium | Projects/Tasks | `archive()` and `sign()` fall through silently on a 401 because `apiRequest` does not throw on it; `move()` in the same file already handles this | `TaskBoard.tsx:1083-1102,1267-1288` | **fixed** `6f79a000f` (sign), `a7955fc10` (archive); Aud |
| T4 | medium | Projects/Tasks | Archive reason is required in the UI (≥3) but optional on the server | `taskManagement.routes.ts:1358-1360`; `TaskBoard.tsx:1078` | **fixed** `a7955fc10`; Aud |
| P5 | medium | Authoring | Reason-for-change is enforced on the client only (section save, freeze, review verdict) | `authoring.router.ts:1919-1950,3700,2740` | open; Aud |
| D1 | medium | Authoring | Phantom `--danger` renders the light-mode red in dark mode | `Review.tsx:849` | open; CT |
| D2 | medium | Projects/Tasks | Same phantom `--danger` | `TaskBoard.tsx:1691` | open; CT |
| D3 | medium | Vault | Missing icon keys: raw `›` caret on every folder row; `+` on Upload | `Vault.tsx:188,988` | open; CT |
| P6 | low | Authoring | Revert is not disabled on a sealed document (server refuses) | `DocumentWorkbench.tsx:4420` | open; Aud |
| P7 | low | Projects | Activity feed shows `User <id>` instead of a name | `ProjectHome.tsx:1062`; `c2c/projects.ts:1224` | open; Aud |
| V1 | low | Vault | Confirm filing / Move send no reason, so the rationale is a canned sentence (placement is audited, atomic and reversible) | `Vault.tsx:1352-1389`; `vault-placement.service.ts:142-153` | open; Aud |
| D4 | low | Projects | Border fallbacks disagree with the declared tokens | `ProjectHome.tsx:422,457,771` | open; CT |
| H1 | high (adjacent) | *device-vault, not launch* | Hardcoded "Recent audit" rows, ungated in production | `mdx/surfaces/VaultSurface.tsx:367-379` | device stream paused (RULE 2); CT |

**Honest-state: the six launch apps are clean.**
- Hostile-payload probe: 24/24 passed.
- No fixture is reachable as live.
- No failed read renders as empty.
- No unassessed state uses "clear" wording.

## CI is red on `concept2cure-v2`

Every completed CI run on the branch in the last hours has failed. The newest
completed run on this check was `35791541373` on `e2a65f10`.

- **Lint job: 11 failing steps.**
- **Test job: 13 files and 19 tests failing** (28 672 passed). Not triaged here.
- Security Scan and Security Contract Tests were green.

Each red Lint step was reproduced on `f9a948422`, read, and classified:

| CI step | Cause | Class | This change |
|---|---|---|---|
| TypeScript no-regression | `authoringObjectAuthorization-from-draft.test.ts:5` imports the absolute path `/home/user/ClinicalSageAI-2-replit/…`, which exists only in a Claude sandbox (TS2307 on the runner; `e0f99d3c2`) | real defect | **fixed**: relative import, test passes |
| surface text ramp | generated sheet stale after `protocol-dev-editing.css` and the canvas selectors (`c69dcc92d`) | real defect | **fixed**: regenerated with its own generator; gate OK |
| tenant-isolation (no regressions) | fixture `users` insert and cleanup in `mcp-connector.dbtest.ts` (`0e83825ca`) | false positive | **fixed**: `tenant-isolation-safe:` markers with reasons |
| tenant entry points | the ledger router's header mentions SCIM; it is session-JWT and lifecycle-guarded via `authenticateToken` | false positive | **fixed**: header states the guard and where it runs |
| CSS selector shadowing | two `.c2c-v2` nesting wrappers with 0 own declarations (`c402dbb6b`) | gate false positive | reported: canvas workstream (`design-system.md`) |
| path containment | `analytics-routes.ts:322` writes request *content* to a constant path | false positive | reported: baseline "never grows" is the owner's call |
| unkeyed request tables (+ selftest) | `mcp_oauth_clients` (`0e83825ca`), `c2c_document_section_versions` via SoD (`610f68788`) | needs judgement | reported: `security.md` |
| requestDb adoption | `dossier-map.routes.ts` (`b98ac05f0`), `data-origins.routes.ts`, `ana-ri/utility.ts` | RLS depth | reported |
| unreferenced modules | `server/mcp/client-transcript.ts` (`0e83825ca`), `server/eval/register/run-eval.ts` (`873b3fc9d`) | dead code | reported: wire or delete |
| proof tier | not reproduced (needs Postgres) | unknown | reported |

The four fixes are the only code in this change. Each gate was seen failing on
head before the fix and passing after it. The TypeScript failure was seen in CI's
own log, because the sandbox path resolves locally. That hides it here: a local
`tsc` in this sandbox instead reports 38 errors from two dependencies
(`@aws-sdk/client-kms`, `@modelcontextprotocol/sdk`) that are in `package.json`
but not installed in this container, so local `tsc` is not evidence either way.

## What this changes for the launch rows

- **D5:** the row's progress note says *"second signature route deleted"*. P1
  shows two more routes writing `sign` ledger rows without the signature ceremony.
  Until P1 is fixed, "no non-compliant signature route" is not true.
  - P2 and P3 are governed state changes with no audit record, on QMS and
    Submission Readiness, both launch apps.
  - T1 means a PIN-verified task signature can be recorded on the task while its
    ledger entry silently fails.
- **D2:** unaffected. The launch-scope, fixture and mock gates all pass, and the
  honest-state lens found the six apps clean. Its owed evidence (staging
  screenshots, a CI run showing the gate blocking) is unchanged.
- **D3:** no isolation hole found. Every red tenant gate was either a false
  positive or RLS-in-depth adoption behind the JWT tenant scope. Two unkeyed
  tables await a reason.

## Gaps in this review

1. **No security auditor exists.** `.claude/agents/` holds seven agents and none is
   for security. The security lens here is gates plus reading, which catches
   regressions against known patterns and does not discover new classes. The DoD
   names a security auditor; either one should be written, or the clause should
   say "security gates".
2. No authz walk of each launch route. No review of the AnA tool-execution path
   that the QMS SOP and change-control actions delegate to (SUSPECT in
   `part11-ux.md`).
3. The 13 failing test files in CI were not triaged.
4. The a11y, microcopy and motion lenses are not in the DoD clause and were not
   run. `ci:internals-in-copy` and `check:microcopy` were run by the honest-state
   auditor and are clean.

## Totals

- **Launch catalog:** 4 critical (P1, P2, P3, T1), 2 high (P4, T2), 6 medium,
  4 low.
- **Adjacent:** 1 high on a device surface outside the catalog (H1).
- **Honest state:** clean.

Every critical and high finding is CT-verified. The Part 11 criticals share one
cause: governed state changes that reach `recordGovernedAction` (or nothing)
outside the canonical write path. `makeHandler`/`writeMutation` in
`server/routes/c2c/actions.ts` does re-auth, SoD, the signature row and the
atomic audit write. P1 bypasses it with a local `governed()` helper. T1 calls it
best-effort outside the transaction. P2 and P3 never call it. A gate that refuses
a governed-looking mutation route not reaching that path would have caught all
four. Owner: D5.

T1 is known debt. `check-discarded-audit-write` (in `.husky/pre-push`) already
baselines all nine sites (`scripts/ci/discarded-audit-write-baseline.json:36`,
`"server/routes/taskManagement.routes.ts": 9`). The same baseline holds **160
discarded audit-write outcomes across 72 files**. The ratchet stops new ones and
retires none. How many of those 160 are on launch-catalog write paths has not
been measured; that count is the next review's first item.
