# Complete saved template guidance in the existing section draft request

Workstream W1, launch row D2. Local/Codespaces only; direct normal commits/pushes to `concept2cure-v2`, no deployment or live provider/agency calls.

## What already exists

- `server/routes/authoring.router.ts` owns the existing `/sections/:sectionId/ai/draft`, with current section edit/lock admission, actual saved project admission, selected-source manifests or project retrieval, one gateway, recorded turn, immutable candidate and explicit attributed acceptance. Its inline prompt uses heading/module/product plus caller tone/region/context/requirements, but never saved template guidance, eligibility or limitations. FDA is the absent-input default. The prompt incorrectly promises compliance-ready content.
- `server/services/authoring/authoring-template-guidance.ts` resolves earliest CREATE guidance, section assembly identity and current tenant/global fallback. The existing section GET and saved review reuse it. Its historical rows intentionally support partial identity; alone it does not compare an assembly receipt's program to the actual program.
- `server/services/ana/saved-template-review.ts` is the canonical full saved-reference validator. It validates parent provenance, exact section CREATE metadata, assembly doc/program/template/snapshot identity, complete or historical source fields, filing context, malformed metadata, reference authority and byte budgets. Given one currently admitted section, it can resolve that section's references without reading any other section's text. Its current whole-review scope expects non-null program ID; nullable standalone scope must remain honest and must never satisfy a present assembly receipt with a sentinel.
- `client/src/concept2cure/v2/editor/assemblyDraftQueue.ts` already sends bounded template-reference context when assembly initiated generation, separately from source manifests and user requirements. The standalone panel uses the same API but cannot establish reference authority from a client copy. Server resolution completes both paths without trusting caller context or a renamed heading as template identity.
- `server/services/ana-ri/open-document.ts` and the preceding section-scope fix admit the legacy CTD supplement only for resolved US_IND parent type. Section-over-parent chat guidance requires additional authenticated prefetch threading; this increment first completes the already admitted direct draft path. Existing oversight prompts/readers remain in use.
- Existing real HTTP/PGlite fixtures include `server/routes/__tests__/authoringAssemblyDraftSafety.pglite.test.ts`, `authoring-ai-draft-record.pglite.test.ts`, `authoring-draft-program-sources.test.ts` and saved-template review tests. They capture actual gateway messages, immutable turn records, candidates and refusal behavior. No second host or fake product engine is needed.
- Latest canonical A2.5 (`c7f2745a6`) already completes filing-picker guidance and the shared Ask AnA question. Its UI, grants and navigation are retained. Current root rules, placement map and handoff were read.

Searches covered direct draft/template guidance/reference/source/section context/eligibility/filing-context names in current routes/services/client/shared contracts and schema-related paths, plus `git log --all --diff-filter=D` for saved-template-review, authoring-template-guidance, section-context, open-document and authoring draft names. No deleted alternate implementation supplied the missing connection. Runtime/network observations are current, connected/running, unrestricted/enforced; inherited proxy, trust and authentication are preserved.

## Contract

1. Reuse `savedTemplateReview` for the exact admitted saved section, after current edit and project admission and before selected-source reads, retrieval or model dispatch. Add captured document template ID/provenance to the existing tenant-bound section query. Pass the actual admitted program, or null when absent. Preserve receipt program comparison; null never authorizes an assembly reference. Clarify the validator's caller-access comment to admit each explicitly requested section, without changing its reads or permission engine.
2. Select the section's own assembly source when present, otherwise its validated parent/recorded reference. A different parent does not replace the section's eligibility, limits or jurisdiction. Identity-only/current-reference/missing context stays explicitly unverified; do not manufacture complete source fields or eligibility. Existing ad-hoc and historical drafting remains available unless a recorded limit forbids it.
3. Refuse automated drafting for recorded `aiDraftable:false`, preparation kind or manual authoring mode. Preserve original forms/datasets/signed records and manual editor access. A source with explicit missing/partial identity is not reported as fully verified or scientifically supported.
4. A recorded US/CA/EU/JP filing context maps to the existing FDA/Health Canada/EMA/PMDA writing control. Derive that writing region only when the request omitted it; an explicit conflict refuses rather than silently overwriting retained inputs. GLOBAL or absent context establishes no receiving jurisdiction; retain the existing explicit choice/legacy absent-input default as an unconfirmed writing preference.
5. Send exact validated guidance, authority, effective identity, limitations and source/filing fields inside a fixed reference-only JSON fence, separate from authored requirements and `[SRC-n]` evidence. Enforce a **16 KiB UTF-8 bound on the full reference block**. Refuse oversized mandatory context, without clipping requirements/limits or splitting Unicode. Malformed/unread references refuse rather than silently falling back to another template.
6. Extract the existing inline draft prompt once into `server/services/authoring/authoring-draft-template.ts`, alongside this small adapter/renderer over the canonical validator. The existing route remains the only generation/candidate writer; no new engine, endpoint, store, controller, UI/CSS, dependency or model. This extraction pays for the connection without growing the router's existing line-count warning. Replace the compliance-ready claim with a working-draft instruction and preserve all source-attribution envelope instructions.
7. Keep caller tone/context/requirements and their request records intact. Store the actually sent prompt through the existing turn recorder and candidate prompt digest; existing metadata reports the effective writing region. No retrieval-query/ranking/manifests/citation authority or acceptance changes. A refusal produces no model call, turn/candidate, content save, approval or filing.

## Qualification and publication

Meaningful RED must exercise the existing actual HTTP draft route before production changes. Pure new-helper preparation without an existing export is not RED. Cover recorded-over-current guidance, section-over-parent identity, renamed headings, Japan/Canada/EU, conflicting region, manual/preparation limits, malformed or foreign receipt, legacy absence, full-context byte bound and unchanged sources/inputs/content. Verify actual recorded prompt and candidate digest. Preserve fixture/setup/calibration epochs honestly. Run scoped lint with no warning/metric growth, appropriate existing source/accept/model/current-access regressions, UI/size gates and build. Full compiler runs sequentially through normal push hooks (baseline 0), never beside tests/build/gates. Normal source publication and final documentation follow-up include exact Git input and artifact verification. Human cases remain Not run.

## Results

In progress; no human or live-model acceptance is claimed.


## Candidate qualification and fixture history

The new actual HTTP cases pass **33/33**, and adapter/reference-rendering cases pass **24/24**. The latter mock only the canonical validated review result and do not claim SQL/access proof. Exact raw epochs, source snapshots and manifests are retained in `http/` and `unit/`.

The original HTTP RED had 23 failing new assertions and 10 passing controls. The unchanged saved-guide and section-over-parent cases establish meaningful prepatch product failures. Twelve fixtures later required matching parent/CREATE source seeds (unless explicitly testing an assembly override); the canonical validator correctly refused their initial conflicting seed data. The raw 23-failure RED and 12-failure first candidate epoch are retained and are not presented as 23 valid-source product proofs. Describe groups were split only to keep fixture lint clean. An initial missing Vitest launcher is explicitly setup-unrun, never RED.

The first root 14-suite integration had 211 passes/10 failures, no input drift. The three affected mock-SQL fixtures returned zero rows for an empty size aggregate; actual SQL returns one `reference_bytes=0` row. Each fixture now models that result while preserving all original source, provider refusal and envelope assertions. The 10 affected cases pass after this fixture correction. No production fallback was added. A final fixed prompt sentence explicitly connects saved guidance to structure/limits; the final root epoch qualifies this one-line successor to the workers' recorded candidate bytes.

Scoped production lint has no errors and the same 22 existing router warnings; new helper, canonical validator and the three corrected fixtures have 0 warnings. Router draft complexity decreased 66→62 and counted lines 5301→5294 during extraction, rather than growing a warning allowance. Exact metrics are retained in lint comparison JSON; final lint/root push gates verify the final source again.

## Canonical integration

Four incoming commits through `ddbdfb938` complete independent onboarding/discovery handoff safety and verification. No declared draft-guidance input overlaps. Root retains them through a normal merge and qualifies the final combined source, build and existing editor/UI/size gates. No UI, navigation, entitlement or deployment is changed by this increment.


## Final combined qualification

After normal merge, **221 distinct tests across 14 suites pass** (`integration-post-merge.json`), with zero drift across the 54 declared source/config/test/migration inputs. This includes the new 33 actual-route cases and 24 adapter cases; repeated worker runs are not added again. Existing source retrieval, selected-source manifests, immutable generation/accept records, saved-review validation, provider refusals, structured source mapping and editor review/assembly flows remain covered.

All seven existing editor/UI/size gates pass, with no baseline or style-rule changes (`gates-post-merge.json`). Final scoped lint has zero errors and the same 22 pre-existing router warnings; all new/changed fixtures, the adapter and canonical reference owner have zero warnings. The router's counted lines decrease 5301→5294, and its draft callback complexity decreases 66→62. No new UI, CSS, engine, endpoint, model, dependency, schema, entitlement or dispatch behavior was introduced.

The actual HTTP checks keep guidance out of project evidence/candidate sources, verify the exact prompt persisted in the immutable turn record and candidate digest, and refuse region/eligibility/reference failures before selected-source/model/turn/candidate/content writes. Reference identity is not scientific support or evidence that a live model used it.

All 130 human checklist cases remain **Not run**, including new 125–130. No native PostgreSQL concurrency/RLS, live model/provider, agency submission or deployment qualification is claimed. Full editor-action parity remains in progress; section-over-parent chat prefetch is a separate authenticated-context completion, while this increment completes the shared direct section-draft request used by standalone and assembly preparation.


The full client/server build passes (`build-post-merge.json`, 19.049s), with no declared input drift. Pre-publication read-only verification matches all 54 actual Git input blobs and the source ancestry at `a1946af7ee85e16fce30f88b787250ab5e567f62` (source commit `62d1b6f5119c89923d0bb2c38b577ee07e0e063d`). Normal direct publication runs every hook, including full TypeScript baseline 0. Its actual outcome is retained after completion.


## Normal compiler refusal and scalar parameter correction

The first normal source push was stopped before publication by one TypeScript error: Express declares route parameters as string|string[], while the new adapter accepts string. The exact failed receipt/raw output is retained under `publication-attempt1/`. The existing actual route value is normalized with `String(sectionId)`, matching the turn/candidate identity handling already in use. No compiler baseline was changed. The affected 57 HTTP/adapter cases pass with this final expression (`type-fix-tests.json`), no drift. The combined run/build and normal push checks are repeated after synchronization.

A fresh fetch also found the current dossier-details/AnA handoff and unstated-vaccine-fact corrections through `5e7e36ca1`. Their runtime files do not overlap the draft-guidance edits. The current handoff/map was read; it keeps the same core project workflow and editor ownership. Root retains all incoming history with a normal merge.


## Release successor qualification

After the scalar parameter correction and normal integration of current dossier/vaccine work, **221/221 tests across 14 suites pass again** (`release-integration.json`), with no drift across all 62 declared inputs. `release-gates.json` passes all seven existing editor/UI/size checks; `release-lint.json` reports no new errors/warnings. These final receipts supersede the earlier code/input epochs without replacing them. The normal TypeScript gate is retried with baseline 0 unchanged; its actual result is recorded after completion.


The release successor's full client/server build passes (`release-build.json`), with no declared input drift. Read-only verification matches all 62 source/config/test/migration/CSS input blobs at the final merged code before the normal retry.


## Accepted canonical publication

Normal direct source publication succeeded at **`96ac4c4a3394d6725097229d7d97b1e43160e2a2`**, including original source `62d1b6f5119c89923d0bb2c38b577ee07e0e063d` and scalar type correction `ee0bfd83e6ba683755f1bfa00f82bf94c62bf37e`. `publication-code.json` and raw output retain all normal hooks, **zero TypeScript errors**, no lint errors/warning growth, and unchanged repository-size ceilings 56 /114. The first compiler refusal remains archived under `publication-attempt1/`; no baseline, hook or type check was bypassed.

Fresh authenticated fetch found **0 ahead /0 behind**. `accepted-code-verification.json` matches all **62 actual Git input blobs** and verifies both source and type-correction ancestry at the accepted canonical revision. The artifact manifest hashes the full evidence packet, including historical failures, fixture corrections and final receipts. Final normal documentation publication carries this proof and local testing handoff; the final read-only verifier checks its accepted revision without creating a recursive receipt.

All **130 human cases remain Not run**. This work qualifies local automated draft-context behavior, not native PostgreSQL scheduling/RLS, live model consumption/competence, agency acceptance, deployment or full editor-action parity. Drafts still pass through the existing editor, explicit acceptance/save controls and signature requirements.


## Complete source-snapshot publication

The final read-only artifact verifier found compressed canonical SQL source snapshots excluded by the repository's `*.sql.gz` ignore rule. Each missing file was decompressed and matched by SHA-256 to an already tracked canonical migration; none is a database export. The exact list/proof is retained in `ignored-source-snapshot-publication.json`. These intended evidence files are added explicitly with `git add -f`, without bypassing hooks or forcing a branch update. The artifact manifest is recomputed and the accepted documentation revision is reverified in full. Source-code/test input hashes remain unchanged.
