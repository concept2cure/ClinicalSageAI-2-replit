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

**Not reproduced here:**
- Coverage and nightly governance run only on the schedule.
- Production boot smoke, production image boot and Codespace need a Docker daemon. This container has the client
  but no daemon.
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

## Still red, handed over (COORDINATION.md)

- `tests/db/estar-audit-admission.dbtest.ts` goes to Vault parity, whose row holds `pathway-engines/estar/**` and
  its tests.
  - **Cause:** since `776d9da460` the UPDATE runs on a checked-out client, and the barrier is still on `pool.query`.
  - **Proposed fix:** `estar-barrier-proposed.diff`. It ran 13/13 five times, and turns red when the status guard is
    removed.
- `tests/db/tenant-purge-blocking-keys.dbtest.ts` needs a founder decision.
  - **Cause:** the P-104 owner boundary on `ana_relational_profiles` (`fd04214563`) leaves the D6 purge unable to
    erase a project-bound profile. The purge fails 23503, and the whole erasure rolls back.
  - **The conflict:** P-58 (the export returns every row the purge erases) against P-104 (a private profile admits
    only its owner).
- Already handed over earlier, and still open:
  - the founder-path walk's seal gates;
  - S6's reason for change;
  - the sub-agent path check;
  - `auditLogger.js`, which runs on no live request.
