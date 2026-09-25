# U5 — locale files reach the frontend bucket

**Finding (high, confirmed):** `.github/workflows/deploy-aws.yml` "Sync to S3" uploaded `dist/public` with `--exclude "index.html" --exclude "*.json"` and then copied back only `index.html`. The interface strings load from `/locales/{{lng}}/{{ns}}.json` (`client/src/i18n/index.ts:57`), and Vite copies `client/public/locales` into `dist/public/locales` (`vite.config.ts`: root `client`, outDir `dist/public`). So none of the 72 locale files (18 languages × 4 namespaces) ever reached S3. The sign-in page would show raw keys (`title.signIn`, `field.email`) from the first deploy.

The same step gave `robots.txt`, `sitemap.xml` and `manifest.webmanifest` a one-year `immutable` cache although their names never change. It also deleted the previous release's hashed chunks, so a tab left open across a deploy could not lazy-load the app (a separate confirmed finding).

**Fix:** three uploads, one per cache class.
- `assets/` is content-hashed: a year, immutable, and no `--delete`, so earlier chunks stay.
- Every other file is fetched by a fixed name: `max-age=300, must-revalidate`.
- `index.html` last, `max-age=0`.

The order is deliberate: a new `index.html` never references chunks that have not been uploaded.

**Gate:** `scripts/ci/check-frontend-sync-coverage.mjs`, run as `npm run ci:frontend-sync-coverage` with a `:selftest`, in `ci.yml`. It parses every `aws s3 sync|cp` into `$FRONTEND_BUCKET` in the `deploy-frontend` job and applies the AWS CLI's filter semantics: every file included by default, filters in order, the last match decides, `*` also matching `/`. It runs them against the files the build publishes (everything under `client/public`, plus `index.html` and hashed `assets/`) and requires that every file is uploaded, that only `assets/` is cached past an hour or as immutable, and that `index.html` revalidates.

## Before (the step as it stood)
```
[ci:frontend-sync-coverage] FAIL — deploy-aws.yml's frontend upload:
  • not uploaded: locales/cs/auth.json
  • not uploaded: locales/cs/common.json
  • not uploaded: locales/cs/home.json
  • not uploaded: locales/cs/settings.json
  • not uploaded: locales/da/auth.json
  … (72 files not uploaded in all)
  • cached as if content-hashed but its name never changes: manifest.webmanifest (public,max-age=31536000,immutable)
  • cached as if content-hashed but its name never changes: robots.txt (public,max-age=31536000,immutable)
  • cached as if content-hashed but its name never changes: sitemap.xml (public,max-age=31536000,immutable)
exit=1
```

## Self-test (the pre-fix step, verbatim, must fail)
```
[ci:frontend-sync-coverage] self-test: pre-fix step → 75 problem(s), locales missing: true, fixed names cached a year: true
[ci:frontend-sync-coverage] self-test: no upload → ["no `aws s3 sync|cp` into $FRONTEND_BUCKET found in the deploy-frontend job"]; index.html long-cached → flagged: true
[ci:frontend-sync-coverage] self-test OK — the gate fails on each case it exists to catch
```

## After
```
[ci:frontend-sync-coverage] OK — every published file is uploaded; only assets/ is cached as immutable.
exit=0
```
