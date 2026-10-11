# Ownership qualification fixture closure

This qualification follow-up resolves the one stale fixture documented by the AnA speed batch. Scope is only `tests/schema-contract/chat-thread-access.contract.test.ts` and this evidence directory. Base: `b015e409c268ca69965686710a18093b73e404b5`, on the canonical `concept2cure-v2` branch. No production code, compiler configuration, gate or baseline changes are made.

## Defect and repair

The program-list fixture supplied organization and program IDs but omitted the caller's identity. The existing handler intentionally returns an empty list for an unidentified caller; the fixture incorrectly expected a private thread to appear. `red.log` reproduces the failure before repair: 12 passed / 1 failed.

The fixture now supplies the caller's `userId`, matching the existing handler. It creates real Alice and Bob threads in the same organization and program, plus a Carol thread in another tenant, and checks both visibility and exclusions. Each identified caller sees their own thread. Alice and Bob do not see each other's threads; Carol's tenant list excludes Alice's thread and Alice's rejected cross-tenant program binding. Alice's list for the foreign program and the unidentified caller's list are empty. These assertions exercise the unchanged production handler against PGlite with the repository's actual migrations.

## Verification

- Node 22.23.3, Vitest 4.1.7: **13 / 13 passed**, including the repaired owner-list contract (`green.log`).
- Focused ESLint: **0 errors / 0 warnings** (`eslint.json`).
- `git diff --check`: passed.
- No compiler was run by this implementation session; the control-tower session owns compiler and publication qualification.

Commands, from the repository root with Node 22 first in `PATH`:

```bash
NODE_OPTIONS=--max-old-space-size=4096 node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/schema-contract/chat-thread-access.contract.test.ts
node node_modules/eslint/bin/eslint.js tests/schema-contract/chat-thread-access.contract.test.ts --format json
git diff --check
```

The original speed-delivery logs remain historical evidence of the earlier fixture failure. This follow-up closes that specific limitation without weakening the caller-identity requirement.
