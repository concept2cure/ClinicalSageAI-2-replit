# Typed PGlite fixture successor, 2026-10-18

The full compiler reported TS2571 on the project writeback assertion because the PGlite query's default row value was `unknown`. The query now supplies the exact row generic `<{ project_id: number }>`. The existing assertion still requires the stored value to be project **42**; no `any`, cast, assertion removal or production change was introduced.

After that type-only change, the exact project-recall suite passed **8/8 cases**, one file, zero skips, exit 0, **3.99s**. `2026-10-18-typed-fixture-green.log` retains the output. Run with the session Node 22 binary first on PATH and a 4096 MiB heap:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  server/services/__tests__/working-memory-project-recall.pglite.test.ts
```

`2026-10-18-typed-fixture-pins.json` pins the new fixture and the current recall/JSON source snapshot, records differences from the static-SQL24 snapshot, and verifies that the working-memory production source is unchanged. `git diff --check` for the fixture passes. Root owns the full compiler rerun and release-gate conclusion; this local packet makes no independent full-typecheck claim.

The prior **24/4**, **86/11** and **42/4** observations retain their earlier source pins. No fresh larger regression run is claimed for this type-only successor. Existing mocked-gateway/vector and live-grounding/browser acceptance limits remain unchanged.
