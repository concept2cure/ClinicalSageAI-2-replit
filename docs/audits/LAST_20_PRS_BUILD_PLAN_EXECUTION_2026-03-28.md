# Last-20 PR Audit Build Plan Execution (2026-03-28)

## Plan
1. Regenerate structural wiring audit for latest 20 merged PRs.
2. Run TypeScript validation (`npm run typecheck`).
3. Run production build (`npm run build`).

## Preflight
- ⚠️ `node_modules/` is missing; package dependencies may not be installed.

## Execution Summary
- Passed steps: **1**
- Failed steps: **2**

## Step Results
### ✅ `node scripts/audits/generate-last-pr-wiring-audit.mjs --limit 20 --date 2026-03-28 --output docs/audits/LAST_20_PRS_WIRING_AUDIT_2026-03-28.md`
- Started: 2026-03-28T20:14:53.432Z
- Finished: 2026-03-28T20:14:54.880Z

```text
Wrote audit report: docs/audits/LAST_20_PRS_WIRING_AUDIT_2026-03-28.md
```

### ❌ `npm run typecheck`
- Started: 2026-03-28T20:14:54.880Z
- Finished: 2026-03-28T20:15:06.273Z
- Exit code: 2

```text
> concept2cure-riai@1.0.0 typecheck
> NODE_OPTIONS="--max-old-space-size=6144" tsc --noEmit

error TS2688: Cannot find type definition file for 'jest'.
  The file is in the program because:
    Entry point of type library 'jest' specified in compilerOptions
error TS2688: Cannot find type definition file for 'node'.
  The file is in the program because:
    Entry point of type library 'node' specified in compilerOptions
error TS2688: Cannot find type definition file for 'react'.
  The file is in the program because:
    Entry point of type library 'react' specified in compilerOptions
error TS2688: Cannot find type definition file for 'react-dom'.
  The file is in the program because:
    Entry point of type library 'react-dom' specified in compilerOptions
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
```

### ❌ `npm run build`
- Started: 2026-03-28T20:15:06.273Z
- Finished: 2026-03-28T20:15:06.605Z
- Exit code: 127

```text
> concept2cure-riai@1.0.0 build
> vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
sh: 1: vite: not found
```

## Recommended Next Actions
- Install/restore dependencies (`npm ci`) and rerun this plan script.
- If type defs are still missing, verify `@types/*` packages from `package.json` are present in lockfile and install step.
