# Live stream saved-section context HTTP/PGlite qualification

W1 / D2. Local synthetic fixtures only; no provider, deployment, native database or agency call. This child owns only the new stream-saved-section-context.pglite.test.ts fixture and this evidence directory. Root owns production, global gates, compiler and publication.

## What already exists

- `server/routes/ana-ri/__tests__/stream-project-private-access.pglite.test.ts` supplies actual PostgreSQL-policy semantics in isolated PGlite and a mounted stream route. Its default prefetch mock cannot qualify the section-context connection.
- `support/stream-route-harness.ts` supplies the existing scripted gateway, request/actor boundary, run/Stop machinery and real turn recorder. Its gateway snapshots are the actual messages sent by the live route. The new fixture reuses this harness without editing it.
- `server/services/ana-ri/chat-context-builder.ts:prefetchRouteIntelligenceContext`, `open-document.ts`, `saved-open-template.ts`, the canonical savedTemplateReview and authoring permissions/program helpers perform the real source/context work in this fixture. The orchestrator, persona and legacy section supplement are real; only unrelated optional context reads are replaced.
- Before this completion, the actual stream resolver read a tenant-local parent template without current project/document/section admission. The pre-production privacy probe demonstrated that a private ICH_IB template reached the gateway while the selected project was another accessible project.

## Behavioral RED and fixture calibration

The initial and formal pre-production two-case runs failed on actual gateway prompts, without SQL/import/setup failures. Formal `red.json` has sourceDrift=[] and retains its source freeze and snapshots. The private-project probe exposed `registry ICH_IB` despite an admitted different public project; this is the decisive independent privacy RED.

The early positive child-guidance probe had not yet seeded an explicit VIEW grant because the former reader did not check it. The expanded fixture adds that grant to satisfy the new contract. Therefore the early missing-child-guidance result is not represented as qualification of the new access preconditions. Initial source pins were taken during the initial run; the formal replay supplies proper before/after pins. Original logs and source snapshots remain.

## Actual behavior covered

Fourteen settled cases exercise the real route, request-bound and global-pool SQL probes, canonical access/reference engines, actual gateway prompt and real recorder:

- Assembled CSR guidance wins over a different parent IND; manual policy remains manual, including exact historical E3 references without the newer policy field.
- A non-registry blank CRF component retains its own guidance and narrative mode without becoming US_IND; numeric saved headings and conflicting client document/section claims cannot inject trusted CTD persona or ACTIVE SECTION guidance.
- Native IND source uses saved section1.2 despite client3.2.S/ICH_IB claims. The actual legacy supplement uses the server’s code.
- Private-project, foreign-section and revoked-grant selectors read no protected template/provenance/audit/guidance fields. Saved context does not fall back to a parent or client classification.
- Section-only VIEW and canonical case-insensitive email grants work; revocation is read afresh. A FROZEN manual section stays viewable and produces the trusted LOCKED directive despite a client DRAFT claim, without content writes.
- A malformed assembly or oversized Unicode reference becomes unavailable as a whole, without parent substitution or clipping.
- Protected reference queries use the request client, with none on the global pool. No authored section text is fetched by this context path.
- Every sealed recorder model-input text equals the actual gateway message bytes. Retained guidance is excluded from answer-grounding/toolEvidenceCorpus.
- Surface-only ICH M11 context remains available without saved authoring reads.

## Qualification epochs

`green-initial`:11/11 passed, no drift. `final-green`:12/12 behavior passed but three source drifts during reader/status refactoring, so it is not settled qualification. `expanded-green`:14/14 passed, no drift. `settled-green` and `settled-lint`:behavior/lint passed but open-document.ts drifted, so neither is final qualification. All receipts/raw logs and snapshots remain immutable.

Final: `final-stable-green.json` records14/14 passing with sourceDrift=[]; `final-stable-lint.json` records zero errors/warnings with sourceDrift=[]. `final-stable-inputs.json` pins the fixture, request route/harness, prefetch, reader, shared reference helper, permission/program helpers, canonical E3 policy, context mapping, actual orchestrator/persona and legacy section renderer.

The request actor boundary, gateway, run ledger and unrelated service effects are scripted seams. Real recorder input is sealed in memory; this fixture does not claim a durable turn-record insert, real provider/model qualification, human testing or clinical/regulatory validation. Mutable source/audit rows permit isolated negative probes; production immutability belongs to its existing canonical migration tests.
