# Independent existing-editor assembly interactions

W1 / D2. The test mounts the actual DocumentWorkbench and RichSectionEditor,
assembly controller, runtime receipt transport and AuthoringAiDraft panel. It
uses the actual AuthService session guards and shell project visits. HTTP is
synthetic; the useAuth display context and unrelated collaboration, filing and
creation controls are stubbed. No alternate editor or acceptance implementation
is substituted.

The 16 bounded cases cover exact document and single-section builds without
AnA requests; preservation of existing text, section order and current editor;
held lost/malformed/foreign commit receipts; edits made during a commit and
its subsequent section refresh; project round trips, account/organization
changes and unmount; sequential empty-section generation; retained review
body/reason across switches and while another candidate is generated; the
existing dirty-editor leave decision; and a provider refusal which preserves
the completed candidate without an automatic retry. AnA cases assert that no
acceptance request is sent automatically.

Evidence progression:

- `baseline-missing-build.json`: the real mounted editor lacked the build
  disclosure. This proves baseline absence, not safety regression coverage.
  An earlier fixture-only AuthProvider/cleanup mistake is qualified in the
  receipt and was corrected before the retained behavioral baseline.
- `candidate-first.json`: 12/13 passed. The remaining failure was a test
  assumption: an exact confirmed commit can remain confirmed when later edits
  suppress its refresh and drafting. The test was corrected; no product defect
  is attributed to that expectation.
- `candidate-queued-review-red.json`: 14/15 passed. The first completed
  candidate's Review control was disabled while the second generation was
  pending, preventing review in the existing panel. The UI owner enabled that
  control while retaining fresh scoped reads and the existing leave guard.
- `candidate-interim-green.json`: the 15-case interaction replay passed after
  that correction. These intermediate runs occurred while source owners were
  active; they make no exact byte-pin claim.
- `pre-refreeze-interim.json`: 16 cases and strict lint passed, but the pin
  comparison detected the final queue/UI retry refinement during that run.
  This receipt is explicitly interim and is superseded by the frozen replay.
- `pre-layout-green.json`: the same 16 cases passed on stable source before
  the mobile width correction, controlled-session Discard continuity fix and
  root move into the existing document scroll region. The final replay uses
  those corrections without adding cases.
- `pre-typing-correction-green.json`: the post-layout interaction and lint run
  passed, then the official compiler found an invalid null argument in test
  teardown. The canonical publisher now receives an empty ID, which its readers
  treat as no project. The final replay includes this test-only correction;
  production code did not change.
- `workbench-final.json`, `eslint-final.json` and `final-source-pins.json` record
  the final 16-case run, strict warning-free test lint and before/after SHA-256
  source pins. The pin receipt states whether the tested sources stayed stable.

All log bytes are retained as JSON strings with their original raw SHA-256.
This avoids whitespace normalization changing the captured proof.

Reproduce with Node 22, from the repository root:

```sh
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run --config vitest.config.ts client/src/concept2cure/v2/editor/__tests__/workbenchAssemblyBuild.test.tsx
./node_modules/.bin/eslint --max-warnings 0 client/src/concept2cure/v2/editor/__tests__/workbenchAssemblyBuild.test.tsx
```

These tests do not exercise live providers, native PostgreSQL, a browser or
human review. Synthetic generated candidates establish orchestration behavior,
not scientific correctness, filing readiness or deployment readiness.
