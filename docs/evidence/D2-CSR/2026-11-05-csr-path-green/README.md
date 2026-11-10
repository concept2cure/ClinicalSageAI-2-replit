# D2: the CSR path's test suites green again, and demo defects F2, F9 and F10 closed (2026-11-05)

Launch row D2, workstream W1, package F1 (repairs). The CSR lane's existing files only. No new screen, route file,
service, table or AnA tool.

On 2026-11-03 another lane pushed about 60 CSR commits through a connector without running them
(`../2026-11-03-governed-review-import/README.md`: "NOT verified"). One left `CsrBuildProgress.tsx` unparseable; the
lead fixed that on trunk in `58e6cf7623`. This session ran every suite on the CSR path, decided each failure, and then
closed three defects from the founder's demo walk (`../2026-11-02-phase2-demo-walk/README.md`, F2, F9 and F10), each
red first.

## What already exists (RULE 3)

Everything below existed before this session. Each change completes, reaches or fixes one of these.

| Piece | Path | What it did before | What it did not do |
|---|---|---|---|
| Section review on the build | `client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx` `CsrHeadingReview` | Listed the build's ICH E3 headings with their review state. Recorded submit, approve and send back against the content hash. Since 11-03 it read the saved text ("Read saved section text") and allowed Approve only after that read. | Its summary line was long and unclear. A template row still showed a disabled "Send for review" or "Approve". The text it showed ran every line together. |
| Build list on the CSR document | `client/src/concept2cure/v2/surfaces/CsrRunBuilds.tsx` | Listed a run's builds with status and progress. Validated each row strictly. Carried the review, narratives and assembly. | It showed no failure reason. It did not validate the heading's `placeholder` flag. |
| Build list read | `server/routes/csr-jobs.ts` `GET /api/csr/jobs?programId&runId` | Returned id, study, status, progress and updated-at, scoped to the organization and the project. | It returned no failure reason. |
| Job status read | `server/routes/csr-jobs.ts` `GET /api/csr/jobs/:jobId` | Returned the stored receipt. | It has no client caller (see "Not changed"). |
| Section text read | `server/routes/csr-jobs.ts` `GET /api/csr/jobs/:jobId/sections?sectionNumber=` | Returned one heading's saved text, after checking it against its SHA-256 (11-03). | — |
| Heading tree | `server/services/csr/csr-headings.ts` `buildHeadings` | Marked a heading `placeholder` when its saved text holds a data placeholder (11-02, `b2a8bc4c50`). | It had no test. |
| The one placeholder rule | `shared/authoring/csr-scientific-review.ts` `CSR_DATA_PLACEHOLDER`; `server/services/csr/csr-placeholders.ts` `hasUnresolvedPlaceholders` | Shared by the runner, the heading tree, section review and assembly placement. | Unchanged. No second rule was added. |
| Section review server | `server/services/csr/csr-section-review.ts` | Refused submit or approve of placeholder text (`CSR_SECTION_DATA_PLACEHOLDER`). | Unchanged. |
| Job runner receipts | `server/services/csr/csr-job-runner.ts` `safeCsrJobFailure`; `server/services/csr/csr-job-evidence.ts` `RECOVERY_MESSAGES` | Redacted raw errors to a typed `CSR_*` code (11-03). | It also dropped the three recovery sentences its own module authors. |
| Death-count check | `server/services/csr/unsupplied-statistics.ts` `unsupportedCsrDeathCounts` | Refused a death figure that no death row supports (11-03). | It reported an unclaimed figure as a cell mismatch. |

Searches run: `git log` on every file above since 2026-10-28, `git log -S` for "Template · data missing", "free of
data placeholders", `StudyPivotalDeclarations` and `controller.signal`, and `grep` for `CSR_DATA_PLACEHOLDER`,
`hasUnresolvedPlaceholders`, `RECOVERY_MESSAGES`, `safeCsrJobFailure`, `outcome_cell_mismatch` and every test that
imports a CSR module (87 files).

## The suites, and each failure decided

The run covered:
- the client: 19 files, plus 3 more that import CSR modules;
- the server: 101 files under `server/services/csr/__tests__`, `server/services/__tests__/csr-*`,
  `server/routes/__tests__/csr-*`, `authoringWorkflowImport*`, `orchestrator-csr-readiness`,
  `server/services/authoring/__tests__` (CSR, workflow and authoring source import), the `server/services/ana`
  CSR suites, `tests/unit/csr-*` and `tests/regulatory/csr-*`;
- 21 further files that import a CSR module.

On trunk before this session, 20 tests failed in 8 files (`red/client-suites-before.txt`,
`red/server-suites-before.txt`). The 21 further files all passed.

| Suite (failed) | Cause | Decision | Commit |
|---|---|---|---|
| `csr-job-runner.source-revalidation` (7) | The runner saves each section in `d.transaction` (`0441fa1bec`). This fake had no `transaction()`; the other three runner fakes were updated. | The test pinned a superseded detail. The fake now runs the callback on the same double. No assertion changed. | `6ef0c45c78` |
| `csr-job-runner.source-revalidation` (4 of the 7) | The 11-03 redaction dropped `csr-job-evidence.ts`'s fixed recovery sentences ("… Existing outputs were retained … start a new CSR build."). | The test was right. The receipt now keeps that code's fixed sentence. It still never keeps the error's own text: the planted-subject-id case still passes. | `54945d1d2e` |
| `csr-narrative-run.pglite` (3) | Each narrative save is now a transaction (`e3b05b8c0c`). The fake's dead connection left the shared PGlite session aborted (25P02). | The test pinned a superseded connection model. A lost connection now ends its transaction, as PostgreSQL does. | `d7ec8c754a` |
| `unsupplied-statistics` (1), `csr-results-claim-provenance` (1) | An unclaimed death figure was refused as `outcome_cell_mismatch`. That check exists for a misclaimed figure. | The tests were right. A misclaimed figure is `outcome_cell_mismatch`; an unclaimed one is `unreconciled_figures`. Nothing refused before is accepted now: a probe stays refused in §2, §10.1 and §12.3. | `30cf348d4d` |
| `csrBuildProgress` (4) | The panel's pivotal-declarations read (since 10-31) was answered `{}` by these 11-02 cases. That made a second alert. | The mocks were incomplete. They now answer that read; no assertion changed. | `234d199ca2` |
| `csrWorkflowProgramScope` (1) | The live read passes headers and an `AbortSignal` (`c3794c8fef`, 10-30). | The test pinned a superseded call shape. It now asserts the same path with the extra arguments. | `6d228fc409` |
| `reviewDecisionCsrEvidence` (2) | The document study-data read now fails closed on a malformed body (`dac7ef326c`). Two older mocks answered `{ success: true }`. | The mocks predated the read. They now answer `{ studyData: [] }`. The fail-closed case still passes. | `3c1ee5fccc` |
| `csrCardReach` (1) | The case expected the old summary copy, then approved without reading the saved text. Reading first has been required since 11-03. | Its summary passes with F2. It reads before approving with F9. | `e92252c1b2`, `a8a2f3d06e` |

No test was deleted or skipped. No fail-closed check was weakened.

## The demo defects

### F2: a template row was counted and labelled as drafted (`e92252c1b2`)

**Before.** The review said "18 of 119 … drafted", and template rows showed "Draft · Send for review".

The 11-02 commits had already added the server flag and the chip. Three things were still wrong:
- the summary was hard to read;
- a template row still offered a disabled "Send for review" or "Approve";
- the card accepted any value for the flag.

**After.**
- **Summary.** "N of M ICH E3 headings drafted · A approved", with "· K is/are template text with data missing" when
  there are any.
- **The template row.** It says "The build kept its template text here: the study's data is still missing, so it is not
  offered for review."
- **Its actions.** It offers neither review nor approval; the server refuses both. One that was sent for review earlier
  can still be sent back, and its text can still be read.
- **The flag.** It must be a boolean, or the headings read is refused.

**Tests.**
- Client: red then green (`red/f2-f9-section-review.txt`).
- Server: `GET …/headings` serves `placeholder: true` for the builder's §9.8 template (`ai_generated = false`), and
  submit is refused with `CSR_SECTION_DATA_PLACEHOLDER`. Removing the flag fails this case
  (`red/f2-server-mutation.txt`).

### F9: an approver could not read the text before approving (`a8a2f3d06e`)

**What 11-03 had already added.** A read of the saved text and an Approve that waits for it.

**What was still wrong.** The text was flattened onto one line, so lists and paragraphs were lost. `&#8217;` was left
raw. `&amp;lt;` was decoded twice.

**After.** A block tag or line break ends a line. Entities are decoded once. At most one blank line is kept. The card
review case now reads §10.1 first, sees its two paragraphs, and then approves.

**Tests.**
- Client: red then green.
- Server: the headings read and the section read agree on the hash, and the SHA-256 of the served text is that hash.

### F10: a failed build showed no reason (`dd5b03c24d`)

**The list.** `GET /api/csr/jobs?programId&runId` now returns `failure` for a failed build. `csrBuildFailureText` in
`csr-job-runner.ts` chooses a fixed sentence from the receipt's typed reason or code and names its sections. For
example: "Not complete: §2, §5.1 and §9.8 still hold a data placeholder ("[…]") where the study's data is missing."
The stored message is never read: receipts written before 11-03 can hold raw driver errors.

**The build card.** `CsrRunBuilds.tsx` shows the reason as an alert. A reason that is not text refuses the list.

**Tests.**
- Server: red then green over five receipts (`red/f10-list-read.txt`). One is a raw driver error with a path, which
  never reaches the body.
- Client: red then green (`red/f10-build-card.txt`).
- `ci:server-error-leaks`: OK.

## Final counts

| Run | Files | Tests |
|---|---|---|
| Client CSR suites (`green/client-suites-after.txt`) | 22 passed | 278 passed |
| Server CSR suites (`green/server-suites-after.txt`) | 101 passed | 1,082 passed |
| Further suites that import a CSR module (`green/further-suites-after.txt`) | 21 passed | 564 passed |

Before this session: 8 files and 20 tests failed (the client 4 files and 8 tests, the server 4 files and 12 tests).

**Gates.**
- **`node scripts/ci/check-one-design-plan.mjs`.** OK: 10 commits inside the plan.
- **`node scripts/ci/check-server-error-leaks.mjs`.** OK.
- **ESLint on every touched file.** No file's warning count rose:
  - `csr-jobs.ts`: 1, as before;
  - `csr-job-runner.ts`: 4, as before;
  - `unsupplied-statistics.ts`: 1, as before;
  - every other touched file: 0.
- **`ci:typecheck:no-regression`.** Did not complete in this session, so it is reported as not run.
  - **Why.** Each of four attempts was OOM-killed: the session's shared cgroup is 14.3 GB, and other sessions' servers,
    browsers and compiles held 5 to 8.5 GB of it.
  - **What did run.** A scoped tsc over the changed files and their imports, which is not equivalent. It found 0
    errors in the changed files, and 10 in untouched files that are artifacts of a scoped program
    (`green/typecheck.txt`).
  - **Owed.** The full gate must run in CI or on a host with the memory before this is called typechecked.

## Not changed here, on record

- **The job status read.** `GET /api/csr/jobs/:jobId` (`server/routes/csr-jobs.ts:349`, from
  `getCSRBuildJobStatus`, `csr-job-runner.ts:879`) still returns the stored receipt, `message` included. A receipt
  written before the 11-03 redaction can carry a raw driver or provider error in that 200 body. No client calls this
  route. It should state `csrBuildFailureText` too; that is a contract change for its callers, so it is left to the
  lead.
- **Build progress.** The runner counts a template section as done (`csr-job-runner.ts:639`, `:679`), so a
  template-only build that failed can show a high percentage. The F10 reason now says why it failed.
- **Approvals made before the rule.** A template row approved before 11-02 (build 2 of the demo walk) still counts as
  approved and can be imported. The scientific review refuses its placeholder downstream (F8).
- **The running app.** Not opened by this session. The demo walk on ports 5000 and 5100 belongs to another agent, and
  those servers were not restarted, so they run the code from before these commits.

## Reproduce

```
npx vitest run client/src/concept2cure/v2/__tests__/csrBuildProgress.test.tsx \
  client/src/concept2cure/v2/__tests__/csrCardReach.test.tsx \
  server/routes/__tests__/csr-jobs-build-and-review.pglite.test.ts \
  server/services/csr/__tests__/csr-job-runner.source-revalidation.test.ts \
  server/services/csr/__tests__/csr-narrative-run.pglite.test.ts \
  server/services/csr/__tests__/unsupplied-statistics.test.ts
```
