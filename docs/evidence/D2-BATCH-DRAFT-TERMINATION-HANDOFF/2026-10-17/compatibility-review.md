# Independent finish-reason and BatchDraft compatibility review

Reviewed repository rules and the approved W2 / D2 contract on 2026-10-17. Contract baseline: `45fbf8d8f9ce65da6f67ab805da2551f6621fdc9`. This reviewer owns only this report and makes no production/test/Git mutations. No tests, provider calls or database calls have been run by this reviewer.

## Existing classifier consumers

The current production call graph imports the gateway helper from these paths:

- `server/services/ana/AnaDocumentDraftingService.ts:17`: computes `truncated` for four drafting response paths (`:915`, `:983`, `:1050`, `:1131`).
- `server/services/ana/batch-draft-result.ts:26`: converts recognized or explicit cutoff into failed AnA receipt slots.
- `server/routes/batch-draft-routes.ts:65`: refuses reported cutoff at acceptance, reading snake_case `finish_reason` and literal `truncated: true` (`:489`).
- `server/services/ana/tool-trace.ts:18`: imports with a `.js` extension and classifies a finished loop whose final answer was cut off (`:583`).

The old helper module must keep all three public exports: `TRUNCATING_FINISH_REASONS`, `isTruncated`, and `isVerifiedComplete`. A direct re-export from the canonical shared implementation preserves function/set identity as well as behavior, avoiding an extra runtime classifier or vocabulary. The exported readonly set is an existing API; this increment should not change its vocabulary or runtime mutability.

Existing semantics are exact: `isTruncated` trims a string and recognizes `max_tokens`, `length`, and `chunk_timeout`; absent or unrecognized reasons return false. `isVerifiedComplete` separately recognizes its existing completed-reason vocabulary. `!isTruncated` is not proof of completeness. Moving the helper must not widen or narrow either set, infer a finish reason, or change legacy/manual unknown handling.

## Browser and server portability

The classifier uses only `Set`, `typeof`, and string `trim` and has no imports, Node globals, environment variables, network access, filesystem access or provider dependencies. It is suitable for a shared module. The browser must import `@shared/ai/finish-reason`, never transitively pull in a server helper or gateway.

The repository already maps `@shared` to the repository shared directory in production Vite (`vite.config.ts:45`), canonical Vitest (`vitest.config.ts:12`), and TypeScript (`tsconfig.json:44`). Vite builds the client from `client` but resolves that absolute alias outside the client directory; the production target is `es2022` (`vite.config.ts:76`). The classifier uses primitives older than either that target or the ES2020 TypeScript target. No package/configuration change is needed for this move.

The old server compatibility module can use the repository's ordinary relative ESM re-export pattern. Its callers include both extensionless imports and the `.js` tool-trace import. Existing server tests and a suitable browser bundle boundary should prove both resolutions. A component-entry browser bundle/metafile inspection should show the shared implementation and no `server/` source or Node builtin pulled in through it. Such a bundle check establishes portability, not full UI integration, production deployment, or live provider behavior.

## UI handoff and downstream limits

The existing `CardState` factory explicitly initializes every field. New per-card finish fields must be present there so pending/error creation paths remain complete. The response-to-card mapper should retain the exact string reason or null, normalize only explicit true or recognized cutoff, and decide the error state before exposing content as a ready draft. Existing ready counts derive from `state: done`, so known cutoff must never enter that state.

Each card remains keyed by its unique `coauthor_documents.id`, even when several sections share a display number. Existing editing spreads the prior card and changes only `html`, preserving `machineHtml`, turn record and newly retained termination fields. The acceptance guard and rendered controls must both exclude known cutoff. Successful acceptance should send the original reason under `finish_reason` plus the normalized flag while preserving the edited content and original machine text/turn record. Saved state remains contingent on the existing successful response.

The accept route already checks supplied cutoff before the write transaction. This work repairs the ordinary component's metadata handoff to that check; it does not make client fields trusted or make turn records attest per-section termination. A caller can still omit or forge metadata under the existing legacy/manual policy. Unknown/absent reasons must remain unconfirmed and are not scientific completeness, qualification, approval or filing certification. The server route, service, attribution, lifecycle, version snapshot and source/figure guards are outside the implementation scope and should remain unchanged by this patch.

## Focused regression recommendation

Use the new actual-component termination proof plus these eleven existing suites, for twelve focused suites total:

1. `server/services/ai-gateway/__tests__/finish-reason.test.ts` — existing helper API, vocabularies, whitespace and unknown/absent limits through the compatibility path.
2. `server/services/ana/__tests__/tool-trace-stopped-turn.test.ts` — the `.js`-extension consumer still reports cut-off final answers and preserves unknown controls.
3. `server/services/ana/__tests__/blueprint-grounded-drafting.test.ts` — existing canonical drafting service behavior remains intact after the import move.
4. `server/services/ana/__tests__/draft-source-service-checkpoint.test.ts` — selected-source generation checkpoints remain distinct from output termination.
5. `server/services/ana/__tests__/batch-draft-termination-receipt.test.ts` — previously delivered cutoff classification and successful source receipt behavior.
6. `server/services/ana/__tests__/batch-draft-termination-tool.test.ts` — registered AnA tool receipt/guidance remains correct.
7. `client/src/concept2cure/v2/__tests__/batchDraftAcceptance.test.tsx` — actual component preserves document identity, saved-after-response semantics, framework and turn record.
8. `server/routes/__tests__/batch-draft-accept-lineage.pglite.integration.test.ts` — actual acceptance route refuses reported cutoff with no writes and preserves completed-draft/lineage controls.
9. `server/routes/__tests__/batch-draft-accept-readers.pglite.integration.test.ts` — accepted provenance still corresponds to the words readers see.
10. `server/routes/__tests__/batch-draft-accept-shown-words.pglite.integration.test.ts` — original machine text and edited visible content keep their attribution boundary.
11. `server/routes/__tests__/ana-intelligence-audit-outcomes.test.ts` — generic HTTP per-slot generation provenance and audit settlement remain unchanged.

This is a bounded recommended cohort, not a request to rerun unrelated assemblies or every upstream suite. Root owns exact cohort selection, source bindings, actual execution evidence, whole-repository TypeScript, bundle checks and normal Git hooks. No assertion here substitutes for those release results.

## Final frozen change review

Reviewed the final frozen three-file production change against the approved contract. No blocking compatibility or lifecycle issue was found.

`shared/ai/finish-reason.ts` is byte-identical to the old server module at contract baseline, independently verified by reading both byte sequences. No vocabulary, trim behavior or completeness predicate changed. `server/services/ai-gateway/finish-reason.ts` directly re-exports all three public symbols from the shared module with no wrappers or second implementation. Existing extensionless and `.js` callers therefore retain the same public path; the classifier itself has no runtime imports or Node-only dependencies.

The actual component imports `@shared/ai/finish-reason`. Its `CardState` and `bdCard` factory now explicitly retain `finishReason: string | null` and `truncated: boolean`. The private `bdTermination` helper accepts unknown wire values, preserves a string exactly or null, and classifies cutoff only using literal true or the unchanged canonical predicate. Response mapping applies cutoff first and creates an error card with both `html` and `machineHtml` cleared, so incomplete text is not exposed through the ready/editable branch. The unchanged ready count selects only `state: done`; cutoff cards do not contribute. The existing state-dependent footer supplies no Accept or Edit controls for an error card.

The acceptance handler independently rejects either a retained flag or a canonical cutoff reason before any POST. Usable non-cutoff cards add snake_case `finish_reason` and `truncated` to the existing payload while retaining edited `card.html`, original `machineHtml`, original turn record, unique target document ID and framework. The unchanged editor spreads the prior card and modifies only `html`, so it cannot erase finish metadata or overwrite original machine text. The saved-state transition still requires the existing successful response. Unknown/absent reasons are sent as the exact unknown string or null with false, preserving the deliberately unconfirmed legacy/manual policy.

At the initial frozen review, read-only byte comparisons to contract baseline confirmed this patch did not alter the generic HTTP batch or acceptance route, canonical drafting service, AnA batch receipt/tool handler, tool-trace caller, canonical authoring-from-draft writer or source-reference verifier. This is a historical statement about our patch scope, not a claim that all upstream code remains unchanged across later synchronization. It fixes the ordinary component handoff; it does not add trusted finish attestation or make the existing server refusal resistant to omitted/forged client metadata.

Independently computed frozen source bindings:

| Production file | SHA-256 |
| --- | --- |
| `client/src/concept2cure/v2/surfaces/BatchDraft.tsx` | `d2efcd4ea6e604c4dacdc7c90d4ad6b6ebbb49eb61a72090fafd6393fa104691` |
| `shared/ai/finish-reason.ts` | `572484bca678a6f8215383ca8c161fae34411618a146d7c03b3f7ac35aec0e1c` |
| `server/services/ai-gateway/finish-reason.ts` | `fca36309e715ca8e293c598f582003bc4a3aea6618bd2e2507e30c330a931cb7` |

The control tower reports starting a 13-suite final cohort: the eleven existing controls recommended above, the new actual-component termination suite, and the independent actual-Express accept-handler controls. It also reports running whole canonical TypeScript and an isolated shared-classifier browser bundle check. The isolated check should bind the unchanged shared bytes, one shared input, no runtime imports and all three exports. It establishes that helper boundary, not a full application/component bundle, browser execution or deployment. Alias compatibility is additionally exercised through the actual component suites and canonical type resolution. No run outcome is claimed by this reviewer; final execution evidence belongs to the control tower. Review conclusions are bound to the hashes above.


## Final canonical merge integration review

Reviewed `canonical-final-incoming.json` and the relevant incoming diffs after normal merge `951cc559701130d6fc61140e24fcc3ab2a69251f`. The incoming canonical parent is `8d06f71566d01380dc772c1d5f4fa0494aa215c7`; our implementation parent is `e42a5e59b19a9874f32f4cc08d388533d909f6c3`. The incoming record names 103 files, including 69 code files, primarily company legal documents, letterhead, reporting and Vault/submission behavior. This review examines their intersection with our bounded handoff and test/type contexts. It does not qualify those entire incoming features.

No blocking transitive integration issue was found:

- The complete `server/db/pglite-harness.ts` incoming diff adds only `organizations.settings JSONB NOT NULL DEFAULT '{}'::jsonb` to `PROGRAM_SPINE_PGLITE_DDL`. The three existing PGlite batch-accept suites in our cohort import `AUDIT_LOGS_PGLITE_DDL`, whose bytes and meaning are unchanged. The added template-string column does not alter fixture startup or accept behavior for these tests. The repeated cohort still exercises the current module rather than relying solely on this inspection.
- `server/types/pdfkit.d.ts` adds typed image decoder/placement methods and supporting interfaces inside the named `pdfkit` module. `shared/types/pdf-parse.d.ts` retains its legacy callable shape while adding the v2 constructor namespace and fields previously declared in `shared/types/third-party.d.ts`; the latter removes that duplicate named-module declaration. These are ambient types, with no runtime imports or new global finish-reason/CardState declarations. Because ambient module changes can affect whole-project compilation, the control tower's current whole-repository TypeScript rerun is the appropriate compatibility check. This is not runtime PDF qualification.
- The incoming `ana-platform-controller.ts` diff filters company-document data from general settings reads and refuses updates through the general settings door. It does not modify `batch_draft_sections`, receipt recovery, finish classification or the accept policy. Incoming Vault leaf-resolution changes thread company legal target context into Vault transmittability checks; they do not change the ordinary component metadata payload or the batch accept route. Their new company-document behavior retains separate upstream evidence.

Independently compared current bytes to implementation parent `e42a5e59b19a9874f32f4cc08d388533d909f6c3`: our three production files retain exactly the reviewed hashes above. Generic HTTP batch and accept routes, canonical drafting service, AnA receipt/tool handler, tool-trace caller, canonical from-draft writer and source-reference verifier are also unchanged by this incoming merge. This is an exact statement for those inspected paths, not a blanket unchanged-code claim for the merged application. The server fixture and ambient type paths described above did change.

The control tower reports repeating the same 13-suite focused cohort and whole canonical TypeScript on the merged checkout. If green with stable source bindings, those checks are sufficient to requalify **our existing UI-to-accept handoff patch** in the current context: the cohort exercises real component identity/termination behavior, shared compatibility consumers, the actual accept handler and source/attribution controls, while whole TypeScript resolves the current ambient declarations. Broader new company/legal/letterhead/report/Vault behavior needs its own upstream qualification and is not inferred from our results. The isolated helper bundle claim remains limited to that helper, whose source did not change. No tests, provider/database calls or Git mutations were performed by this reviewer, and no final run result is claimed here.
