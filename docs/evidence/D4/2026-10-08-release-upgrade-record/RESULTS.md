# W3 / D4 — release upgrade record repair

Release assembly now reads the live deploy replay step, requires one exact
matching record and requires that record to be completed. The workflow's
stronger replay command is preserved: a second deploy must rebuild nothing.
Duplicate success/failure records are refused in both orders; an in-progress
step carrying a success conclusion is refused. Completed failed, timed-out,
skipped, cancelled and unknown conclusions remain honest failed/unknown evidence,
and the unchanged manifest validator refuses each non-success upgrade result.

The actual `6a54db1` run completed its blank-database migration job successfully.
The release assembly job then failed on the obsolete exact step name:
`REMOTE-RED.json` preserves that log line and the real successful step record.
The previous synthetic fixture copied names from `UPGRADE_STEPS`, so its all-green
result could not detect workflow drift. Fixtures now derive the two actual
upgrade commands from the parsed live CI YAML; a parity assertion binds their
names uniquely to the assembler.

## Verification

- Fifteen new controls on the unmodified assembler: 13 failed, 2 passed,
  exit 1 (`RED.txt`). After only aligning the name, six duplicate/incomplete
  lookup controls still failed, nine passed, exit 1 (`LOOKUP-RED.txt`).
- All four release-evidence test files pass 62 cases with zero skipped, cancelled
  or todo cases (`GREEN.txt`). The existing actual CLI generate/validate contract,
  artifact rehashing, dirty-worktree and approval-schema refusals remain intact.
- `API-SNAPSHOT.json` archives the relevant actual GitHub API record fields for
  the exact `6a54db1` run and its same-source CodeQL, Semgrep and browser runs.
  Replaying that snapshot through the historical assembler reproduces the real
  missing-step refusal (`SNAPSHOT-RED.json`). The repaired assembler emits six
  primary files, nine policy workflow records and both passed upgrade records
  (`SNAPSHOT-GREEN.json`). Upgrade step records equal the captured API values;
  the downloaded npm-audit file's bytes remain unchanged. This is a **local replay
  of actual records**, not a claim that the candidate's remote release job passed.
- Scoped ESLint exits 0: the assembler remains ignored by the existing config;
  the test file has no findings. No lint configuration or baseline is changed.
  Normal commit and full unchanged pre-push hooks apply. The `.mjs`/evidence-only
  edit is subject to their ordinary type-relevance decision; no full local
  compiler runs on the 8-GiB host.

## Scope and reproduction

Only `scripts/release-evidence/assemble-input.mjs` and its existing test file
change outside this evidence directory. `SCOPE.json` pins the workflow, policy,
schema, lib/CLI, remaining release tests, CI guards and other top-level source
objects separately from their paths. Migration commands, statistical/scientific
baselines, credential rules and recorded human approvals remain unchanged.

Run `node --test tests/release-evidence/*.test.mjs`. For the actual-record replay,
download npm-audit artifact 11515947842 from run 37697288645 and extract
`dependency-audit-results.json`. Copy `REPRODUCER.mjs.txt` to a scratch `.mjs` file
and pass this evidence directory, checkout root and the extracted audit path.
An optional fourth argument selects the historical assembler; put the unchanged
`lib.mjs` beside that scratch copy, as its relative import requires.

This repair removes an assembly blocker and strengthens record integrity. The
candidate's full remote release rerun, coverage, human approval and complete D4
/ commercial readiness remain independent. No release is approved by this change.
Actual failed assembly job:
https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37697288645/job/113076409139
