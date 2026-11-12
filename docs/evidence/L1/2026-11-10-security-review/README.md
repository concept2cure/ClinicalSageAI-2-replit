# L1 — security review of trunk, 2026-11-10: what was found, verified and fixed

Five read-only reviews ran over trunk (recent changes; AnA's write authority; Part 11 on the Vault's folders and
filing; the strict `uuid()` validators added after the zod 4 move; every security CI gate and selftest). Each
finding below was re-read in the code by the session before anything changed. Findings that are product decisions
are listed at the end, not changed.

## What already exists

- The gates the reviews ran (93 runs, all green except the design gate `ci:surface-text-ramp`, which is stale and
  is the CSS lane's): tenant isolation, RLS bypass, sign ceremony, audit writes, upload guards, error leaks,
  secrets, dev-auth, dependency risk, `test:security` (54 files, 546 tests).
- The role gate `requireEditorAccessForWrites` (`server/middleware/orgMembership.ts`), the governed-reason floor
  (`server/routes/governed-reason.ts`, `shared/constants/governed-reason.ts`), the stated-reason rule for AnA
  (`server/services/ana/stated-reason-input.ts`), per-record scope for AnA tools
  (`server/services/ana/tool-record-scope.ts`).

## Fixed in this pass (each red first)

| # | Finding (verified in the code) | Fix | Commit | Test (red before, green after) |
|---|---|---|---|---|
| 1 | An organization `viewer` could write on eleven research routers mounted behind sign-in alone (61 write routes): financial-disclosures, grants, dmsp, research-agreements, nonclinical, translation, biosketch, coverage-analysis, effort-certification, export-control, other-support | `router.use(requireEditorAccessForWrites)` on each, as `a3da1f666a` did for the biostatistics bridge. `committees.ts` already checks role per action and is untouched | `901a91ccfe` | `viewer-cannot-write-research-routers.test.ts`: a viewer and a role-less session got 201/200 on every write before; 403 before any service or database call after |
| 2 | `commit_document_revision` took the project, the conversation and the model's name from the model's own input. A revision could be saved into a project of the same organization the person cannot open, or onto another conversation's document; the ledger and the lineage dossier recorded the model's name for itself | The project is the turn's, admitted for the person (`admitAnaProjectScope`); the conversation is the turn's; a different one in the input is refused. The model recorded is `ToolContext.servingModel`. The three inputs left the schema | `83c71d8a89` | `document-spine.test.ts`, the spine's pglite integration suite, the stated-reason invariant |
| 3 | `create_grant_proposal` / `record_grant_award` took `project_id` unchecked (the foreign key is checked past RLS) | `RECORD_SCOPES` entries, as `approve_import` | `197992ff3e` | `tool-record-scope.test.ts` |
| 4 | `update_invention_disclosure` let a model-written TTO decision rationale through under the confirming person's name | A supplied `decision_rationale` is refused as the office's own act, like `election_date` | `197992ff3e` | `tool-authorization.test.ts` |
| 5 | The MCP tool `c2c_file_draft_for_review` said its reason was recorded in the audit trail and only echoed it back | Held to the governed floor and passed to the placement's audit row; the result says whether a row was written | `197992ff3e` | `mcp-governed-reason-recorded.test.ts` |
| 6 | Vault folder changes: the server refused only an empty reason (the 8-character floor was in the form alone), and the reason was not on `audit_logs.reason`, where the history reads it | `requireGovernedReason` in the service; the reason on the row's own column and in the chained details | `70af5a94c5` | `vault-folders.test.ts` |
| 7 | The audit ledger showed folder changes as "Vault Folder Create" | Four labels in `ACTION_EVENT` | `4f2aadd33f` | `audit-trail-ledger.routes.test.ts` |
| 8 | The project-children read refused the demo programs' ids (zod 4 `uuid()` is RFC-strict; the GA demo seed's ids are not), while every other program route accepts them | `guid()`, as the other program routes; the held-send evidence document id too | `2dd59705dd` | `project-hierarchy-creator-retirement.test.ts` |
| 9 | AnA making a Vault folder recorded her rationale as the reason for change (found earlier the same day) | The person's reason, asked for only on that call | `8f7aeee8cd` | `docs/evidence/L1/2026-11-10-ana-folder-reason/` |

Run after all of them: every non-database suite naming the touched modules (39 files, 549 tests), the six pglite
suites that touch them (70 tests), the role-gate and stub-repaired suites (268 tests), `tsc` (0 errors), ESLint on
every changed file (no new warning).

## Not verified here

No database, no model key and no running app in this container: database suites (`*.dbtest.ts`) were not run, and
no fix was walked in the running product.

## Left for a decision (not changed)

These change what a person is asked or allowed to do, so they are the founder's:

1. **Filing one document asks for no reason; confirming two or more does.** `POST /:id/file` (file, move, unfile,
   confirm one) takes an optional note; with none, the service composes "Filed by user." as the stored rationale.
   The bulk confirm requires a reason. The Vault coverage "File here" button sends a sentence the person did not
   type as their note (`Vault.tsx`). Recommended: require the reason on the single path too and drop the composed
   sentences.
2. **Sole-member self-approval (P-116/P-117) can be reached by removing the other members.** The rule counts
   `organization_users` rows; deleting a colleague (or an IdP deprovisioning) makes the remaining administrator
   the sole member. The act is recorded as unreviewed, so the control is detective. Recommended: not within N days
   of a membership removal, or off by default for an organization that has had a second member.
3. **Model-written prose in governed records under the confirming person's name.** About 42 confirm-class AnA
   tools take a `comment`, `description`, `rationale` or `notes` field (hand-checked for seven); neither the
   approved-model gate nor the stated-reason invariant looks at those names, and the confirmation card usually does
   not show the text. Recommended: show the text at confirmation and mark the record "proposed by AnA".
4. **`commit_intelligence_flow`** commits model-composed interview answers to the CMC registers behind a
   confirmation that shows only the session id.
5. **`qms_change_transition`** lets AnA reach `rejected` and `verification` on a yes; **`create_coi_disclosure`**
   files a disclosure for a named person as submitted; the unattended background investigation runs `self` tools
   (a sub-agent is read-only).
6. **AnA's data-room filing** is not marked as the agent's on its audit row (inferred from the missing argument).
7. **A folder's history is not readable in the Vault**, and the remove/move forms do not say what happens to the
   documents inside (the server refuses a non-empty remove).
8. **Infrastructure watch items:** the CloudFront WAF common rule set is in count mode with no end date; AnA's
   conversation tier now starts at 1.

Not this lane's: `ci:surface-text-ramp` is red (the generated ramp sheet is stale after today's Quality CSS
commits); `ci:drizzle-tenant-scope` has two fixes not yet banked in its baseline.
