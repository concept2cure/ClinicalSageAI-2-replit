# F1, launch row D2 (L1): trunk CI at HEAD, reproduced and taken to green

Lane: Trunk CI at HEAD (`session_01E8btkB8mcLirW4rNvsMNxK`), 2026-11-10. Coordination row and handoffs:
`.design/claude-convergence/COORDINATION.md`, section "Found by the trunk-CI lane".

## Why

No CI run on `concept2cure-v2` had completed green. The last completed run (`04fd70b23`, 2026-11-09 00:12) failed all
eight test shards, the integration tests, six lint guardrails, the proof tier and the full-history secret scan. Runs
since then wait about a day in the queue. So no session knew whether trunk was green or red, and a launch cannot be
called deployable on a branch whose CI nobody has seen pass.

## What already exists

This lane built nothing. It runs the repository's own CI definition and repairs what it finds.

- `.github/workflows/ci.yml` is the one CI definition. The local runner reads that file and runs each job's `run:` steps
  with `bash -e`, so the commands are CI's, not a copy. Only setup actions are skipped (checkout, setup-node, the
  Postgres service), and the environment stands in for them. The runner is a scratch script, not committed.
- `scripts/db/install-fresh.mjs` and `scripts/db/deploy-migrate.mjs` build the deploy-shaped database the
  real-database suite runs on. `vitest.db.config.ts` runs that suite.
- Every test changed here existed already. Every product change finishes an existing path, named in its commit's
  `Completes:` trailer.

## Environment

- **Database.** PostgreSQL 16 with pgvector (the CI image's extension).
- **Packages CI installs.** `fonts-noto-core`/`-cjk`, and python-docx and lxml for python3.11. Without them the PDF
  and DOCX suites are red for reasons CI never sees.
- **Secret scan.** gitleaks v8.28.0, the version CI pins.
- **History.** The full history, unshallowed, for the secret scan.
- **Test database.** `concept2cure-ri_test`, with the GCC migrations applied.
- **Real-database suite.** It runs on a fresh copy of a deploy-shaped database (`CREATE DATABASE … TEMPLATE`), with
  `CI=true NODE_ENV=test RLS_ENFORCE=on` and `APP_DATABASE_URL` set to the restricted `app_service` role. That
  database is built by install-fresh and then deploy-migrate. The Vault-fixture suites also need
  `C2C_VAULT_LEGACY_FIXTURE_DATABASE` naming the copy, which must be called `platform_ci_vault_fixture_*`.

## Jobs reproduced, and their state

| Job | State at the lane's last push |
|---|---|
| Lint, every guardrail step | Green. The typecheck's red here was out of memory (exit 137), not an error: the pre-push typecheck on the same tree reports 0 errors |
| Secret scan, full history | Clean at HEAD |
| Test, shards 1–8 | Every red fixed, or handed to its holder in COORDINATION.md |
| Integration: GCC migrations, RLS smoke, provisioning, integration tests | Green |
| Integration: real-database suite | 37 failures in 23 files at `fae35817f9`. 21 files fixed, all green on a fresh copy. 2 handed over, below |
| Security contract tests | Green (at `0850ed937b`) |
| AnA readiness | Green |
| AIOS audit assets | Green |
| Blank DB provisioning and deploy migration | Green, all 12 steps, on a new blank database |
| Security: SBOM, dependency-risk ledger, PPTX reachability, Trivy hygiene | Green. The first SBOM red came from a `node_modules` older than `10b8e3fd68`'s image-size override, and `npm ci` cleared it. The Trivy scans themselves are GitHub actions and were not run |
| Build | The build is green. `ci:component-class-coverage` was red on 5 classes. The 2 CMC classes are fixed here; 3 Quality classes are handed over |
| Production boot smoke | Green, all 9 steps, on a Docker daemon started in this container. It ran pgvector/pgvector:pg15 with TLS, provisioned from scratch, and checked that `app_service` is NOSUPERUSER and NOBYPASSRLS. It built the bundle, checked its production imports, and ran the pinned clamd. The bundle reached `/readyz=200` with `RLS_ENFORCE=on`. The job ran as written; the local Postgres on 5432 was stopped for the run |

**Not reproduced here:**
- Coverage and nightly governance run only on the schedule.
- **Production image boot and Codespace are blocked by this container's network.**
  - Inside a container, npm reaches no registry. The sandbox's only way out is its agent proxy, and a container has
    neither the proxy nor its CA. `npm view` timed out with and without `--network host`.
  - So `docker build -f Dockerfile.optimized` stops at `npm ci` ("Exit handler never called!", after an earlier
    Docker Hub 429).
  - Giving the build the proxy and CA would change the build CI runs, so it was not done.
  - Both jobs need CI or a machine with ordinary egress.
- The release-evidence jobs run on GitHub only.

**Found by the newer jobs:**
- **The CMC classes.** `.cm` and `.cm-push` were left in the markup after D5-1 (`94f24dba08`) deliberately deleted
  their rules. Both class names are removed.
  - The shipped CSS is byte-identical: all 35 content-hashed chunk names match.
  - Headless Chromium against the built chunks showed 0 computed-style or box changes over 25 elements, at 1440 and
    390.
  - Control: dropping `cm-pushbar` changed 63 properties, so the probe can see a change.
  - `cmcWorkAreaReach`'s source anchor follows the new tag. It was seen failing on the markup change alone, and is
    just as strict.
- **Handed over (COORDINATION.md):**
  - the three Quality classes, to the Quality lane, which is mid-sweep in those files;
  - `projectCreationDoors.contract`'s Vault case, to S6 and the holder of the contract. The sponsor-first Vault reads
    its projects through `useVaultProjects`.

## Product defects found by the reds, and fixed

Each was red first and was reviewed adversarially.

- **Biostatistics** (`d529eeab14`). AnA's "load a design" and "open a design engine" actions did nothing:
  `3baa7fb79b` left a second registration that the surface's one registration replaced.
- **Risk-based monitoring** (`26c65db002`). The framework label cited ICH E6(R2), not the guideline in force,
  E6(R3).
- **Bundle invalidation census** (`3ef43ee53b`). The census did not count a call of the shared move primitive as a
  write. So a new caller could move an artifact without invalidating the bundles built over it.
- **Schedule of events** (this push). A generation answered with `last_reviewed_by_ana_at = now()`, but
  `withHumanScheduleWrite` marks the monitor dirty (NULL) before it commits. The response said AnA had just reviewed a
  schedule whose committed row said it had not. Both branches of the upsert now write NULL.
  - `project-schedule-atomic.dbtest.ts` now compares the first (INSERT) response with the committed row too. Putting
    `now()` back in the INSERT branch only turns it red.

## Fixtures that fell behind the product

These are the recurring classes. Each fix follows the product; none loosens an assertion.

- **`audit_logs.chain_seq`.** Since `b8cee0745c` the independent-check ledger is ordered by it, and a read that cannot
  order answers 409 INDEPENDENT_CHECK_REQUIRED. Suites with a hand-written `audit_logs` apply
  `migrations/20260921_audit_logs_chain_seq.sql`. The shared harnesses were handed to their holders.
- **P-95 and P-116.** An approval follows a completed review: REVIEW_REQUIRED, and two reviewers for a placed
  artifact. A reviewer is neither the approver nor an author.
- **The 21 CFR 11.50 manifestation** (`0e5706a308`). The signature line now reads "Signed by X, meaning Approval, …
  UTC.".
- **The launch catalog's growth.** Risk-based monitoring (P-76), Biostatistics (P-77) and the device project features
  (2026-10-23) are pinned literally. A pin that read the widening constant could not see a widening made through it.
- **The project anchor.** A program is read through its one project anchor: P-19, P-76, and `1a6701ea65`'s project
  admission.
- **A request's one pinned connection** (`3755f542ca`). A settings transaction runs on the request's connection, not
  the pool.
- **Membership roles.** `research_admin` and `support` are refused on `organization_users` from 2026-10-30. Platform
  staff are a `platform_role_grants` row.

## Three first drafts the adversarial review replaced

Each review ran mutants on a scratch database.

1. **The signup launch-catalog pin.**
   - **Draft:** it read `MDX_PROJECT_FEATURE_SURFACE_IDS`.
   - **Mutant:** a widening of the launch scope through that constant. The pin stayed green.
   - **Landed:** the ids written out. That version is red under the same mutant.
2. **The module-access support case.**
   - **Draft:** it passed even when the support grant never took effect, because the console guard refused first.
   - **Landed:** the case asserts the refusal of the queue's own rule, "every workspace", and of the decision's rule,
     "only an administrator".
   - **Mutant:** with the grant changed to a role that does not exist, the case is red.
3. **The credential-scope and scheduler suites.**
   - **Draft:** it dropped real-PostgreSQL coverage.
   - **Landed:**
     - a case that reads the real `pyramid.routes.ts` and requires `authMiddleware` and `enforceTenantLifecycle` on
       every route under a mirrored `/api/v1` launch prefix;
     - two sweep cases on real PostgreSQL: a project archived between listing and claim, and a past-due organization;
     - a heartbeat stand-in that writes the rule-alignment notice production writes.
   - **Mutants, run again by this lane before the push:**
     - the claim's parent guard made always true: red;
     - the heartbeat's rule-alignment exclusion deleted: red, 2 cases.

The authoring mdx case had the same person review and approve. P-95 Q1 and P-116 forbid that in an organization of
more than one member. The case now uses an independent third member, so it stays green when the product starts
refusing an approver who reviewed. The review-floor mutant still turns it red.

## Run, 2026-11-10, after the rebuilds

On a fresh copy of the deploy-shaped database, at `c9e9fdefdd` plus this push's changes:
- **20 of the 21 files passed:** 403 tests passed and 5 skipped.
- **The 21st, `biostat-authoring-basis`, refused to start** without the disposable-database declaration. With it, it
  passed 5/5.
- **The signup and authoring files ran again on another fresh copy** after the last edit: 2 files, all passed.

Mutant runs, on separate fresh copies:
- **INSERT branch back to `now()`, plus the support grant on an unknown role:** 2 failed. They are the two cases
  meant to catch these mutants.
- **Always-true claim guard, plus the deleted heartbeat exclusion:** 3 failed, in the cases named above.

Each file was restored afterwards. In the arbiter contract (10/10) and the schedule service's unit suites (136/136),
everything passes. The ESLint warning count per file is unchanged against HEAD.

## Rolling rerun, 2026-11-10 from 10:53 UTC

GitHub CI was 32 hours behind trunk and falling further back (COORDINATION.md, "GitHub CI cannot keep up with
trunk"), so the lane ran the suite again locally. Trunk took about 100 commits an hour, so each part ran at the
head of its moment.

| Part | At | Result |
|---|---|---|
| Shards 1–4 of 8, one file at a time | `64e1722af7` | 2 and 4 pass. 1: the founder-path walk, 9 cases (its owner fixed it since, `60b1d53767`). 3: `projectCreationDoors.contract`'s Vault case (handed over, below) |
| Shards 5–6 of 8 | `700e9df2a2` | 5 passes. 6: two client tests that pass 3 of 3 alone on an idle machine (below) |
| Shards 7–8 of 8 | not run | CI changed shape first: `8a7e41392d` (MR-02 Stage 3) made Test four shards, three files at a time |
| Shard 1 of 4, three files at a time | `8a7e41392d` | 19,305 of 19,306. One: `editorBridgePropose` "a base read before the save is stale after it", `not-editable` where `ok` was expected; passes 3 of 3 alone |
| Lint, 125 guardrail steps (without the typecheck, ESLint, its report and the proof tier) | `8a7e41392d` | 123 pass. Three gates red, none of them in `.husky/pre-push` (below) |

**Fixed in this rerun:**
- **`tests/db/estar-audit-admission.dbtest.ts`** (`8b64e4af58`), in "Still red" below.
- **`ci:lineage-save-gate`** (`2c3627c039`), red since `64da37618f`. `charter-objectives.ts` no longer matched the
  fingerprint its NOT_PROSE classification was reviewed at. That commit's 12 lines add an optional regulatory
  strategy to the objective's canonical JSON. The write, its actor, reason, version chain and same-transaction audit
  are unchanged, and only a person enters the text (the objective's one form, through the PUT). Renewed with the
  review in its reason. The renewed fingerprint was seen failing on a one-byte change.
- **`ci:canonicalizers`** (`ff87cab87e`): `data-room-grade.ts` sorted and serialized its facts itself, and only the
  top-level keys. Its fingerprint is now `sha256(stableStringify([engine, facts]))`.
  - **Red first:** the same profiled table with its keys in two orders hashed differently.
  - **Data consequence:** a fingerprint stored earlier differs, so each grade is stored once more on its next read,
    the same grade with a new `graded_at`.
  - **Also found:** that gate is the first command of "Gates that existed but ran nowhere", so the thirteen after
    it had not run in CI. All thirteen pass.

**Handed over:** `ci:error-envelope` on `PlanAssign.tsx:318`, to S11, which committed to that file at 11:32.

**Tests that depend on how files are run:**
- `workbenchRemedies` "insert-empty" and one `biostatBridge` case failed in shard 6 of 8. MR-02's own measurement
  (`docs/evidence/MR-02/2026-10-30-ci-verdict/parallel-shards-2026-11-10.txt`) has "insert-empty" failing only one
  file at a time, in the long-lived single process. CI's Test no longer runs that way. The nightly coverage run
  still does.

## Still red, handed over (COORDINATION.md)

- ~~`tests/db/estar-audit-admission.dbtest.ts`~~ **Fixed by this lane, 2026-11-10 12:20 UTC.** Vault parity's row
  released `pathway-engines/estar/**` when it moved to the eTMF, and nobody had committed to the test since
  2026-10-17.
  - **Cause:** since `776d9da460` the UPDATE runs on a checked-out client, and the barrier was still on `pool.query`.
  - **Fix, test only:** the barrier holds the UPDATE on the client `pool.connect` hands out.
  - **Run at `64e1722af7`, on fresh copies:** 13/13. With the product's status guard removed
    (`estar-submission-service.ts`, the `status = current.status` condition), the concurrency case is red:
    `[200, 200]` against `[200, 409]`. The product file was restored.
- `tests/db/tenant-purge-blocking-keys.dbtest.ts` needs a founder decision.
  - **Cause:** the P-104 owner boundary on `ana_relational_profiles` (`fd04214563`) leaves the D6 purge unable to
    erase a project-bound profile. The purge fails 23503, and the whole erasure rolls back.
  - **The conflict:** P-58 (the export returns every row the purge erases) against P-104 (a private profile admits
    only its owner).
- Already handed over earlier, and still open:
  - the founder-path walk's seal gates;
  - S6's reason for change;
  - ~~the sub-agent path check~~ (fixed 2026-11-12, below);
  - `auditLogger.js`, which runs on no live request.

## Two unit reds at head, fixed 2026-11-12

Both were red at `2cdfe99657` and again at trunk `82dfba5042` (re-run 2026-11-12 03:56 UTC), on every session's push.

### `tests/rls-scoped-route-mounts.contract.test.ts`: the mount was there; the test could not see it

- **What it said:** "`app.use('/api/cerv2-sections', ...)` not found in `server/bootstrap/register-document-routes.ts`".
- **What is true:** the mount is on line 327, behind `requireTenantContext`, as the contract requires.
- **Cause:** the test stripped comments with its own regex, `/\/\*[\s\S]*?\*\//g`, which does not know about
  strings. Line 139 logs `'… /api/ectd/v4/*, /api/ectd/controlled-vocab'`. That `/*` opened a "comment". Until
  2026-11-10 nothing after it closed one, so nothing was removed. `5ac92bfaac` then added a real block comment at
  lines 455–458, and its `*/` closed the false one: lines 140–453 were stripped, the mount among them.
- **What already exists (RULE 3):** `scripts/ci/lib/strip-comments.mjs`, the quote-, template- and regex-aware
  stripper written for exactly this (its header records the same failure on 2026-09-23), already imported by
  `server/api/cmc/__tests__/register-edit-is-audited.contract.test.ts`.
- **Fix, tests only:** the test imports that stripper and its own regex is deleted. The same regex stood in four
  more source-reading tests, which passed while reading less than they claimed; they are converged in the same
  change: `tests/rls-scoped-route-mounts-tranche2.contract.test.ts`, `tests/rls-auth-boundary-invariant.contract.test.ts`,
  `tests/rls-users-preauth-scope.contract.test.ts` and `tests/routes/route-ownership.test.ts`.
- **Measured** over the ten files those tests read: the regex hid **178** lines of code in
  `register-document-routes.ts` (140–453) and **188** in `server/bootstrap/register-inline-routes.ts` (838–1131),
  which the tranche-2 and route-ownership tests read. The other eight files lost nothing.
- **Run:** the five files, 1 failed and 34 passed before; 35 of 35 after. No assertion was changed.
- **The gate still fails on what it exists to catch** (the product file was restored after each):
  - `requireTenantContext` removed from the mount: "`/api/cerv2-sections` must include requireTenantContext in its
    mount chain";
  - the mount commented out: "`app.use('/api/cerv2-sections', ...)` not found".

### `server/services/ana/__tests__/sub-agent-toolset.test.ts`: a sub-agent's tool took an input named `folder`

- **What it said:** "expected `[ 'list_project_documents.folder' ]` to deeply equal `[]`", in "no input of any child
  tool or check names a path, a directory or a folder".
- **Cause:** `069516d07e` (S4, 2026-11-10) gave `list_project_documents` a `folder` narrowing for the data catalog.
  That tool is one of the seventeen a sub-agent is offered (`RESEARCH_TOOLS`), and the rule is by name so that it
  stays cheap and cannot be argued with. The narrowing is a Vault folder of the catalog, not a file path: nothing
  unsafe was reachable. The session that added it has left (COORDINATION.md), so nobody held the red.
- **Fix:** the input is `filed_in`. It reaches the catalog as the catalog's own `folder` parameter and is checked by
  the catalog's own parser, as before (`server/services/ana/document-catalog-data-room.ts`, `CATALOG_NARROWINGS`).
  The rule and its test are unchanged. What the tool returns (`organizedBy.folder`, `proposedFolder`) is unchanged.
- **Red first:** two new cases in `document-catalog-data-room.test.ts` failed before the rename (`filed_in` was
  ignored; a `filed_in` that is not a Vault folder was not refused), with the trunk red. After: 12 files, 135 of 135,
  across the catalog tool's six suites, the sub-agent toolset and the five source-reading tests above.
- **Checked for anything that pins the input's name:** the tool register and the launch inventory name the tool, not
  its inputs; no prompt, skill or design document tells AnA to pass `folder`.

## Run at `21c6837180`, 2026-11-12 05:09 UTC (taken by MR-02 Stage 3, `01J935DZ…`)

The trunk-CI lane moved to screens on 2026-11-11, and CI's own verdicts arrive about 47 hours late. So the CI
throughput lane re-ran `ci.yml`'s jobs here, with the same commands, environment and fresh databases as above. It
used `npm ci` at that commit, PostgreSQL 16 with pgvector, the Noto fonts, and python-docx/lxml. The job record is
`run-2026-11-12/steps.txt`; the Test verdict's own summary is `run-2026-11-12/shards.json`.

| Job (ci.yml) | Command | Result (see "Not a clean run at one commit" below) |
|---|---|---|
| Integration Tests: real-database suite | install-fresh, deploy-migrate, `npm run test:db` as `app_service`, `RLS_ENFORCE=on` | 5 of 3,243 failed in 3 files (997 s) |
| Integration Tests: `RUN_INTEGRATION_TESTS` files | the job's `grep` list, three files | 17 passed, 27 skipped by their own guard |
| Test (shard 1/4) … (4/4) | `npm test -- --shard=N/4 --maxWorkers=3 --fileParallelism`, each on a fresh GCC database | 4, 1, 3 and 5 failed; 1,463, 1,420, 1,671 and 1,490 s |
| Test (the merge) | `merge-test-shards.mjs --shards 4` | 6,323 files collected, 6,323 ran, none missing, none twice; 82,895 tests, 13 failed; Jest passed in every shard |

Each shard took 24 to 28 minutes, on this 4-core container, three files at a time. That is what
`docs/evidence/MR-02/2026-10-30-ci-verdict/` predicted for CI's runners.

**Not a clean run at one commit (corrected 2026-11-12 by this lane's own adversarial review).** The run used the main
checkout, and this lane committed its fixes in that same checkout while the shards ran. It also made short-lived
edits there to show a test failing, and drafted GA-ADV-01 there. So:
- the real-database suite (05:09–05:26) and shard 1 (from 05:26:32) ran at `21c6837180`;
- shard 2 (from 05:50:58) also had `4f80673c6c` to `4f275c1793`;
- shards 3 and 4 (from 06:14:41 and 06:42:36) also had `bb05e5c0f7` and `269e57f168`, then `2381e2b632`.
Shard logs show edited sources in their code frames. A result for a file this lane edited during the run is
therefore not evidence for `21c6837180`. The replay this called for, in a detached worktree pinned to `ef0472c7b8`, follows under "Run pinned
at `ef0472c7b8`".

**The 18 reds, and what became of each.** Every fix below was shown red at HEAD, then green. Eight of the ten fix
commits also record a run in which the test was made to fail, by a change for that run only, on the case it exists to
catch. The two that do not:
- `4f275c1793`: the S5 one-home guard, red at head and green after; no separate run;
- `2381e2b632`: a time budget raised; the pinned replay above is its first run three files at a time.

| Red | Cause | Outcome |
|---|---|---|
| `tests/db/qms-project-records` (1) | `979554ff60`: a link past proposal states its reason; the test's link had none and was refused before the lock | fixed, `4f80673c6c` |
| `tests/db/commitment-fulfilment-evidence` (1) | `e107d2c149`: a commitment under a project the reader cannot open answers 404; the test expected the earlier 200 | fixed, `4c7557b4ee` |
| `tests/db/tenant-purge-blocking-keys` (3) | P-58 against P-104 (`fd04214563`) | the founder's; unchanged |
| `submissionRequiredDeliverables` | the header door "Gateway transmittals" (`eadab4b845`) matched `/transmit/` | fixed, `3f1797813d` |
| `authoringReturnedReviewOnOpen` | Review tasks back on the editor bar (`4197ede3a3`): two buttons by that name | fixed, `67d42404bc` |
| `s5-three-valued-helpers-have-one-home` | a second `listed()` in `filing-applicability.ts` (`5ed006764b`) | fixed, `4f275c1793` |
| `d0PhoneWidth` "no other stylesheet keeps a second copy" | CMC's own register scroll at every width (`687d0af9df`; D5 asked for it below 1120 px) beside D0's ≤640 px rule | handed to R1 (`01DiJJAk…`) |
| `cmdkPlaces` (palette focus rule) | `845a63b2bf` grew D0's composer list; the test pinned the whole list | fixed, `269e57f168` |
| `workbenchRemedies` "insert-empty" | a real race: the sections re-read after AnA's turn rebuilds the editor bridge during `propose`'s hash | handed to the Codex editor continuation |
| `globalBiotechTemplateEditor` (all filings) | 244 documents, 3,195 sections: 158 s alone, over 180 s three files at a time | fixed, `2381e2b632` |
| `vault-document-filter` (one predicate) | `data-room-vault.ts:168-169` builds its own (`d016d56eee`) | handed to the data room lane |
| `adminConsoleSettings` (2) | the Identity console door is a platform administrator's (`7dfb49b645`) | fixed, `846a0aebea` |
| `foundationsRetiredRatchet` (`cm-meta` 84 → 85) | `40cc8265b7`, `CmcModule.tsx`, a held file | handed to `01T2woo…` |
| `homeOpenItems` (approval row) | an approval opens its document (`4c6d882afd`) | fixed, `e35e967605` |
| `module3OperatingSystemRoutes` (incomplete record) | the refusal names inputs in words (`307d82d2af`); red since 2026-11-10 | fixed, `934bf5f927` |

Of the 15 reds that are not the founder's:
- **9** were a deliberate change that landed with its own tests updated, while a second test elsewhere still encoded
  the old behaviour. The new tests had mocked the database or covered only the component, and nobody ran the other
  suite before pushing. CI would have said so about 47 hours later.
- **4** were one-home or retired-name guards catching a new copy.
- **1** was a time budget the suite's size had outgrown.
- **1** was a real race.

**Not run here, and why:** Production Image Boot and Codespace (no route to npm from a container, as above). The
Lint job's 130 steps are next: its first 16 passed before the run was paused to push these fixes, since the
pre-push typecheck and the job's own cannot share this container's memory.

## Run pinned at `ef0472c7b8`, 2026-11-12 10:34 UTC (MR-02 Stage 3)

The same jobs as above, in a detached git worktree at `ef0472c7b8` that nothing else edited during the run. Its
`node_modules` was linked from the main checkout. Record: `run-2026-11-12-pinned/steps.txt` and `shards.json`.
(A first attempt at 10:32 was two copies of the script started by mistake, racing on one database. It was stopped
and is not counted.)

| Job | Result at `ef0472c7b8` |
|---|---|
| Real-database suite (`app_service`, `RLS_ENFORCE=on`) | 4 of 3,254 failed, in 2 files (1,164 s) |
| `RUN_INTEGRATION_TESTS` files | green |
| Test shards 1–4, three files at a time | 1, 1, 4 and 1 tests failed; 2 files failed to load; 1,520, 1,410, 1,656 and 1,440 s |
| The merge verdict | 6,358 collected, 6,358 ran, none missing, none twice; 83,454 tests, 7 failed |

**None of the reds this lane fixed in the first run came back.** What is red at `ef0472c7b8`:

| Red | Cause | Holder |
|---|---|---|
| `tests/db/tenant-purge-blocking-keys` (3) | P-58 against P-104 | the founder |
| `tests/db/entitlement-schema-posture`, "ci:migration-drop-safety:selftest exits 0" | Only when the checkout sits under the OS temp directory: the selftest's fixtures read as "missing from the repo". 12 of 12 pass in `/home/user/…`. Not a trunk red. | none |
| `d0PhoneWidth` | CMC's register scroll beside D0's rule (`687d0af9df`) | R1 (`01DiJJAk…`) |
| `workbenchRemedies` "insert-empty" | the editor bridge rebuilt during `propose` | the Codex editor continuation |
| `vault-document-filter` | `data-room-vault.ts` builds its own Vault predicate | data room (`01QoxbLdTrwY…`) |
| `foundationsRetiredRatchet` (`cm-meta` 84 → 85) | `40cc8265b7` | `01T2woo…` |
| `homeStartHere` | "Get started" on Home (`75624cff54`) | S13 (`01QoxbLZhyA6…`) |
| `launch-scope.test.ts` "the shell no longer carries training" | Help & training is a launch surface now (`1207a3c307`, P-127) | S13, new |
| `hostilePayloadProbe` "training" | `Training.tsx:188` reads `index.data?.courses.map(…)`: throws on 7 of 8 unexpected responses | S13, new |
| `csr-jobs-narratives.pglite` and `tests/unit/csr-jobs-routes` (do not load) | `f4a56a5058` made `csr-jobs.ts` import `csr-import-into-document`; their `csr-builder` mock lacks `flattenICHE3Sections` | CSR path (`01QoxbLZjz…`), new |

`2381e2b632`'s budget held three files at a time: the all-filings editor probe passed in shard 3.
