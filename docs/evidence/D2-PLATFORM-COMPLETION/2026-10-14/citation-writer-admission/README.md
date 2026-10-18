# Current requester admission for citation writers

Published base: `10f4e4557` on `concept2cure-v2`.

Canonical new citations and refreshes now require the current requester to have access to the exact recorded source before its checksum is read. Both refresh routes pass the actual JWT requester rather than the citation's stored creator. Writers repeat current actor/source admission after the programme disposition reservation, before citation write locks or another source checksum read. All four HTTP writer routes preserve typed source/project refusals. A mixed refresh-all failure rolls back the earlier allowed checksum update and its audit on the existing transaction.

The actual fixture identities remain distinct: service requester 1 versus peer uploader 2; signed HTTP requester 3 versus peer uploader and recorded citation creator 9. Exact file-upload provenance and current canonical organisation, workspace, project-anchor and sharing records supply the positive paths. No authority mock, source grant, production policy relaxation or baseline expansion was added.

## Results

| Phase | Result | Duration |
| --- | --- | --- |
| Initial prospective run | 15 failed, 1 passed, 60 deselected | 13.58s |
| Canonical prospective red | 14 failed, 2 passed, 60 deselected | 12.94s |
| First full nine-suite regression | 165 passed, zero skipped | 73.15s |
| Final source-usage suite including late revocation | 45 passed, zero skipped | 9.55s |
| Final five owned fixture lint | Zero errors and warnings | — |

The initial run exposed a missing `cre_evidence_sources.created_by integer` fixture column in five service cases. The canonical rerun supplies that actual column and has no fixture SQL failures; all 14 failures show successful operations where current admission must refuse. Original-uploader and explicit NULL-organisation global-public positives already passed against the prior code.

The final **167 distinct cases across nine suites** are a composite: the first 165 include 43 source-usage cases, replaced by the final 45-case source-usage run. The other eight suites contribute 122 cases. No single 167-case invocation is claimed. The first 165-case log is retained unchanged as a separate phase.

The two late-reservation cases execute the real advisory reservation SQL and then delete the actual current requester's organisation membership using that fixture's executor. They preserve the complete old citation image, including checksum and creation date. They allow the one checksum read performed while the requester was still admitted and require typed 403 before any checksum or source/citation write lock after revocation.

## Test scope

- `server/routes/__tests__/authoringWritesBoundAndAudited.pglite.integration.test.ts` — 33 cases.
- `server/services/clinical-regulatory-evidence/__tests__/source-usage.pglite.integration.test.ts` — 45 cases.
- `server/services/clinical-regulatory-evidence/__tests__/source-versioning.pglite.integration.test.ts` — 13 cases.
- `server/services/authoring/__tests__/authoring-file-to-vault-snapshot.pglite.integration.test.ts` — 6 cases.
- `server/services/authoring/__tests__/authoring-citation-source-scope.pglite.integration.test.ts` — 13 cases.
- `server/services/document-data-disposition/__tests__/eligibility.pglite.integration.test.ts` — 17 cases.
- `server/services/document-data-disposition/__tests__/consumers.pglite.integration.test.ts` — 5 cases.
- `server/services/document-data-disposition/__tests__/recorded-lineage.pglite.integration.test.ts` — 28 cases.
- `server/services/document-data-disposition/__tests__/citation-writes.pglite.integration.test.ts` — 7 cases.

The nine-file first phase used Node 22 and `NODE_OPTIONS=--max-old-space-size=4096 npx vitest run --config vitest.config.ts` with these exact paths. The final affected-suite invocation used the same command with only `source-usage.pglite.integration.test.ts`. Focused red selected the two new admission describe groups with `-t 'current requester source admission|current source requester admission'`; its 60 skipped cases are deliberate deselection.

Owned fixture repairs also pass the actual requester in ten existing refresh inputs, use a genuinely accessible same-organisation second programme for cross-project correspondence, supply a real original uploader for unbound positives, and replace the source-versioning fixture's synthetic actor with current actor 1 plus canonical parents. Historical frozen, retained, withdrawn, superseded and re-cite behavior retains its original assertions. Generic free-text citations retain their existing behavior.

## Source and evidence integrity

`source-manifest.json` contains explicit path/byte/SHA-256 records for current production, helpers, nine suites, fixture prerequisites and Vitest configuration. `red/source-pins.json` preserves the exact ten canonical-red source snapshots. The expected differences since that snapshot are the two production writer/route files and the source-usage fixture's two added tests and wrapping changes. Source admission, current parent policy, other four updated fixture files and earlier metadata controls remain identical to their red pins.

New log copies only normalize trailing whitespace and extra EOF blank lines. Their manifest records preserve the exact original raw files and checksums in `/tmp`. Previously published evidence folders, schemas, scanner baselines and old green histories were not rewritten. `DESIGN.md` records the implemented contract and its remaining qualification limits.

## Qualification

These results prove real SQL and rollback within PGlite fixtures and responses from actual signed Express HTTP routes. The HTTP harness instruments the route-owned transaction client and retains canonical document permissions. Existing audit-failure tests verify rollback; the service-only capture chain remains the suite's previously declared mock. The test process emits its existing development audit-HMAC warning, so these fixtures do not qualify production audit-chain cryptography.

This phase does not prove native RLS, independent-connection membership/sharing stability through COMMIT, source bytes, storage/provider performance, scientific correctness, exports or regulatory acceptance. The late membership change occurs on the fixture executor at an ordered reservation boundary; it is not a native concurrent-session serialisation claim.
