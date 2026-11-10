# L1 — image-size fixed by override; its two ledger rows retired (2026-11-10)

**Before:** `docs/security/dependency-risk-ledger.json` carried GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq
(image-size, high, range `<=2.0.2`) as `unreachable`, expiring 2026-11-25, with `fixedVersion: null`. Installed:
`pptxgenjs@4.0.1 > image-size@1.2.1`.

## What already exists

- The two ledger rows and their Trivy mirror (`.trivyignore`, CVE-2025-71329 / CVE-2025-71330).
- `scripts/ci/check-pptx-image-reachability.mjs` (in the hook) and
  `server/services/__tests__/pptxGenerator.security.test.ts`: the shipped pptxgenjs bundle never imports
  image-size, the generator uses no image-capable API, and image-size is absent from the module cache after a
  real export.

## Why an override, and why now

- Patched releases exist: image-size 2.0.3 and 2.0.4 (2026-09-14) and 2.1.0 (2026-11-06) are outside the advisory
  range. The rows' "no fixed version" was no longer true.
- No parent release carries the fix: pptxgenjs 4.0.1 is the latest and declares `image-size ^1.2.1`.
- So `package.json` overrides pptxgenjs's image-size to **2.0.4**, pinned exactly (2.1.0 was four days old). The 2.x
  API differs from 1.x, which cannot matter: the bundle never loads the package, and the reachability check, which
  now expects 2.0.4, fails if that changes or the override is dropped.

## After

- `npm ls image-size --all`: `pptxgenjs@4.0.1 overridden > image-size@2.0.4 overridden`. `npm audit` reports no
  image-size advisory.
- Both ledger rows and both `.trivyignore` entries removed; ledger resealed.
- `npm run ci:dependency-risk`: `PASS; 1 Critical/High advisory occurrence(s), all reviewed` (the dev-only
  @figma/code-connect zod copy, expiring 2026-12-06).
- `npm run ci:pptx-image-reachability`: PASS. Made to fail: the same script expecting another version exits 1 with
  "reviewed pptxgenjs/image-size lockfile path changed".
- `pptxGenerator.security.test.ts` (a real PPTX export, image-size not in the module cache): pass.
  `scripts/ci/__tests__/dependency-risk-gate.test.mjs`: 32 pass. `ci:trivyignore-hygiene`: OK, 2 suppressions.

Not run here: Trivy itself.
