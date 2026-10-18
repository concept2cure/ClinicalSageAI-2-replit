# Independent lifecycle and compatibility review

Reviewed the approved contract and current call graph on 2026-10-17. The contract baseline is `accf8c6bacfdc2d89b5de9098e22a67fe3f27914`; the contract publication HEAD observed during review is `70cb689712a9517359fc82dacf4f0d61b6084fd2`. This is a read-only code review with no provider or live database qualification. No production or test source was changed by this reviewer.

## Receipt handoff and save boundary

`server/services/ana/AnaToolExecutor.ts:15895` constructs the AnA-specific batch receipt and returns it, with model-visible guidance to pass successful section content and its source receipts into the separately governed `draft_authoring_document` tool (`:15900`). This is an instruction to the agent; there is no automatic save in the batch handler.

The separate handler at `AnaToolExecutor.ts:21019` delegates to `server/services/authoring/authoring-draft-tool.ts:203`. That tool resolves the acting tenant/user and open project (`:141`), parses caller-supplied sections (`:157`), and calls the canonical `createDocumentFromDraft` writer (`:171`). The registered tool wrapper retains the served-model high-risk gate and human-confirmation gate (`AnaToolExecutor.ts:521` and `:531`). Neither the authoring tool nor its input parser consumes an authoritative batch receipt token or trusted generation-termination receipt. Omitting cut-off text from this batch receipt prevents this receipt from offering it as successful content; it does not prove that arbitrary incomplete text cannot be saved through another input.

The appropriate claim is therefore: **recognized cut-off AnA batch generations are reported as failed and their incomplete prose is absent from successful receipt content**. This is not an automatic-save security gate, a scientific completeness check, model qualification, document approval, or agency filing acceptance.

## Existing source provenance remains distinct

New source references are strictly parsed by `server/services/authoring/draft-source-references.ts:76`. During an authoring save, `authoring-from-draft.ts:337` reserves source stores, reloads references using the actor and current program, compares version identities, and records the sources as `qualification: unassessed`, `verification: current_at_save`. The reservation and verification occur inside the authoring transaction (`:470`).

The reference verifier reloads each actor-accessible current document (`draft-source-references.ts:124`), checks original content identity, catalog state, disposition and extraction length (`:92`), then verifies V2 full-extraction and excerpt digests (`:145`). These checks establish source identity and current availability, not whether the generated narrative is complete or clinically correct. Existing figure/claim checks have their own explicit limits; this receipt change does not strengthen them.

Saved references are rechecked before new renditions (`draft-source-references.ts:196`). `withSavedDraftSourceReservation` holds the program/source-store reservation through rendering and receipt commit (`:247`), and `authoring-export.ts:579` invokes saved-source verification before rendering. Existing route and file-to-Vault callers retain those checks. No lifecycle writer or export policy needs alteration for this contract.

## Compatibility

`batchDraftReceipt` has one production caller: the registered `batch_draft_sections` handler. Existing original-index mapping, failed-slot selection and successful-source receipts should remain byte-for-byte in meaning. Adding `finishReason` and normalized `truncated` to successful receipt slots is additive; `DRAFT_TRUNCATED` belongs to the receipt error outcome and does not require broadening the gateway error vocabulary or the service-level `BatchDraftFailure` union.

The generic HTTP `POST /api/claude/batch` directly returns service results (`server/routes/ana-intelligence.ts:428`) with provenance/turn records (`:460`); it does not call `batchDraftReceipt`. It should continue to return its existing response shape, generation usage and per-item settlement semantics. Its results can retain cut-off prose and the service termination fields because this increment is explicitly the AnA receipt boundary, not an HTTP service rewrite.

A separate, unmodified consumer gap was found: `client/src/concept2cure/v2/surfaces/BatchDraft.tsx:390` maps generic HTTP results into cards without retaining `finishReason`/`truncated`, and its accept POST at `:475` omits those fields. The existing server accept guard can refuse supplied cut-off metadata (`server/routes/batch-draft-routes.ts:489`), but this UI path does not forward it. This warrants a separately scoped follow-up; the current patch must not claim it protects that UI path.

## Meaningful focused regression cohort

Prioritize the new direct receipt and real registered-handler termination proofs, then the following existing suites:

- `server/services/ai-gateway/__tests__/finish-reason.test.ts`: shared vocabulary and absent/unknown limits.
- `server/services/ana/__tests__/batch-draft-sections.test.ts`: per-slot mapping, blank/service/source failures, paid-for siblings and unsaved state.
- `server/services/ana/__tests__/batch-draft-settles-per-item.test.ts`: unchanged canonical service settlement.
- `server/services/ana/__tests__/draft-context-checkpoint.integration.test.ts` and `draft-source-service-checkpoint.test.ts`: genuine source contexts and generation checkpoint behavior.
- `server/services/ana/__tests__/draft-authoring-source-schema.test.ts`: successful version-bound source receipt handoff.
- `server/services/ana/__tests__/batch-draft-submission-context.pglite.test.ts` and `drafting-product-advisory.test.ts`: existing project/submission request mapping through the same registered handler.
- `server/routes/__tests__/ana-intelligence-source-context.test.ts` and `ana-intelligence-audit-outcomes.test.ts`: unchanged generic HTTP source-context admission, per-item provenance and audit settlement.
- `server/services/ana/__tests__/draft-authoring-document-tool.pglite.integration.test.ts`: source-linked draft saving and original-document coordinate lineage through the registered authoring tool.
- `server/services/authoring/__tests__/draft-source-references.test.ts`, `saved-draft-source-export.test.ts`, and `saved-draft-source-reservation.test.ts`: strict decoder, saved-source identity and reservation preservation.
- `server/routes/__tests__/authoringSavedSourcesExport.pglite.integration.test.ts`: persisted source receipts still govern rendition refusal.

These suites are proportionate safeguards for the receipt and its neighbors. They do not qualify every incoming upstream change, live provider termination behavior, a live database deployment, scientific correctness or agency workflows. Whole-repository TypeScript and normal Git hooks remain release checks owned by the control tower.

## Final change review

Reviewed the frozen two-file production diff against the contract baseline. No blocking lifecycle or compatibility issue was found.

- `batch-draft-result.ts` imports the existing canonical `isTruncated` classifier. A literal `truncated: true` or a recognized truncating finish reason creates a failed `DRAFT_TRUNCATED` slot before blank-content handling; the branch does not include `content`. It preserves the original slot, type, unsaved state and original finish reason (or null). Existing arithmetic derives failure counts and recovery indices from the unchanged failed-slot logic.
- Successful nonempty slots add the original finish reason (or null) and `truncated: false`. The original `sourceStatus`, exact `sources` mapping without raw text and `sourceQualification: unassessed` remain unchanged. Unknown or absent finish reasons remain usable under the deliberately bounded contract; the new tool guidance explicitly says these fields do not certify completeness.
- `AnaToolExecutor.ts` changes only the existing batch return guidance. It restricts the suggested authoring handoff to drafted slots, names cut-off failures, preserves source-reference transfer and saved-ID reporting, and recommends repairing failed slots without regenerating successful siblings. The existing model approval/confirmation dispatch gates and downstream authoring handler are untouched.

Frozen reviewed SHA-256 bindings:

| Production file | SHA-256 |
| --- | --- |
| `server/services/ana/batch-draft-result.ts` | `981daafd2b37d93cd0a1a323a9de645d428e6d2903dff63cf103b83a24650401` |
| `server/services/ana/AnaToolExecutor.ts` | `4660a8a54ace84fc8f857c91a6317cfa2a5b518378fe692cffaffabfd9d9fc02` |

Historical pre-synchronization observation: read-only byte comparisons against `accf8c6bacfdc2d89b5de9098e22a67fe3f27914` at the first freeze confirmed the following were unchanged at that point: the drafting service, source-context producer, generic HTTP batch route and input guard, authoring tool and canonical draft writer, source-reference/save/export verifier, authoring renderer, generic batch accept route and BatchDraft UI. This observation is retained as historical evidence, not a blanket claim about the latest canonical application. In particular, this increment does not fix the separately recorded generic UI metadata gap.

No tests were executed by this reviewer, and no provider or database call was made. Execution/TypeScript/hook evidence is owned and reported by the control tower. These conclusions apply to the hashes above; a subsequent production edit requires renewed review.


Final lint-qualified freeze re-review: the receipt now factors termination normalization into private `draftTermination` (`batch-draft-result.ts:56`) and obtains it once after the existing service-failure branch (`:78`). The helper preserves the original reason or explicit null and computes the same literal-true/canonical-classifier OR. Missing results yield null/false before the unchanged blank-result refusal. The original-index map (`:66`), failed-slot precedence, source receipt mapping (`:90`), and count/recovery derivation (`:94`) retain their reviewed semantics. No blocking issue was found. The SHA-256 table above was updated to the independently computed final receipt hash; the executor hash is unchanged. No tests were run by this reviewer for this re-review. The control tower owns the lint diagnostics and final execution evidence.


## Synchronized canonical dependency review

After the control tower fast-forwarded to `ad372567d29a8ad385a751dde57a397cdc20cb3f`, reviewed the upstream diff from contract publication `70cb689712a9517359fc82dacf4f0d61b6084fd2`, the changed `authoring-documents.ts` dependency, its new shared seeder, adjacent authoring route changes, and our two-file production diff relative to the synchronized baseline. No blocking interaction with this receipt change was found. This review does not qualify all 357 incoming files.

The incoming `authoring-documents.ts` change delegates document seed insertion to `insertSectionSeedTx` (`:306`). The enclosing transaction still runs the source authorization/reservation callback before any document insert (`:277`), then writes each section through the shared helper on the same transaction client. `authoring-section-seed.ts:23` retains machine-author lineage, invokes the lazy verified figure-span callback after that source callback, records the supplied contributors and verified-import receipt on the genesis revision (`:30`), and writes the CREATE audit with the same client (`:32`). Its exact returned section-identity check fails rather than inventing a saved identity. Those mechanics preserve the existing source-linked AnA save handoff inspected here. Upstream also moves ordinary single-section evidence inside its transaction and adds existing-editor assembly behavior; those changes were supplied by the synchronized canonical branch, not authored by this patch.

The incoming authoring route changes register assembly routes, admit the saved document project for section drafting, record each section draft's saved base, and require that base when consuming a candidate. They concern the existing editor candidate path, distinct from `batch_draft_sections` and its `draft_authoring_document` handoff. They do not introduce a new consumer of `batchDraftReceipt` or make its termination fields an authoritative save token. The earlier no-automatic-save-gate and no-completeness-certification limits still apply.

Read-only byte comparison against synchronized `ad372567d29a8ad385a751dde57a397cdc20cb3f` confirms **our patch** leaves the current downstream authoring document writer, shared seeder, authoring router, authoring draft tool, canonical from-draft service, source-reference verifier, authoring exporter, generic HTTP batch route, generic batch accept route and BatchDraft UI unchanged relative to that baseline. This is a patch-scope statement, not a claim that downstream code remained unchanged throughout the incoming canonical history. Our two reviewed production hashes remain exactly those in the table above. The newly reviewed upstream dependency hashes are:

| Synchronized dependency | SHA-256 |
| --- | --- |
| `server/services/authoring/authoring-documents.ts` | `abc60a0fd1185b7f7e0c9f654d48c814f5aea330ba69010aa5a322a5b7554804` |
| `server/services/authoring/authoring-section-seed.ts` | `de53688969cd09271253997928da3d37389f4a7ce440cf790cfabaa41c0e4e86` |
| `server/routes/authoring.router.ts` | `ea1973f7f5f64203821acd8b925da5962453720f6ea8a91cd366aa1ba624653e` |

Recommended focused integration controls for the actual new dependency were the shared-seeder transaction suite and the saved-base/source coexistence suite. The control tower reports starting a final 23-suite cohort: its previous 21 plus `server/services/authoring/__tests__/assembly-section-transaction.pglite.test.ts` and `server/routes/__tests__/authoringAssemblyDraftSafety.pglite.test.ts`. The existing from-draft provenance and registered authoring tool suites cover the source-linked save path through the refactored seeder. A whole assembly HTTP rerun is not required to substantiate our bounded receipt change; upstream's own broader evidence remains separately scoped. No execution result is claimed here; the control tower owns the final cohort and whole-repository TypeScript evidence. This reviewer made no production/test/Git mutations and ran no tests, provider calls or database calls.
