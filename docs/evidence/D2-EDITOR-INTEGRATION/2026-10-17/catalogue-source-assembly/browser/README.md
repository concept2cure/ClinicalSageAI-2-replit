# Source-first document assembly browser evidence

The definitive [summary](final/summary.json) and [rollup](rollup.json) record **10/10 passing cases**, 34 measured stages and 33 screenshots. Capture used the working-tree source bytes pinned in the summary, on checkout `8d06f71566d01380dc772c1d5f4fa0494aa215c7`; the checkout identifier alone does not identify the uncommitted feature bytes. Production hashes were unchanged throughout capture. The final replay includes the private source-publisher ownership guard in `editorTarget.ts`.

This evaluates the [source-first assembly contract](../../../../../design/CATALOGUE_SOURCE_ASSEMBLY_2026-10-17.md). It mounts actual `ProjectHome` Data Room selection, `SourceAssemblyDialog`, the `editorTarget` channel, `DocumentWorkbench`, build controller, `AuthoringAiDraft`, native rich editor and canonical product styles. Synthetic HTTP and authentication provide bounded fixtures. The fixture host switches to the real editor at the actual `onNav` callback; the full shell router and conversation thread are not mounted. Production components are not replaced.

## Definitive cases

| Viewport / theme | Without AnA | With AnA |
| --- | --- | --- |
| Desktop 1440 × 1000, light | Pass | Pass |
| Desktop 1440 × 1000, dark | Pass | Pass |
| Touch 390 × 844, light | Pass | Pass |
| Touch 390 × 844, dark | Pass | Pass |

Each primary case starts in the actual Data Room, checks two explicit source rows, opens **Build in editor**, chooses the exact existing saved working document and opens that same editor. The selected-source action is absent before selection: no newest-source inference is used. Selection and the target chooser issue zero POST requests. Opening the editor issues zero authoring mutations, previews or draft requests; existing collaboration presence traffic after editor mount is allowed.

The handoff preserves both exact Data Room identities (`41`, `42`) and expected checksums. All **32 preview/commit requests** carry those exact two selectors; all **8 candidate requests** carry the exact synthetic verified-source manifest. The manifest display is checked for namespace and ID, versions, original and extracted-text hashes, UTF-16 excerpt bounds `[0, 900)` of 2,400, excerpt hash and limitations. Source A has retained readable text with original bytes unavailable; source B has original bytes available. The existing **Work on document** whole-source import is not invoked.

Without AnA, each case explicitly previews and builds one missing section, then the remaining whole-document structure. Existing saved prose, section identity and original order are preserved; missing science remains empty. There are no draft or acceptance requests.

With AnA, two empty eligible sections generate sequentially, with maximum concurrency one. They remain queued for review in the existing panel and are never automatically accepted. Editing the first candidate body and reason, reviewing the second and returning preserves the first review state. Explicit acceptance addresses only the first candidate and exact section, with the edited body and reason. Existing prose and the other unaccepted section remain intact.

The additional touch cases verify read-only denial using the canonical server reason and a pending chooser response invalidated by an actual shell-project A → B → A visit. Read-only build controls remain disabled and issue no authoring mutations. The late pending response cannot publish navigation, mount an editor or enable opening. This browser ABA case occurs before target publication; published-before-lazy-mount, account and session ownership are covered by separate channel integration tests, not this browser scenario.

Across the ten cases: **20 previews, 12 commits, 8 generations, 4 explicit acceptances**, zero console errors, zero page errors and zero unexpected HTTP requests. Full request bodies, handoffs, retained content and measurements are in each `final/*-results.json`. Every measured editor stage has one native rich editor; build controls remain outside its toolbar. Page, assembly and review measurements find no horizontal overflow at the tested widths, including the long existing built-in template option.

## Scroll and visual inspection

The fresh [manual-wheel receipt](mobile-height-final/measurement.json) uses the same actual source entry and editor at 390 × 844. Two 200-pixel wheel steps make the last queued Review control reachable. After opening it and explicitly collapsing **Build document or section**, six more 200-pixel wheel steps reach the existing review heading and native editor. The receipt records scroll ancestors and unchanged layout-source hashes. This proves real wheel/control reachability within the existing `ed-doc-scroll`, rather than relying on programmatic `scrollIntoView`. Long forms remain scrollable; a screenshot shows only the current viewport.

Directly inspected final captures include:

- [Desktop light source chooser](final/desktop-light-deterministic-source-target-dialog.png) and [touch light chooser](final/touch-light-deterministic-source-target-dialog.png): settled existing drawer, wrapped checksums and visible footer.
- [Desktop light built manifest](final/desktop-light-deterministic-deterministic-built.png) and [desktop dark section preview](final/desktop-dark-deterministic-single-section-preview.png): source references, versions, hashes, bounds and limits remain distinct from document prose.
- [Desktop dark edited review](final/desktop-dark-ana-first-review-edited.png), [touch dark section preview](final/touch-dark-deterministic-single-section-preview.png), [read-only refusal](final/touch-light-read-only-read-only-build-disabled.png) and [pending-context refusal](final/touch-dark-pending-context-refused-late-handoff.png).
- Mobile [last queued Review](mobile-height-final/after-wheel.png), [review heading](mobile-height-final/review-heading-after-wheel.png) and [native editor](mobile-height-final/native-editor-after-wheel.png) after wheel interaction.

The existing opened-document toast can remain visible in these bounded captures and temporarily overlap lower content; they do not establish that every control is simultaneously unobscured. Canonical styles, the existing disclosure, drawer, review panel and editor remain in use. This is not an accessibility audit or human acceptance test.

## Historical receipts

- [Initial entry RED](initial-entry-red/receipt.json) and [screenshot](initial-entry-red/selected-data-room-before-build-entry.png) show the actual pre-feature Data Room with both rows checked but no **Build in editor** entry. This is the meaningful feature RED, based on the source bytes recorded there.
- [Initial animation fixture summary](initial-animation-fixture/summary.json) retains the first candidate run. Nine bounds assertions measured the drawer during its existing slide animation; the pending-context case passed. This was a fixture timing error, corrected by waiting for real dialog/backdrop animations to finish. It is not a settled-layout product failure.
- [Pre-publisher-guard positive summary](pre-publisher-guard-positive/summary.json), [rollup](pre-publisher-guard-positive/rollup.json) and [wheel measurement](pre-publisher-guard-positive/wheel-measurement.json) retain the earlier ten-case pass. They predate the private publisher guard. The authoritative `final/` replay changed only the pinned `editorTarget.ts` production hash relative to that pass; the definitive wheel proof was also refreshed.

## Reproduction and scope

From the repository root, use Node 22, the existing installed Chromium at `/usr/bin/chromium` and Playwright Core at `/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs`. No product dependencies were added. In one terminal start:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/server.mjs
```

In another terminal run the same ten cases and supplemental wheel proof:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/browser.mjs
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-17/catalogue-source-assembly/browser/height-probe.mjs --final
```

The server binds loopback port 5190 with file watching disabled; restart it after source edits. `browser.mjs --diagnostic` limits execution to the two touch-light primary cases. Runners overwrite their output directories: preserve prior evidence first. `baseline-entry.mjs` expresses the historical missing-entry assertion and will pass against the completed feature; its retained RED is not regenerated by the final run. Stop the fixture server when finished.

[Fixture validation](fixture-validation.json) records strict ESLint for all six retained executable JS/TS files (zero errors or warnings) and five passing Node syntax checks. [Cleanup](cleanup.json) records server closure and final source/fixture hash checks.

These receipts establish UI behavior with synthetic responses. They do not establish real backend source admission, excerpt verification, authorization or database transactions, provider consumption of sources, citation lineage, scientific correctness, regulatory readiness or deployment. The fixture returns two retrieved sources with no resolved citable attribution; the existing panel truthfully reports that limitation. Vault entry and mixed-source backend resolution, the full shell, live providers and human testing remain outside this bounded browser packet.
