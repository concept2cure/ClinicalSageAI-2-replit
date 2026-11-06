# Complete project authority in the existing editor

Plan: F1. Workstream W1, launch row D2. Scope: the existing project-to-document/editor path, under ONE_DESIGN_PLAN §1a/2 and CLAUDE.md Rules3–6. No screen, route, service, table, editor or app is added.

## What already exists

- `server/services/authoring/authoring-program-access.ts` verifies current actor/membership, admits the program and its unique project anchor, then calls the existing project-sharing policy. It defaults authoring calls to writes, but omits that intent at the final policy call.
- `server/services/report-os/project-access.ts` already separates read/use/reviewer access from edit authority, and locks the actual edit membership for writes. Reuse its existing `forWrite` option.
- `server/services/authoring/authoring-source-import.ts`, CSR study-data/review, saved-draft creation, assembly and governed document callers already share the authoring gate. Their actual positive fixtures must have edit grants; read-only source access stays separate from target writes.
- `client/src/concept2cure/v2/editor/useScopedDocuments.ts` is the one list reader used by the existing editor/project template starts. Its existing verifier checks success and actual program identity for recovery only; ordinary scoped reads accept unsuccessful or foreign-project rows in a contradictory 200 response. The existing server already filters by project and returns success/program identity correctly; this is client result-integrity coverage, not an observed server exposure.
- `authoringCreationHostRecovery.test.tsx` already pins refusal of invalid recovery lists. Extend the same verifier to ordinary project reads; preserve intentional legacy organization reads and current actor/session/retirement guards.
- `ProjectHome`, its document start/source assembly and `DocumentCanvas → DocumentWorkbench → RichSectionEditor` already supply the core workflow. Their active layout/drafting owners are untouched.

Searches: source-name/caller/route searches and full-history deletion searches on authoring-program-access/project access/useScopedDocuments. The history is not shallow. No deleted replacement is restored. The previously unpushed Oct30 source is unavailable; this repair starts from current canonical.

## Completion and proof

1. Prove current project-read-only callers incorrectly pass write admission through the real policy queries; then forward the existing flag. Owner/editor/admin writes stay valid; explicit permitted reads stay valid.
2. Prove the ordinary editor list exposes unsuccessful/foreign-project responses; then reuse its existing verifier for scoped reads. Preserve valid empty lists, reload/retirement behavior and deliberately supported legacy scope.
3. Run focused caller and editor regressions, calibrating positive fixtures with honest grants/response scope without weakening denial controls. Run current required gates and normal CLI compiler; publish directly to concept2cure-v2 with Plan/Completes trailers.

## Status

Implementation and local checks complete; canonical synchronization and normal hooked publication are pending. Historical Oct30 results do not qualify this source.


## Observed RED and focused GREEN

`backend-red.json` reproduces 4 failing project-policy cases with 5 passing controls. `editor-red.json` reproduces 10 failing contradictory-response cases with 6 controls. Both retained exact source maps and report no drift. After forwarding the existing write intent and reusing the existing list verifier, `focused-green.json` passes all 25 cases across 2 suites. The 25 cases are not yet the caller regression, browser/native or publication closure.

## Current roadmap and ownership

Read current AGENTS/CLAUDE, ONE_DESIGN_PLAN and ledger, current D4 spec, one-AnA/one-canvas decision, design principles and coordination ledger at discovery. The project and its recorded objective start the core path: immutable data-room sources, protocol, deterministic evidence, AnA's sourced narrative, the one editor and filing. D3's active project-page layout and the CSR drafting-control lane remain with their owners. The founder's demo hold on moving Freeze/E-sign/filing into the inspector remains in force. These repairs change no layout or document-type UI.

Read-only handoffs for D3's owner: `Projects.tsx` returns on a confirmed scaffold-skipped project before recording its entered objective; catalogue source selection is resolved against the current page only in `ProjectHome.tsx`. They require owner review and retained source revalidation; no changes to those held files are made here.


## What already exists — gate integration

The first ten-gate run passes eight design/editor gates. Existing API attribution and lineage discovery fail on source outside the two core repairs. `ReviewThreads.tsx` already reopens real review threads/tasks, with both finite prefixes registered; its variable namespace confuses static URL collection. The biostat bridge's existing computation reproduction call is not attributed, while filing placements intentionally remain excluded. Complete literal attribution and the existing narrow launch reproof; no route/mount or surface is added, and this is not a new project-access policy for the bridge.

The lineage scanner flags three existing paths: CSR import already enforces author lineage inside its SERIALIZABLE callback; section review changes only review metadata and compares content in WHERE; charter objectives record sourced, versioned human JSON with their own audit. Independent review is establishing narrow discovery/registration repairs without blanket exemptions for actual prose. Runtime enforcement is preserved.


## Verified results before canonical synchronization

Receipts retain actual process exits, compressed raw output, hashes and before/after source maps. `pin.py` names static local inputs and direct SQL/config files; it is not a complete dynamic dependency manifest.

- Core policy/list RED: 4 failed/5 controls and 10 failed/6 controls. Focused GREEN: 25/25.
- Initial caller regression: 332 passed/28 failed across 360 cases, 20 suites. All failures belonged to two positive fixtures relying on the repaired behavior. Honest fixture calibration supplies actual edit grants and confirmed per-row project identities, strengthens use-only/revocation assertions, and passes 34/34. This replaces those suites, retaining 326 passing cases, for **360 cumulative cases**. The later same-file hook factor is covered by `final-client` (106/106 replacing the eight client suites); these are overlapping checks, not additional cases or one all-green 360-case invocation. `fixture-bridge.json` records the earlier two-fixture bridge.
- Narrow API attribution RED: 2 failed/205 controls, GREEN 207/207. Existing reopen behavior: 4/4. No broad namespace, mount or project-policy change.
- Lineage discovery/CSR transaction proof RED: initial 8 failed/29 controls; final expanded fixture 12 failed/37 controls. Final GREEN: 49/49, including all original five string/comment controls. Runtime writer implementations are unchanged.
- `gates-final`: all ten existing editor/design/API/lineage gates pass. `lint-combined`: 16 targets, zero errors and no warning growth; four CI files are ignored by the existing ESLint configuration (recorded in `lint-details.json`), so no lint coverage is claimed for them.
- Production build passed after runtime/API changes (`build.json`); later gate-only changes do not alter the browser bundle. Canonical synchronization can require fresh qualification.
- Native fresh provisioning: exit 0 through existing install-fresh/deploy-migrate, 40 governed SQL files. Failed/interrupted setup attempts are retained as failures or incomplete, never counted as passes. The private generated credentials remain outside Git.
- Running native-app browser check: eight cases passed at 1440/390, with screenshots and real own-project list positive plus six injected contradictory-response cases. No model/agency actions. Full readiness remains 503 solely for AnA `no_provider`.

Two independent read-only reviews found no material defect in the core repair, calibrated denial controls or frozen gate change. Adjacent lineage checks are recorded separately. [Open owner handoffs and limits](OPEN_ITEMS.md) remain explicit.

## Roadmap synchronization

Fetched canonical at `c44a21268` (44 commits ahead of discovery). The newly recorded P-104 Anna runtime extends existing packages with independent read-only workers and fixture-gated acceptance; it preserves the one editor, project-first spine and all current file holds. This F1 repair changes neither the plan nor its ledger and does not mark that epic accepted. Merge and final source/check publication receipts follow below when actually completed.
