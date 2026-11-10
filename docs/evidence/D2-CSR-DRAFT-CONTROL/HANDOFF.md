# Hand-off: CSR drafting with the person in control, and this session's other open threads

Written 2026-11-08 by session `session_01T2wooCZu46W7msw4TJuuzr`, as it hands off. Every commit named here is on
`concept2cure-v2`. This session holds no file now; its row in `.design/claude-convergence/COORDINATION.md` reads
"(none held)". The plan entry is `docs/design/ONE_DESIGN_PLAN.md` §3a, "L1 (row D2) — CSR drafting with the person in
control".

Read `CLAUDE.md` first. RULES 4–6 bind everything below:
- one editor, and document types are data;
- the design is Claude's;
- nothing new is built: finish, reach, fix or converge what exists.

Every commit carries `Plan: <ID>` and `Completes: <existing path>`. `npm run ci:one-design-plan` checks both before a
push. A screen is not done until it was used in the running app.

## 1. What is landed

**CSR drafting, the person in control.** Launch row D2, packages L1 and S4. Design:
`docs/design/CSR_DRAFT_HUMAN_CONTROL_2026-10-29.md`. Its "Decisions on slice 1's questions" and "Slices 3 and 4: status
and decisions" bind the next slices.

| Slice | What the person gets | Commits | Evidence |
|---|---|---|---|
| 1 | Up to three alternatives, by tone, compared as a redline. A whole accept, or chosen paragraphs as AnA's tracked changes | `7b4a16cf8` | `2026-10-29/` |
| 3 | Revise by instruction: a new draft that derives from the one shown, compared N against N−1, with any earlier revision reachable | `0f4bc4f2c` | `2026-10-29/slice-3-4/` |
| 4 | Alternatives for a selected passage, landing as AnA's tracked replacement of exactly that selection | `0f4bc4f2c` | same |
| 2 | The engine figure gate (below) | `7799a5b0a` (server); `199f1cd28`, `d8330538b` (panel) | `2026-11-06/slice-2/` |
| walk | The panel, sign-in and folds F4/F6 used in the running app, with two panel fixes | `468ee75a5`, `891e1884b`, `aa211c406` | `2026-11-06/walk/` |

Slice 2 in detail:
- In a CSR results section (§2, §10–13), a figure in AnA's draft that the study's engine did not produce can't be
  accepted. That covers the whole draft, alternatives, revisions and passage alternatives.
- The figure is named, and the accept, a chosen paragraph or a passage replacement is held while it stands.
- The server re-checks the accepted text (422 `CSR_FIGURE_NOT_FROM_ENGINE`).
- A section with no imported claims says "not checked", never "passed".
- The accept's Part 11 audit row names the option set.
- It reuses `planSections` from `server/services/ana/csr-saved-evidence.ts`, exported and never copied.

**The same session, earlier** (launch rows D1 and D6, and D2's folds):
- P-72 slice 1a, `ae12195a5`. The non-superuser deploy runs to the end; the pre-auth lookups are owned by
  `c2c_platform_scope`; the platform role string is refused.
- P-72 slice 1b, `a06ae96c8`. The retention and audit-chain sweeps run per organization; a check that read nothing never
  says "valid".
- Folds F4 and F6, `970bc3637`. Device analytics is in Reporting; the device workstream is in Projects, with the Client
  Review Room on the device project's Review step.
- Design: `docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md`. Evidence:
  `docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/`, `…/slice-1b/` and `docs/evidence/D2-ONE-ANA/2026-10-30/`.

## 2. Open work, in order

Each item extends a path that exists. Name it as a completion in its commit (RULE 3).

1. **Walk the figure gate live** (L1, row D2). This needs a model key, and that is the blocker (§3). Steps:
   1. On an imported CSR, draft §11.4.1 with a figure its receipts do not claim, and see it named.
   2. See the accept refused, correct the figure in the panel, and accept.
   3. Check that the audit row's `option_set` matches the choice.
   4. Revise by instruction, and offer alternatives for a passage.

   Use the recipe in §4. File the evidence under `docs/evidence/D2-CSR-DRAFT-CONTROL/<date>/walk-live/`.
2. **Slice 4b, adding a paragraph after an existing one** (decision 8). Paragraph proposals offer only "replace a
   paragraph" and "empty section". The change is a block-boundary insert in `editor/suggestions.ts`, the canonical
   proposal door, pinned by tests, and reached from `paragraphProposals` in `editor/draftAlternatives.ts`.
   `suggestions.ts` is D4's editor: say so in COORDINATION.md before editing it.
3. **Slice 5, review by keyboard.** Next and previous change, and accept and reject, as editor commands, in
   `editor/reviewNavigation.ts` with registration in `RichSectionEditor.tsx`. The proposed keys are open question 7.
   An accessibility review for screen-reader and OS conflicts comes first (decision 7).
4. **Slice 6, progressive arrival.** It streams the draft through the same draft route (an SSE variant of the
   handler). The candidate is parked only on completion; a cut-off stream parks nothing.
5. **Slice 7, chosen paragraphs with source citations.** Saving accepted paragraphs consumes their candidate and
   records verified source spans. Today chosen paragraphs carry no citations, and the panel says so before the click.
   Files: the PATCH save in `authoring.router.ts`, `draft-candidate-store.ts`, `lineage-gate.ts` and `suggestions.ts`.
6. **Decision 1, next.** Alternatives differ by tone today. Next is a closed list of named approaches the platform
   writes per section type ("follows the SAP wording", "full ICH E3 structure"). The model never names them.
7. **P-72, slices 2–7** (L1, row D6). Design §6:
   - 2: one-organization paths;
   - 3: jobs;
   - 4: console and pre-auth;
   - 5: function bodies;
   - 6: the flip;
   - 7: cleanup.

   Before slice 6, the on-demand tenant chain verdict (`verifyTenantChainOnAdminScope`) must walk in the tenant's own
   scope, or through the `platform_audit_chain_links` door (§3.4). Otherwise every verify-chain says "not verified"
   after the flip. Recorded in the design under "Slice 1b, landed".
8. **Not started, from this session's last run:**
   - the purge-residue classification: design only, `docs/design/TENANT_PURGE_RESIDUE_<date>.md`. Some 454 tables
     sit outside the tenant purge's reach (`docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/`);
   - the independent re-checks of P-72 slice 1a and CSR slices 3–4. Both shipped with their own red, green and
     mutation proof.

## 3. Blockers

- **No model key in these cloud environments.** `/readyz` reports `ana: down, no_provider`. The drafting panel refuses
  honestly, as walked, but no draft can be made, so slice 2's live walk, revise and passages cannot be shown.
  - A key saved as a network credential for `api.anthropic.com` would also be injected into the session's own
    traffic to that host, so this session did not ask for one.
  - The Codespace lane in COORDINATION.md ("Codespace setup") runs the app with the founder's own keys. Walk it
    there.
- **Spend limits.** The account's monthly spend limit stopped this session's subagents on 2026-11-06. Plan work so a
  stopped agent's edits can be resumed from the tree (§5).

## 4. How to verify and walk

- **The lane's tests.** Run with `--maxWorkers=2`; the box has 4 CPUs and 16 GB:
  - `server/routes/__tests__/authoring-ai-draft-csr-figures.pglite.test.ts` (slice 2, HTTP on PGlite);
  - `authoring-ai-draft-revise.pglite.test.ts` and `authoring-ai-draft-passage.pglite.test.ts` (slices 3–4);
  - `client/src/concept2cure/v2/__tests__/authoringAiDraft.test.tsx` and `authoringDraftRevise.test.tsx`;
  - `client/src/concept2cure/v2/editor/__tests__/draftAlternatives.test.ts`, `draftPassage.test.ts` and
    `workbenchDraftPassage.test.tsx`.
- **The running app.** The recipe is `2026-11-06/walk/README.md`, "How it ran", with its scripts in
  `2026-11-06/walk/walk-scripts/`. The walk scripts read the personas' passwords from `JM_PASSWORD` and
  `WALK_SIGNER_PASSWORD`; none is committed.
  - Build a fresh database with the repository's provisioning: install-fresh, `deploy-migrate`, seed-admin and
    `demo:seed`. A fresh cluster needs `postgresql-16-pgvector`.
  - Run the server as `app_service`, with `RLS_ENFORCE=on` and `LAUNCH_SCOPE_ENFORCE=on`, and dev sign-in off.
  - Sign in through the emailed code, which the dev server logs (`Dev OTP code`). The log masks the address as
    `j***@domain`, and the code screen is submitted with its "Verify" button. `common.cjs.txt` does both.
  - The drafting panel is the editor's ✻ AnA menu → "Draft from sources". "Draft with AnA" is the conversation path,
    not this panel.
  - Use the seeded device project's SOP sections to reach the panel. The biotech QOS document is held (§6).

## 5. Gotchas

- **Pushing.**
  - Trunk moves every few minutes, and the pre-push hook takes 2–10 minutes, so a ref race ("cannot lock ref") is
    normal. Fetch, merge (never rebase), push again.
  - Push from a quiet tree, because the hook typechecks the working tree. Use
    `TYPECHECK_HEAP_MB=11264` on this box.
  - Commit only your paths: `git add <paths>` then commit, or `git commit -- <paths>`. An untracked path needs
    `git add` first.
- **Scoped typecheck misses.** A scoped tsc covers only the files you list. Include every test you changed, or the
  pre-push typecheck finds it later (it did once: `d8330538b`).
- **Trunk red that is not yours.** Prove it on the tree without your change before you hand it on. Compare per-test
  failure lists with and without the change; `git stash push -- <your paths>` is enough. Never fix another lane's
  suite silently: record it in COORDINATION.md.
- **Shared files.** `authoring.router.ts` is shared with other lanes. Re-read `git log --since=… -- <file>` before
  editing, and resolve merges by keeping both sides (the `29b0e7164` merge kept P-73's `filingBlock` beside this lane's
  revision and passage blocks).
- **Disk.** Old lanes' scratch PostgreSQL clusters filled the disk once and stopped a checkout part-way. Delete a
  finished lane's cluster, and check that a stopped checkout left no truncated files before you trust the tree.

## 6. Handed on to other owners (open as of 2026-11-06; re-check before acting)

- **Drafting is held on the seeded biotech IND's Quality Overall Summary.** All 23 sections read
  `draftingRegionState: unavailable` (`server/services/authoring/authoring-draft-region-projection.ts`, from
  `8013c9457`). The owner is the drafting-context work. On the same section, `GET /api/authoring/sections/:id/sources`
  answers 503 `NATIVE_SOURCE_ACCESS_UNAVAILABLE`.
- **D4's holder, editor layout.**
  - At 1440, "Draft with AnA" with the Tasks drawer open squeezes the editor until its text clips.
  - At 390, the editor bar wraps to four rows and covers the content beneath it.
  - Slices 3–4 decision 4: clear `draftPassage` in `DocumentWorkbench.tsx` `onReviewSection`, with an assembly-flow
    test.
- **The owner of `53b179b99`.** Five workbench suites whose fixtures predate the verified document-list read
  (`{ documents }` with no `success: true` and no `program_id`) still fail at `f9631c065` on 2026-11-08, 46 tests:
  - `authoringUnsavedWork`;
  - `workbenchA11ySweep`;
  - `workbenchAssignReview`;
  - `workbenchDocumentAccess`;
  - `workbenchRemedies`.

  At the same commit, every suite of this lane passes (§4's list, 170 tests together with the other suites run).
- **Other red checks.** `ci:launch-scope-api` was red on two client paths outside this lane, and `ci:lineage-save-gate`
  on `server/services/csr/csr-section-review.ts`.
