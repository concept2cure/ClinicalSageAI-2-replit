# Concept2Cure V2 Package Manager Baseline (2026-03-26)

## 1) Current package manager + lockfile state

- **Package manager in use:** `npm` (root `package.json` scripts use `npm` commands).  
- **Runtime/tooling versions observed in this environment:**
  - `node`: `v20.19.6`
  - `npm`: `11.4.2`
- **Project npm config (`.npmrc`):**
  - `package-lock=true`
  - `save-exact=true`
  - `save=false`
  - `legacy-peer-deps=true`
  - `registry=https://registry.npmjs.org/`
- **Lockfile state:** `package-lock.json` is currently **missing** at repo root.
- **Reconciliation action taken:** removed `package-lock.json` from `.gitignore` so lockfile can be committed once generation is unblocked by registry policy.

## 2) Registry/auth constraints discovered

### Effective registry

- `npm config get registry` resolves to `https://registry.npmjs.org/`.

### Environment proxy settings

- `npm config list` shows:
  - `http-proxy=http://proxy:8080`
  - `https-proxy=http://proxy:8080`
- npm prints warning:
  - `Unknown env config "http-proxy". This will stop working in the next major version of npm.`

### Auth/policy blockers

- Lockfile generation is blocked by registry access policy when npm needs to fetch metadata:
  - `403 Forbidden - GET https://registry.npmjs.org/@anthropic-ai%2fsdk`
- Security advisory endpoint also returns forbidden in this environment:
  - `403 Forbidden - POST https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`

## 3) Baseline commands (standardized)

> Use `CI=1` locally/in CI to bypass Husky `prepare` hook in non-interactive environments.

### Install

```bash
CI=1 npm install
```

### Lockfile generation (once registry access is fixed)

```bash
CI=1 npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

### Typecheck

```bash
npm run -s typecheck
```

### Lint

```bash
npm run -s lint
```

### Tests

```bash
npm test
```

## 4) Baseline execution results and blockers

## Install / lockfile

- `npm install --package-lock-only` initially failed without `CI=1` because `prepare` script requires Husky binary:
  - `sh: 1: husky: not found`
- With `CI=1`, npm runs but lockfile generation remains blocked by registry `403` (scoped package metadata fetch).

## Typecheck blocker summary

- `npm run -s typecheck` fails due pre-existing syntax/parse issues (not lockfile-related), including:
  - `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
  - `client/src/concept2cure/router/ZenRouter.tsx`
  - `server/routes/ana-ri.ts`
  - `server/src/routes/control-plane.router.ts`

## Lint blocker summary

- `npm run -s lint` exits non-zero with:
  - `2310 problems (9 errors, 2301 warnings)`
- Concrete lint-error files:
  - `server/routes/ana-ri.ts` (parsing error)
  - `server/routes/lumen-cortex-ft.ts` (`no-const-assign`)
  - `server/services/audit/signedAuditExport.ts` (`no-dupe-keys`)
  - `server/services/documentIngestionWorkflow.js` (parsing error)
  - `server/services/docxGenerator.ts` (`no-dupe-keys`)
  - `server/services/ivdrPackHtml.ts` (`no-unexpected-multiline`)
  - `server/src/routes/control-plane.router.ts` (parsing error)

## Test blocker summary

- `npm test` runs Jest first and fails one suite before Vitest phase:
  - failing file: `client/src/concept2cure/components/editor/__tests__/gaReadinessModel.test.ts`
  - failure detail: `Vitest cannot be imported in a CommonJS module using require().`

## 5) Recommended next remediation sequence

1. **Registry/auth owner:** resolve `403` access for scoped packages (at minimum `@anthropic-ai/sdk`) and advisory endpoint if audit is required.
2. Generate and commit a valid root `package-lock.json`.
3. Fix parser-level blockers first:
   - `server/routes/ana-ri.ts`
   - `server/src/routes/control-plane.router.ts`
   - `server/services/documentIngestionWorkflow.js`
   - `client/src/concept2cure/router/ZenRouter.tsx`
   - `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx`
4. Resolve failing mixed-runner test suite (`gaReadinessModel.test.ts`) by aligning runner/module format.
