# U8: export style packs resolved to a path that does not exist in the production bundle

Launch row: D1 (hosted production). Date: 2026-09-25. Branch: `concept2cure-v2`.

## Defect

`server/export/stylePacks/config.ts` (before this change, lines 4-5 and 14-24):

```ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
...
'510k_v1': { html: path.join(__dirname, '510k_v1.html'), css: path.join(__dirname, 'print.css') },
```

Production runs `node dist/index.js`, a single esbuild bundle
(`scripts/build-server.mjs`). In the bundle `import.meta.url` is
`dist/index.js`, so every pack resolved to `/app/dist/510k_v1.html`,
`/app/dist/pma_v1.html`, `/app/dist/cer_mdr_v1.html`, `/app/dist/print.css`.
None of those files exist. The files are at `/app/server/export/stylePacks/`
(`Dockerfile.optimized` line 117 copies `server/` into the image).

`renderers.ts:335-336` reads `pack.html` and `pack.css` with `fs.readFile`, so
every caller threw ENOENT and returned 500 in production:

- `renderPdfBuffersFor510k` (`server/export/renderers.ts:483`),
  `renderPdfBuffersForPma` (`:560`), the CER renderer (`:626`), and the
  pack-key path at `:704`
- `POST /api/510k/estar/build` (`server/routes/510k-estar-routes.ts:408`, `:425`)
- CER v2 510(k)/PMA/CER exports (`server/routes/cerv2-export-routes.ts:433-452`)

The unit suites did not catch it: they run the source unbundled, where
`__dirname` is the source directory, and the three route tests replaced
`stylePacks` with `{}` via `vi.mock`.

## Fix

`server/export/stylePacks/config.ts` now resolves the directory from the working
directory, the same approach and comment as
`server/services/ai-gateway/prompts-dir.ts`:

```ts
export const STYLE_PACKS_DIR = path.resolve(process.cwd(), 'server', 'export', 'stylePacks');
```

Dev (`tsx server/index.ts`, cwd = repo root), prod (`node dist/index.js`,
WORKDIR `/app`, `server/` copied to `/app/server`) and the test runner all
resolve to the real files. The `import.meta.url` / `__dirname` code was
removed.

A full server bundle built with the production options
(`SERVER_BUILD_OPTIONS`, entry `server/index.ts`, written to a scratch
directory, not `dist/`) contains:

```
STYLE_PACKS_DIR=path52.resolve(process.cwd(),"server","export","stylePacks"),stylePacks={"510k_v1":{html:path52.join(STYLE_PACKS_DIR,"510k_v1.html"),...
```

## Proof

New test: `tests/export/stylepacks-bundle-resolution.test.ts`.

1. Every pack production code selects (`510k_v1`, `pma_v1`, `cer_mdr_v1`) is defined.
2. The source module's html/css paths all exist.
3. Bundle condition: `config.ts` is built with `SERVER_BUILD_OPTIONS` from
   `scripts/build-server.mjs` into `<tmpAppRoot>/dist/index.js`. The temporary
   app root has `server/` as a symlink to the repo's `server/`, matching the
   image layout. The bundle runs in plain `node` with cwd = app root. The test
   asserts every html/css path it prints exists and sits under the app root.

### Before the fix (fails)

```
$ npx vitest run tests/export/stylepacks-bundle-resolution.test.ts
 ✓ ... > defines every pack production code selects
 ✓ ... > source module (tsx / vitest): every html and css path exists
 × ... > production bundle (esbuild → <appRoot>/dist, node, cwd = appRoot): every html and css path exists
AssertionError: Bundled stylePacks resolve to files that do not exist (would ENOENT → 500 in production):
+   "510k_v1.html → /tmp/c2c-stylepacks-p5ZS86/dist/510k_v1.html",
+   "510k_v1.css → /tmp/c2c-stylepacks-p5ZS86/dist/print.css",
+   "pma_v1.html → /tmp/c2c-stylepacks-p5ZS86/dist/pma_v1.html",
+   "pma_v1.css → /tmp/c2c-stylepacks-p5ZS86/dist/print.css",
+   "cer_mdr_v1.html → /tmp/c2c-stylepacks-p5ZS86/dist/cer_mdr_v1.html",
+   "cer_mdr_v1.css → /tmp/c2c-stylepacks-p5ZS86/dist/print.css",
      Tests  1 failed | 2 passed (3)
```

This matches the production failure: the source-level check passes, and only
the bundled module points at `dist/`.

### After the fix (passes)

```
$ npx vitest run tests/export/stylepacks-bundle-resolution.test.ts
 ✓ ... > defines every pack production code selects
 ✓ ... > source module (tsx / vitest): every html and css path exists
 ✓ ... > production bundle (esbuild → <appRoot>/dist, node, cwd = appRoot): every html and css path exists
      Tests  3 passed (3)
```

### Mutation check

To test the check itself, `STYLE_PACKS_DIR` was temporarily set to
`path.resolve(process.cwd(), 'dist')` and then restored. Three tests failed:
both source and bundle checks in the new test, and the new route assertion in
`estar-export-governance.test.ts`
(`AssertionError: /home/user/ClinicalSageAI-2-replit/dist/510k_v1.html: expected false to be true`).

## Route test no longer mocks stylePacks

In `tests/routes/estar-export-governance.test.ts`, the
`vi.mock('../../server/export/stylePacks/config', ...)` that replaced the packs
with `{}` was removed. The route now gets the real module. The
`creates governed bundle consequence` test also checks that the pack passed to
`renderPdfBuffersFor510k` has `html` and `css` files that exist. The renderers
are still mocked, because rendering a PDF there would require the PDF toolchain.

The same mock is still in `tests/routes/estar-build-pma-package.test.ts` and
`tests/routes/cerv2-export-governance.test.ts`. The mock does nothing useful
there (the renderers are mocked too), so it could be removed the same way. It
was left alone to keep this change small.

## Tests run

```
$ npx vitest run tests/export/stylepacks-bundle-resolution.test.ts \
    tests/routes/estar-export-governance.test.ts \
    tests/routes/estar-build-pma-package.test.ts \
    tests/routes/cerv2-export-governance.test.ts \
    server/export/__tests__ \
    tests/ci/esm-dirname-guard.test.ts tests/ci/prompts-dir.test.ts
 Test Files  22 passed (22)
      Tests  204 passed (204)
```

`server/export/__tests__/editor-json-to-html.test.ts` renders real PDFs through
`stylePacks['510k_v1']` unmocked. It passes, so the source path still reads the
real files.
