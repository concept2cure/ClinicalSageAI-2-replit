# U18 — in production, no one could set a password

Launch row: **D1** (production as configured; sign-in). Found 2026-10-01 while
closing the image gate's known gaps. It was not in the original audit.
Branch: `concept2cure-v2`.

## The defect

`server/services/password-blocklist.ts` (added 2026-09-26, `dd6632dd0`, D6
IAM-17) located its list as
`join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'common-passwords.txt')`.

- **Source (tsx, vitest):** that path is `server/data/common-passwords.txt`.
- **Production:** the server is one esbuild bundle at `/app/dist/index.js`, so
  the path becomes `/app/data/common-passwords.txt`, which does not exist.

`readFileSync` threw, and so did `validatePasswordPolicy`. That function is
called by:

- `server/routes/setup.ts` (first administrator);
- `authEnterprise.ts` (sign-up, password reset, password change).

All of these answered 500. A new client could not create its first
administrator, and no user could reset a forgotten password.

It went unseen because:

- every unit suite runs the source, not the bundle;
- every route test mocks `validatePasswordPolicy`;
- `ci:image-runtime-assets` missed the read, through two holes:
  1. its module-directory anchor recognised `__dirname` and
     `import.meta.dirname`, but not the inline
     `dirname(fileURLToPath(import.meta.url))`;
  2. a `data` entry meant for one bare directory was matched as a prefix, so
     it would have classified the read as "correctly not shipped" anyway.

The public-API pathway engine (`regulatory-pathway-intelligence.ts`) had the
same kind of read, already recorded as a known gap. In the bundle it loaded an
empty knowledge base with no error.

## The fix

- **`password-blocklist.ts`:** the path is now
  `resolve(process.cwd(), 'server', 'data', 'common-passwords.txt')`. The image
  ships `server/` under WORKDIR `/app` (`COPY --from=builder /app/server ./server`).
- **`regulatory-pathway-intelligence.ts`:** `dataDir` is anchored the same way.
  Its unused `__dirname` shim is removed.
- **`scripts/ci/check-image-runtime-assets.mjs`:**
  - `MODULE_DIR` recognises the inline spelling;
  - an entry can be `exact` (the `data` root and `server/data` are);
  - the blocklist file and the three knowledge-base files are classified
    `ship`;
  - the three `known-gap` entries are removed, leaving 3 gaps.
- **The gate's self-test:** two new cuts, one for each hole.

## Verified by making it fail

**`tests/services/password-blocklist-bundle-resolution.test.ts`** builds the
module with the production esbuild options into `<appRoot>/dist` and runs it in
plain Node with cwd = appRoot (the image layout).

Before:

```
 × tests/services/password-blocklist-bundle-resolution.test.ts > password blocklist in the production bundle > refuses a common password and admits an uncommon one (esbuild → <appRoot>/dist, node, cwd = appRoot) 80ms
   → expected { status: 1, …(1) } to deeply equal { status: +0, stderr: '' }
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected { status: 1, …(1) } to deeply equal { status: +0, stderr: '' }
-   "status": 0,
+   "status": 1,
+ Error: ENOENT: no such file or directory, open '/tmp/c2c-pwlist-m0tvyo/data/common-passwords.txt'
     57|     expect({ status: run.status, stderr: run.status === 0 ? '' : run.s…
```

After: `isCommonPassword('Password123!') === true` and the uncommon one is
`false`. With the existing password and pathway suites, 155/155 pass across
18 files.

**The gate**, after the anchor fix but before the code fix:

```
[image-runtime-assets] FAIL
Dockerfile.optimized stage "production" does not contain what the server reads at run time:
  data/common-passwords.txt — read at run time by server/services/password-blocklist.ts:22, and not classified. Add it to RUNTIME_PATHS: "ship" if the image must contain it (and COPY it in the production stage), "not-shipped" with the reason the image correctly lacks it, or "known-gap" with the decision and its owner.
```

After: exit 0, "25 shipped and covered, 49 correctly not shipped, 3 known
gap(s)".

**The self-test** fails on all 11 cuts and passes the intact fixture. Run
against the old anchor and prefix logic, the two new cuts fail
(`exit 0, 0 finding(s)`), which shows they test the fix.
