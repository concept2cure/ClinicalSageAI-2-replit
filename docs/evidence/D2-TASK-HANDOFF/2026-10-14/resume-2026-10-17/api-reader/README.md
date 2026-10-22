# Actual detail response and recovery metadata — 2026-10-17

W1 / D2, under the resumed canonical integration in
`docs/design/TASK_DRAWER_HANDOFF_2026-10-14.md`.

The pinned canvas required the saved project from the document detail response,
but the existing detail SELECT omitted it. The route now projects
`client_program_id` alongside its existing fields, with the same tenant/object
authorization and count predicates. Recovery-only validation also rejects
malformed metadata before applying it to the pinned renderer. Ordinary reads
retain their existing behavior.

Failing first, with Node 22.23.3:

- `api-red.log.gz`: the real router/PGlite test failed because the document's
  project was `undefined` instead of the saved program; eight unrelated tests
  were filtered out.
- `metadata-red.log.gz`: all eight new malformed metadata controls failed,
  including the actual `product_code.trim()` renderer exception; fourteen
  unrelated tests were filtered out. Endpoint fixtures were subsequently split
  into detail `client_program_id` and working-list `program_id` shapes; the
  negative assertions were preserved.

After the fixes, `green.log.gz` and `green.json.gz` record **31 passing tests in
two files**, no failures or skips. The positive canvas case also checks that
changed metadata reached the current host, while the real detail response case
retains provenance, section/comment/revision counts and current access checks.

The command used the prepared Node 22 runtime, `NODE_OPTIONS=--max-old-space-size=4096`,
and `npx vitest run --config vitest.config.ts` with:

- `server/routes/__tests__/authoringDocAccess.pglite.integration.test.ts`
- `client/src/concept2cure/v2/__tests__/authoringCreationHostRecovery.test.tsx`

Scoped ESLint reports are retained as `lint.json.gz` and
`lint-server-before.json.gz`: zero errors, no warnings in the reader or two test
files, and the router's existing 23 warnings with the same rule counts before
and after. No baseline was edited. `results.json` pins the four final sources.
The `*-node24.log.gz` files are preliminary diagnostic runs, superseded by the
Node 22 failures and final green replay.

These checks exercise the real router over HTTP and PGlite, plus native client
readers with synthetic transport and a stubbed Workbench view. They do not
qualify live PostgreSQL/RLS, deployed login/MFA, official TypeScript/build,
hosted CI, or a human witness. Root owns final combined verification.
