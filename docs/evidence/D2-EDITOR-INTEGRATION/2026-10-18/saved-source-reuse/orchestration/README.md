# Saved build references: editor orchestration

The existing build disclosure now offers explicit **Check saved sources** and
**Use saved sources** actions. Historical references have their own read lane;
they do not restore old plans, reasons, AnA settings or candidate text. Reuse
reads the exact same saved event and manifest again, then uses the existing
source-selection setter. A fresh template preview is still required.

The saved-source helper guards actor/session/project visit, document and source
revision, plus its private attempt token. Dirty/edit permission/frozen changes,
review-pane changes and a primary build attempt invalidate pending reuse.
Checks remain read-only while those editing restrictions are present. New
source selections take precedence. Structural and candidate acceptance unknown
holds remain in their existing state. Opening an ordinary review pane does not
invalidate the existing build queue: only saved-source reuse tracks that pane.

The notice reuses the current disclosure, source detail, governed timestamp,
button and note patterns. No editor, stylesheet, dependency, provider request,
storage preference or navigation surface was added.

## Evidence

- `baseline-red.log`: three real missing-feature failures before implementation:
  missing controller actions and missing Check button in the actual disclosure.
  A separate hash of that initial test version was not captured.
- `first-candidate-fixture-failure.log`: two passing controller cases and one
  unsupported jest-dom matcher. The actual UI query succeeded. Correcting the
  matcher required no production change.
- `focused-green35.log`: the first expanded lifecycle run, 35/35 passing.
- `final-green60.log`: 36 new saved-source cases plus 12 existing assembly and
  12 existing selected-source regressions, 60/60 passing with Node22/4096MB.
- `source-pins.json`: final source and test SHA256 values.
- `lint.json`: eight scoped files have zero errors/warnings. Workbench has zero
  errors and the same 13 warning rules as canonical base `e62320e0a`; full
  diagnostics are preserved without duplicating its complete source text.
- `summary.json`: machine-readable outcomes and limits.
- `log-storage.json`: complete original UTF-8 log bytes, actual command exit
  statuses, and original/stored SHA256 values. Readable `.log` files remove
  surplus trailing CR/LF only and retain one final LF for whitespace checks;
  no diagnostic or result text was removed.

The new cases cover exact scoped affirmative receipts, explicit null versus
failure, changed event/time/manifest refusal, JSON-await ownership, immediate
double actions, source/context ABA, retired finalizers, late dirty/review/build
changes, selection precedence and preservation of uncertain write/review holds.
Requests use synthetic HTTP. Independent actual Workbench and browser evidence
is in sibling directories; these tests do not claim live provider or human
testing.

## Reproduction

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH \
NODE_OPTIONS=--max-old-space-size=4096 \
node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  client/src/concept2cure/v2/editor/__tests__/savedAssemblySources.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/authoringAssemblyBuild.test.tsx \
  client/src/concept2cure/v2/editor/__tests__/authoringAssemblySources.test.tsx
```

This owner did not run the compiler, build, warning ratchet or Git mutations;
the root session owns those release checks and canonical publication.
