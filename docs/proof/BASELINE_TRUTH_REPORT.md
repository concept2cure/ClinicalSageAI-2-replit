# BASELINE_TRUTH_REPORT

Date: 2026-03-26
Branch: concept2cure-v2

## What is truly wired

1. Compute schema migration exists with runtime/job/attempt/output tables and seeded `docx-python` profile.
2. Compute API routes are mounted at `/api/concept2cure/compute` with list/detail/create endpoints.
3. Workspace compute panel is wired in `ProjectWorkspaceShell` dashboard and opens governed consequence actions.
4. Compute completion writes to existing governed artifact/version/provenance/audit chain (no parallel system).
5. Docx path now executes via isolated subprocess worker invocation with explicit temp workdir and no-network environment variable contract.

## What is partial / scaffolded

1. Only docx path is isolated runtime; spreadsheet/pptx/bundle/html paths remain provisional emitters.
2. Browser screenshot capture could not be executed due unavailable browser_container tool in this runtime.
3. Repo-wide typecheck remains blocked by pre-existing syntax issues outside this tranche.

## Commands used for baseline verification

- `npx vitest run server/__tests__/services/artifactComputeWorker.test.ts server/__tests__/services/computeService.integration.test.ts`
- `npx eslint server/routes/compute.ts server/services/compute/*.ts client/src/concept2cure/components/compute/ComputeJobPanel.tsx server/__tests__/services/artifactComputeWorker.test.ts server/__tests__/services/computeService.integration.test.ts`
- `npm run typecheck`

