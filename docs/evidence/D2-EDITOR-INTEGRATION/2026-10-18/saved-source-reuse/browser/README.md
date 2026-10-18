# Saved build source reuse browser evidence

The definitive [summary](final/summary.json) and [rollup](rollup.json) record **10/10 passing cases**, 43 measured stages and 37 screenshots for the [saved-source reuse contract](../../../../../design/SAVED_ASSEMBLY_SOURCES_2026-10-18.md). All pinned production files stayed unchanged throughout capture. The checkout was `e62320e0a9555188a08ce426d7c16c72d372d824`; exact feature and fixture bytes are identified by the SHA-256 pins in the summary, including the uncommitted working-tree implementation.

## Definitive behavior

| Viewport / theme | Without AnA | With AnA |
| --- | --- | --- |
| Desktop 1440 × 1000, light | Pass | Pass |
| Desktop 1440 × 1000, dark | Pass | Pass |
| Touch 390 × 844, light | Pass | Pass |
| Touch 390 × 844, dark | Pass | Pass |

Each primary case starts in a fresh mount of the actual saved document. Mounting the editor and opening its existing build disclosure perform **zero automatic saved-source GETs** and zero authoring mutations. **Check saved sources** performs one explicit scoped GET, shows the historical event time and exact source titles, and leaves the active selection empty. The exact machine-readable timestamp and visible primary UTC are asserted. **Use saved sources** performs another GET for the same record before adopting its exact two selectors; this sends no authoring mutation, preview or generation. Old plans, reasons and AnA choices are not restored.

Without AnA, the user chooses a template, previews and builds one missing section, then the remaining whole-document structure. Existing saved prose, identities and original section order remain unchanged. Missing science stays empty, with no drafting or acceptance request.

With AnA, a fresh preview/build creates two candidates sequentially, with maximum generation concurrency one and no automatic acceptance. Switching reviews preserves the edited first body and reason. The user then explicitly closes the existing review panel, clears the active source selection, checks history and reuses it through another fresh GET. Reopening the same retained candidate preserves its edited body and reason. Only explicit manual acceptance saves that exact first candidate into the exact section; the other candidate remains unaccepted and existing saved prose remains unchanged. Reuse does not recreate the candidates or restore a closed panel automatically.

Two additional touch cases pass: a whole-document read-only viewer can check history but **Use saved sources** and build controls remain disabled; a second GET that returns a different recorded event is refused without selecting that record or starting any work. The changed-record case also verifies existing content and document identity remain intact.

Across the ten cases there are **27 saved-source GETs, 20 fresh previews, 12 commits, 8 candidate generations and 4 explicit acceptances**. All 32 preview/commit requests carry the exact saved selectors, and every candidate request carries the exact fresh synthetic manifest. Full GET envelopes, requests, retained content, acceptance bodies and measurements are in `final/*-results.json`. There are zero console errors, page errors, unexpected HTTP requests or navigation callbacks. Presence POST/PUT traffic from the existing collaboration controls is allowed; the zero-write assertions apply to authoring actions, rather than every HTTP method in the editor.

All measured editor stages retain one native rich editor, with build controls outside its toolbar. Page, assembly and review measurements fit horizontally at the tested widths, including long hashes and the existing long built-in template label. One of the 43 stages is a manual-wheel receipt rather than a rectangle measurement.

## Scroll and direct inspection

The [manual-wheel receipt](final/touch-light-deterministic-saved-history-wheel.json) uses the existing `.ed-doc-scroll` at 390 × 844. Two 200-pixel downward wheel steps reach the second exact historical source title; one upward step returns to the explicit reuse control. This is a real wheel reachability assertion, without programmatic scrolling to either target. The long historical record remains in the existing scroll area; not all fields are visible simultaneously in a phone viewport.

Direct visual inspection includes [desktop light history](final/desktop-light-deterministic-saved-record-checked-not-selected.png), [desktop dark history](final/desktop-dark-deterministic-saved-record-checked-not-selected.png), [mobile history after wheel](final/touch-light-deterministic-saved-history-after-wheel.png), the [edited existing review panel](final/desktop-light-ana-first-review-edited.png), [read-only inspection](final/touch-light-read-only-read-only-build-disabled.png) and [changed-record refusal](final/touch-dark-changed-record-changed-record-refused.png). The existing notices, forms, buttons, UTC timestamp component and review panel follow the canonical styles. These captures do not establish accessibility compliance or simultaneous visibility of every control.

## Fixture boundary

The fixture mounts actual `DocumentWorkbench`, `AuthoringAssemblyBuild`, saved-source controls/notice, native rich editor and `AuthoringAiDraft` with canonical product styles. It adopts a synthetic actor through the actual authentication service and publishes the actual shell project. HTTP responses are synthetic. The fixture mounts the editor directly with one saved document; the full shell, catalogue entry and conversation thread are not mounted. No production exports, stylesheet, product dependency, database or provider was changed by this evidence task.

The explicit GET `/api/authoring/docs/:docId/assembly/sources?programId=...` returns the strict shared v1 envelope, exact document/project and a two-source historical manifest. Sources are Data Room IDs 41 and 42 with exact expected checksums. One has retained text with original bytes unavailable. The synthetic server starts with an already saved record and returns it only after an explicit check; this is not proof of backend persistence or audit verification. Both history and fresh-preview limits explain that selected excerpts do not establish scientific qualification or filing approval. The draft response reports two retrieved sources and no resolved citable attribution; the actual panel reports that limitation and no generating model is claimed.

## Historical preparation receipts

- [Meaningful baseline RED](initial-entry-red/receipt.json) and [capture](initial-entry-red/existing-build-before-saved-check.png): actual existing editor and expanded build disclosure lacked **Check saved sources**. The captured UI source hash stayed unchanged, with no console/page errors or unexpected requests.
- [Initial fixture lint](initial-fixture-lint.json): a non-hook interaction helper named `useSaved` triggered React Hook lint, plus bounded helper-size/complexity and unused-import warnings. Fixture-only helper extraction/renaming and exact GET-scope assertions corrected these problems.
- [Early mobile diagnostic](diagnostic/summary.json): two touch-light cases passed on unchanged captured source bytes, before the definitive freeze. It does not replace final full-matrix proof. The retained diagnostic pins predate the added final manual-wheel assertion.

## Reproduction

Use the existing Node 22 toolchain, installed `/usr/bin/chromium` and Playwright Core at `/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs`. From the repository root, start the fixture in one terminal:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/saved-source-reuse/browser/server.mjs
```

Run the bounded matrix in a second terminal:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/saved-source-reuse/browser/browser.mjs
```

The server uses loopback port 5191 with file watching disabled; restart after source changes. `--diagnostic` runs only the two touch-light primary cases. Runners overwrite their output directories, so preserve prior proof before replay. `baseline-entry.mjs` expresses the historical missing-feature assertion and will pass on the implemented feature. Stop the owned fixture server when finished.

[Fixture validation](fixture-validation.json) records strict ESLint for all five retained executable JS/TS fixtures with zero errors/warnings, plus four passing Node 22 syntax checks. [Cleanup](cleanup.json) records source/fixture hash checks, evidence-link checks and owned-server closure. The prior source-first assembly browser packet remains unchanged.

## Limits

Request receipts prove the UI used the exact synthetic selectors/manifest. They do not establish real audit integrity or latest-event ordering, current backend source admission/authorization, excerpt verification, provider consumption, citation lineage, scientific correctness, regulatory readiness or deployment. Live providers, full-shell navigation, Vault and mixed-source history, null/failed history and the broader context-race matrix are outside this bounded browser packet. Separate backend/controller/integration evidence addresses those contracts. This is not a human acceptance test or accessibility audit.
