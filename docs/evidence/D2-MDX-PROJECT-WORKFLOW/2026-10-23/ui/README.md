# Actual MDX project workflow browser qualification

## What already exists

- `docs/evidence/D2-WORKFLOW-NAVIGATION/2026-10-23/ui/browser-server.mjs`, `browser-probe.tsx` and `browser-check.mjs` retain the existing Vite + installed Chromium actual-component qualification pattern. This packet imports that same server loader, aliases and dependency setup; it does not introduce another application server or test dependency.
- `client/src/concept2cure/v2/surfaces/ProjectMdxWorkflow.tsx` renders the real compiler-derived device/diagnostic workstreams. `ProjectHome.tsx` contains that component and the existing Evidence / Author / Review / Submit / Respond lifecycle.
- `WorkflowCatalog.tsx`, exported as `Apps` from `AdminSurfaces.tsx`, groups existing MDX features under Projects through `MdxCatalogSolution.tsx`. Those shipped components and CSS are imported directly here; no production screen is recreated.
- `tests/e2e/mdx-workflows.e2e.spec.ts` visits individual legacy feature routes, but does not select a project or verify these workflow handoffs. A project guard can satisfy its generic shell/body assertions. It is not evidence of a selected-project workflow.
- `ProjectMdxWorkflow.test.tsx` and `ProjectHome.mdxWorkflow.test.tsx` already exercise plan and stage behavior in jsdom. This packet completes their browser/viewport qualification using the actual `QueryClientProvider` and `AuthProvider`.

Search covered existing MDX e2e, Playwright configuration, browser/visual QA scripts, source components and retained evidence harnesses. `git log --all --diff-filter=D` found no deleted matching harness in the locally available history. Nothing is replaced or deleted.

## Method and limits

The retained Vite fixture serves the repository on `127.0.0.1:5201`. The existing `scripts/visual-qa/playwright.mjs` resolver launches the configured Chromium binary; this run selects `/usr/bin/chromium`. Every `/api/**` request is intercepted with explicit synthetic records, empty read models or the explicitly unavailable synthetic team read. Unknown requests and every non-GET fail qualification. The actual AuthProvider has no stored credentials; mounting it satisfies component context, and does not authenticate a session.

The observed navigation, stage and AnA outputs are the real components' callbacks. ProjectHome reads a synthetic verified UUID through its actual API adapter; its workstream actions select its existing lifecycle stages. The standalone compiler fixtures cover 510(k), MDR CER, IVDR PER, recorded multiple filings and De Novo document assembly.

This is automated synthetic UI qualification. It is **not** authenticated client acceptance, human acceptance, a deployed-environment test, a production write, a live signature, an AnA/model request, agency submission or transmission. Existing MDX feature destination callbacks are checked; their complete downstream screens and backends are not qualified by this packet. The standalone fixture's availability predicate is synthetic. The actual shell rail, every client persona and screen-reader acceptance remain outside this packet.

## Reproduce

Use the repository's supported Node 22 runtime and existing installed dependencies:

```sh
node docs/evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-23/ui/browser-server.mjs
# In a second terminal:
PLAYWRIGHT_CHROMIUM=/usr/bin/chromium node docs/evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-23/ui/browser-check.mjs
```

The inherited server has `watch: null`: stop and restart it after any production component/CSS or probe change. Freeze source inputs before qualification. The check records 38 selected source hashes before/after; those pins complement source freeze and cannot detect a stale Vite module graph by themselves.

## Final result

Qualified source includes the De Novo handoff, native workflow/catalog/return controls, and AnA project-journey grounding. The final source fingerprints are authoritative; newer canonical auth and reporting recovery changes are preserved. `browser-result/result.json` and `browser-execution.txt` are the final outputs: **14 checks passed**, 38 selected source pins unchanged, 21 intercepted GETs, zero unexpected requests and zero browser page errors.

Desktop is 1440×1050 and mobile is 390×844. Expanded workflow, catalog and actual containing ProjectHome each have a document width of 390px at the mobile viewport. Dark body text measures 12.12:1 against the workflow panel and discipline-owner text 6.82:1. Visible workflow actions measure 32px tall with 14px horizontal padding; native disclosure and action keyboard focus are visibly outlined. The actual ProjectHome screenshot shows the selected Author stage and its honest empty document state.

The ten final screenshots are direct viewport JPEG captures at quality 45 with animations disabled. Selected content anchors cancel the stage callback's smooth scroll before capture; no image is resized or altered after capture. Every retained file is below 100,000 bytes.

- `browser-result/desktop-510k-overview.jpg`
- `browser-result/desktop-cer-clinical-evidence.jpg`
- `browser-result/desktop-ivdr-performance-evaluation.jpg`
- `browser-result/desktop-shared-multifiling-evidence.jpg`
- `browser-result/mobile-multifiling-expanded.jpg`
- `browser-result/mobile-dark-multifiling-expanded.jpg`
- `browser-result/desktop-catalog-project-mdx-solution.jpg`
- `browser-result/mobile-catalog-project-mdx-solution.jpg`
- `browser-result/desktop-actual-project-home-author.jpg`
- `browser-result/mobile-actual-project-home-author.jpg`

## Retained earlier failures

- `first-run/` retains the first sizing failure, original check source and screenshot. Its first size assertion queried a button inside closed details; a follow-up visible-control diagnostic measured 36px height but 0px horizontal padding. The shell reset overrode the canonical Tailwind button padding. The production correction uses the existing native v2 button recipe. The final check selects an open workstream's visible action and verifies height, positive padding and keyboard focus.
- `fixture-correction-run/` retains the failed fixture expectation that called a disabled feature "disabled" while the actual catalog correctly says "turned off for this workspace". The expected wording was corrected; the lock behavior did not change.
- `provider-correction-run/` retains the attempt to mount ProjectHome without its required actual AuthProvider. The fixture was corrected to mount the shipped provider. This was a harness context error, not a product defect.
- `fixture-expansion-run/` retains a run in which all 14 UI behavior checks passed but the final unknown-request gate failed on additional ProjectHome read models. Those existing contracts were inspected and explicitly intercepted. No unknown-request check was removed. Its exact prior check source was recovered and verified against its recorded SHA-256.

The large original PNGs in the first two failure directories are preserved byte-for-byte as ordered 80,000-byte `.part-*` chunks. Each `failure.png.manifest.json` records original bytes, original SHA-256, each part's hash and the reassembly command. These are historical failure captures, never the final verdict. Temporary successful PNG captures from interrupted runs were superseded by the final direct JPEG captures.

Visual inspection of final desktop/mobile ProjectHome, desktop CER, desktop catalog and dark mobile workflow screenshots found readable text and the expected project lifecycle and feature grouping. The catalog now uses the native v2 primary button recipe; browser assertions verify its visible fill, 32px height, 14px padding, readable text and keyboard activation. The host entry/return controls reuse the same shell recipe.

`catalog-affordance-red/` retains the failing unstyled catalog action (40px height, zero padding and border). `catalog-fixture-correction/` retains an overly strict fixture assertion requiring a border even on the correctly filled native primary button. The final assertion accepts the canonical visible-fill recipe and still requires padding, a visible boundary/fill and 4.5:1 text contrast; the original unstyled control fails these requirements. Historical executable snapshots use `.mjs.txt` / `.tsx.txt` filenames to distinguish retained source from the current runnable harness. `pre-catalog-fix/` preserves the earlier passing packet that documented the outstanding catalog affordance.
