# W5 / D2–D7 — tenant-scoped, atomic peer-review transitions

## Existing-build defects

GET /api/authoring/documents/:id/reviews and the existing request-review/review
writers did not check that the working document belonged to the request tenant.
Review rows carried tenant_id but their doc_id FK alone could name another
organization's document. Request-review inserted reviewers independently, so a
later insert failure left a partial batch. Review verdicts were saved before
their independent audit write; an audit failure could leave an unaudited verdict.
Request-review did not append its own authoring audit event.

## Repair

The three peer-review routes now require the document in the verified tenant.
The two writers use the existing transaction helper and lock that document,
serializing changes on the same working identity. Each reviewer request batch
and its review_requested audit event commit together. Each verdict and its
existing document_reviewed audit event commit together. Missing/foreign documents
return 404 without creating reviews. Malformed and duplicate reviewer identities
are rejected before any mutation. A request may include the person's optional
reason under the existing governed reason policy; none is invented.

Existing authoring_reviews, workflow and board semantics remain in place.
Review verdicts are not electronic signatures. Existing unassigned-colleague
verdict behavior and re-request status behavior are preserved; this change does
not claim reviewer membership verification, a new approval policy, email delivery,
canonical document promotion or a new client review-request control.

## CI anchor contract repair

CI for 50f0f64da7a8cf9265f277a5f54378ef59ed1032 passed the full TypeScript gate but
failed one of 1,313 proof-tier tests: one-program-anchor-reader.contract.test.ts.
The earlier authoring bridge introduced an independent projects-by-program query.
It now calls the existing readProgramAnchorRow. That canonical module accepts
raw SQL clients alongside its existing request-scoped Drizzle client, retaining
the same tenant predicate and ordered lookup. The bridge requests requireUnique
and refuses duplicate mappings; other existing consumers keep lowest-id behavior.
The contract test is unchanged. No scanner exception or baseline was added.

## Validation

The pre-repair targeted run had 6 failures and 13 passes across 2 files. Five
new actual-SQL peer-review cases and the existing anchor contract exposed the
failures. The final focused run passed 84 tests across 9 files:

- tests/schema-contract/one-program-anchor-reader.contract.test.ts
- server/services/c2c/__tests__/program-anchor-reader.pglite.test.ts
- server/services/ana/__tests__/authoring-canonical-bridge.test.ts
- server/routes/__tests__/review-board-authoring-store.pglite.integration.test.ts
- server/routes/__tests__/authoring-record-attribution.pglite.test.ts
- server/routes/__tests__/authoring-atomic-mutations.test.ts
- server/routes/__tests__/review-board-reads-authoring-store.test.ts
- tests/golden-journeys/ind-authoring.journey.test.ts
- client/src/concept2cure/v2/__tests__/reviewWritesReachTheServer.test.tsx

Run with NODE_OPTIONS=--max-old-space-size=4096 npx vitest run and those paths.
Real PostgreSQL triggers in PGlite reject the second reviewer insert, request
audit or verdict audit. Assertions verify zero partial batch writes, preserved
pending verdict state and a recorded request audit on success. Foreign and
missing documents are tested on all three routes. Raw SQL anchor tests verify
the same order, scoped identity and opt-in refusal of duplicates as Drizzle.
An intermediate scan saw the warning-ratchet's temporary prior-source copies;
those scratch files were removed before the final run and are not committed.

Production build, changed-file warning ratchet, program-ownership single-source,
Drizzle tenant-scope scan, test-import resolution and git diff --check passed.
Full TypeScript confirmation and remaining checks for this commit are GitHub CI
gates; no local full type-check success is claimed on this 8 GB workspace.
No new dependency, model, endpoint, schema or store. Production deployment,
provider/tenant/reviewer qualification and entire IND readiness are not claimed.
