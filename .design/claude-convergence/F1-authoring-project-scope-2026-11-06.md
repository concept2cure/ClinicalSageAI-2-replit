# F1 — complete project authority in the existing editor

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

Implementation and local checks complete; canonical synchronization and hooked publication are pending. Evidence README records actual RED/GREEN, native/browser checks and limitations. Historical Oct30 results do not qualify this source.


## Observed RED and focused GREEN

`backend-red.json` reproduces 4 failing project-policy cases with 5 passing controls. `editor-red.json` reproduces 10 failing contradictory-response cases with 6 controls. Both retained exact source maps and report no drift. After forwarding the existing write intent and reusing the existing list verifier, `focused-green.json` passes all 25 cases across 2 suites. The 25 cases are not yet the caller regression, browser/native or publication closure.

## Current roadmap and ownership

Read current AGENTS/CLAUDE, ONE_DESIGN_PLAN and ledger, current D4 spec, one-AnA/one-canvas decision, design principles and coordination ledger at discovery. The project and its recorded objective start the core path: immutable data-room sources, protocol, deterministic evidence, AnA's sourced narrative, the one editor and filing. D3's active project-page layout and the CSR drafting-control lane remain with their owners. The founder's demo hold on moving Freeze/E-sign/filing into the inspector remains in force. These repairs change no layout or document-type UI.

Read-only handoffs for D3's owner: `Projects.tsx` returns on a confirmed scaffold-skipped project before recording its entered objective; catalogue source selection is resolved against the current page only in `ProjectHome.tsx`. They require owner review and retained source revalidation; no changes to those held files are made here.

## Final local review

Core regressions qualify 360 cumulative cases through the explicit fixture/client overlays; API 207 and reopen 4 are separate. Final lineage 49/49, ten gates, lint without warning growth and production build pass. Eight native-app browser cases pass at 1440/390. AnA has no configured provider, so full readiness/CSR acceptance is not claimed. D3 and D4 handoffs, failed setup attempts and bounded proof limits are retained in the evidence README and OPEN_ITEMS. Canonical has advanced to P-104; merge and qualification remain required before publication.

The merged source is now freshly qualified by 571 Vitest cases/22 suites in one invocation, 119 Node cases, ten integration gates, production build and eight native-app browser cases. Source publication remains pending; P-104 acceptance and the owner handoffs remain open.
