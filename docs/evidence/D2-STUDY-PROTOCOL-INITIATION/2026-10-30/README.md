# D2 — project initiation reaches study and protocol design

## What already exists

| Existing owner | What it does / current limit |
| --- | --- |
| `shared/regulatory/app-registry.ts`, `workspace-derivation.ts` | Existing `study_protocol_design` identity maps to `protocol-dev`; configuration is not permission. |
| `client/src/concept2cure/v2/surfaces/ProjectPlan.tsx`, `ProjectHome.tsx` | Existing verified project context, filing Plan and Author protocol door; the Plan entry was missing. |
| `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx`, `ProtocolDevSelection.tsx`, `ProtocolDevWorkspace.tsx`, `ProtocolDevDesign.tsx` | Existing project-scoped protocol start, study design/binding, statistics, assessments, deterministic checks and review; not separate apps. |
| `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx`, `editor/RichSectionEditor.tsx` | Existing protocol adapter uses the shared editor; protocol and authoring stores are not live-synchronized. |
| `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`, `DocumentWorkbench.tsx`, `SourceImportDialog.tsx`, `editorTarget.ts` | Existing canvas/editor and governed saved-working-copy handoff; no extra canvas or editor. |
| `server/services/authoring/authoring-draft-tool.ts`, `authoring-from-draft.ts` | Existing AnA saved-document generation for the canonical canvas; no new generator. |
| `shared/constants/launch-scope.ts`, `server/services/cmc/composition-scope.ts` | Existing admission, access and CMC composition restrictions remain unchanged. |

The detailed survey and bounded deleted-history search are in
`docs/design/STUDY_PROTOCOL_PROJECT_INITIATION.md`. No owner is rebuilt or removed.

## Delivered change

Plan's selector reaches the existing services only after the matching project
record is read. One combined Study & Protocol Design choice opens `protocol-dev`;
other choices follow current availability, including CMC's small-molecule US IND
boundary. Changing the project requires selecting work again. Selecting work
creates no record, and cannot revive an unavailable selection.

The existing protocol selection bar explains the study/protocol sequence and
shared canvas/editor. No surface, rail item, backend, store, generator, canvas,
editor, commercial grant or launch admission was added.

## Verification

- `red.log.gz`: before implementation, Plan's missing entry fails; the new component
  import fails. Twenty existing/guard Plan tests pass.
- `green.log.gz`: six suites, 67 tests pass: core selection, Plan integration,
  protocol study design, project launch scope, shared protocol editor, CRF handoff.
- `copy-styles.log.gz`: three suites, 40 tests pass (includes 10 core-selection
  tests already counted above), covering established copy and stylesheet ownership.
- `build.log.gz`: production Vite and server builds pass; existing chunk-size warning.
- Canvas-path gate and self-test pass, including deliberate broken-link failures.
- `desktop.png`, `mobile.png`: Chromium renders of the real component's server
  markup with production styles, at 1100px and 390px. Both have zero horizontal
  overflow. This is isolated layout verification, not an authenticated live app walk.
- `typecheck.log.gz`: whole-repository canonical typecheck passes with zero errors.
- Focused ESLint on all six changed TypeScript files passes with no findings.
- Required pre-push checks run before source publication.

Used Node 22.23.4 to match the repository's Node 22 requirement. This is engineering
evidence only; it does not assert live provider qualification or formal OQ.
