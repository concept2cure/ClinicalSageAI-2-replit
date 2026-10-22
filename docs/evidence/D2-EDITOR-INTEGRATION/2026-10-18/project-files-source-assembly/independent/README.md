# Independent Project files assembly qualification

W1 / D2. Resumed 2026-10-20 on canonical source
`e1c63ae9b024ed0ecde835f61c07ecb589eab67d`, following the
[existing integration contract](../../../../../design/PROJECT_FILES_SOURCE_ASSEMBLY_2026-10-18.md).
The bounded [actual Workbench test](../../../../../../client/src/concept2cure/v2/editor/__tests__/projectFilesAssemblyFlow.test.tsx)
passes **9/9** with Node `v22.23.3` and process exit **0**.
No test or production correction was needed after the canonical update.

## Current proof

The [test receipt](current-tests-receipt.json) records the exact command,
canonical base, runtime, process status, complete raw UTF-8 output and 29 source,
test and configuration hashes before and after execution. Every hash stayed
unchanged. The [readable output](current-tests.txt) reports all nine passing
cases. The [scoped ESLint receipt](current-lint-receipt.json) records exit 0,
zero errors and zero warnings, with the same test hash before and after lint.

The tests mount actual `DocumentWorkbench`, `ProjectFilesPanel`, selected-file
actions, shared chooser, target receiver, build controller/transport and draft
review. They qualify these boundaries:

- A selected upload beside the document offers **Build in editor** while one
  canonical rich editor remains mounted. Opening the rail does not preview,
  build or generate.
- Both explicit build modes preserve the exact Vault document UUID and supplied
  checksum. A tree row's `up-` display identity never becomes the source ID.
  Retained sources remain selectable when original bytes are unavailable;
  whole-source import keeps its separate restriction.
- The chooser and accepted local handoff perform GETs only and use the existing
  editor receiver, without external navigation. A fresh preview and deliberate
  build carry the same selectors. The AnA request carries the exact synthetic
  manifest; its candidate is reviewed without automatic acceptance or insertion.
- Canceling dirty navigation retains the original editor, unsaved text and
  earlier Data Room selection. A subsequent explicit guarded leave adopts only
  the chosen Vault source.
- An open governed form holds the handoff without disturbing the canvas.
  Closing that form allows an explicit retry.
- Delayed chooser results cannot cross a project A → B → A visit, a held
  effective-project/shell-project mismatch or a selected-upload change.
- A later search-page match uses its returned Vault UUID without inventing a
  checksum or substituting a Data Room identity.

These counts overlap root combined replays; do not sum them as separate tests.

## Interrupted historical proof

Work began at `3cae08d236ba5be6dd96284bca2c47b4605c007d` on 2026-10-18.
The [baseline source pins](baseline-source-pins.json) and exact
[baseline test snapshot](baseline-test.tsx.txt) retain the one-case missing-action
check. Its [original failure output](historical-baseline-red.txt) reports one
failed test because the selected Vault footer lacked **Build in editor**.
The test snapshot matches its recorded hash; the four production pins identify
the original base, rather than the resumed checkout.

The interrupted candidate's [green output](historical-candidate-green.txt)
reports nine passing cases. Its [lint JSON](historical-lint.json) reports zero
errors and warnings. Numeric process exit statuses and final before/after source
bindings were not retained for those historical runs. They are historical
observations and do not qualify the resumed source.

[Historical storage](historical-receipt-storage.json) preserves complete original
UTF-8, original and stored hashes/byte counts, and explicitly null historical
process statuses. Only surplus trailing CR/LF was removed from the readable
logs, retaining one final LF. The ignored `baseline-red.log` was replaced by
the preserved text/JSON artifacts so it cannot be omitted silently at staging.

## Reproduction and limits

From the repository root, use the existing Node 22 toolchain:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts client/src/concept2cure/v2/editor/__tests__/projectFilesAssemblyFlow.test.tsx
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH npx eslint client/src/concept2cure/v2/editor/__tests__/projectFilesAssemblyFlow.test.tsx --max-warnings 0 --format json
```

HTTP, authentication and provider responses are synthetic. Collaboration,
filing placement and creation controls are stubbed outside this bounded flow.
This proves client identity propagation and guards, not live backend source
admission, excerpt verification, audit integrity, model consumption, scientific
correctness, filing readiness, native PostgreSQL concurrency/RLS, full-shell
navigation, accessibility compliance or human acceptance. Separate entry,
browser, backend and root release evidence retain their own scopes.
