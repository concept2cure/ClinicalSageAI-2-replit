# Test Assembly Service

This document describes the `test-assembly` routes and how to run tests locally.

## Routes

- GET `/api/test-assembly/health` - simple health check
- POST `/api/test-assembly/start` - body: `{ request: string }` -> creates a document
- POST `/api/test-assembly/edit` - body: `{ docId: string, content: string }` -> saves human edits
- POST `/api/test-assembly/polish` - body: `{ docId: string, instruction: string }` -> AI polish (placeholder)

## Quick manual test (curl)

> Note: These routes are disabled by default in production. To enable them in production for debugging, set `FORCE_TEST_ASSEMBLY=1` in the environment. Use with caution.


1) Start (creates doc)

```
curl -s -X POST http://localhost:5000/api/test-assembly/start \
  -H "Content-Type: application/json" \
  -d '{"request":"Please draft a regulatory summary"}'
```

2) Human edit (use returned docId)

```
curl -s -X POST http://localhost:5000/api/test-assembly/edit \
  -H "Content-Type: application/json" \
  -d '{"docId":"<DOC_ID>","content":"Human edits applied"}'
```

3) Polish

```
curl -s -X POST http://localhost:5000/api/test-assembly/polish \
  -H "Content-Type: application/json" \
  -d '{"docId":"<DOC_ID>","instruction":"Polish tone and shorten"}'
```

## Local test suite

Run the unit + route tests added for this feature:

```
npx vitest run server/test/__tests__/assemblyLine.test.ts server/test/__tests__/test-assembly.routes.test.ts
```

## E2E smoke test (requires a reachable DB)

This script starts the app against the database referenced by `TEST_DATABASE_URL` (or `DATABASE_URL`), runs the three-step flow (start → edit → polish), verifies the `assembly_docs` table, and then shuts down the server:

```
export TEST_DATABASE_URL="postgresql://..."
npm run smoke:e2e-assembly
```

To test AI-powered polishing, set `OPENAI_API_KEY` in the environment before running the smoke test. If `OPENAI_API_KEY` is not set, the `polish` endpoint appends a note to the document instead of calling the AI provider.

In CI, the `Test Assembly CI` workflow will run the E2E smoke test if `TEST_DATABASE_URL` is set as a repository secret.

## Verify migration applied

Run the helper script to confirm the `assembly_docs` table exists:

```
export DATABASE_URL="postgresql://..."
node scripts/check_assembly_docs.mjs
```
