# Reach study and protocol design from project initiation

2026-10-30. Launch row D2, project journey. User direction: one Study & Protocol
Design selection inside the project alongside CMC, RBM and Biostatistics; all
use cases share one canvas, one document generator and one editor.

## What already exists

- `shared/regulatory/app-registry.ts`: `study_protocol_design` already names the
  combined capability and maps it to `protocol-dev`. No second identity is needed.
- `shared/regulatory/workspace-derivation.ts`: selects that capability for
  clinical work; this configuration projection is not an authorization grant.
- `client/src/concept2cure/v2/surfaces/ProjectPlan.tsx`: the project initiation
  step, filing deliverables and CMC phase doors. No core-work selector yet.
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`: verified project context,
  availability checks and an Author-only protocol door. Preserve that door.
- `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx`, `ProtocolDevSelection.tsx`,
  `ProtocolDevWorkspace.tsx`, `ProtocolDevDesign.tsx`: project-scoped protocol
  selection/start, study creation/binding, design checks, statistics, assessments,
  registers and review already share one workspace. Entry does not explain this.
- `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx`: already mounts
  `editor/RichSectionEditor.tsx`; no protocol-specific editor is needed.
- `client/src/concept2cure/v2/editor/DocumentCanvas.tsx`, `DocumentWorkbench.tsx`,
  `SourceImportDialog.tsx`, `editorTarget.ts`: the existing canvas, shared editor
  and provenance-preserving saved-working-copy handoff. Protocol imports are
  explicit working copies, not a claim of live synchronization between stores.
- `server/services/authoring/authoring-draft-tool.ts`, `authoring-from-draft.ts`:
  existing AnA generation saves the authoring document used by the canvas/editor.
- `shared/constants/launch-scope.ts`: protocol-dev is an Authoring child; RBM
  and Biostatistics are not currently launch-admitted. No admission changes here.
- `server/services/cmc/composition-scope.ts`: CMC composition remains restricted
  to recorded small-molecule US INDs.

Searches covered study/protocol design, project initiation, routes, services,
schemas, AnA generation and canvas/editor owners. Deleted-path search:
`git log --all --diff-filter=D -- 'client/**/*Protocol*' 'client/**/*Study*'
'client/**/*Canvas*' 'client/**/*Editor*'`. The checkout has bounded history;
an empty search is not evidence that an earlier owner never existed. No owner
is replaced or removed.

## Implementation boundary

Extend Plan with a core-work selector, reusing the combined registry identity.
Selecting a choice opens its existing project-context destination. Offer only
available destinations, preserve the CMC composition boundary, and offer nothing
until the project read is verified. Selection itself creates no record.

Explain the existing combined study/protocol sequence at its current entry:
start/select protocol, define/bind study design, write/check, review. All actions
continue to use existing controls, governed APIs and shared generation/editor
contracts. Do not add a surface, rail entry, store, generator, canvas or editor.

Evidence: `docs/evidence/D2-STUDY-PROTOCOL-INITIATION/2026-10-30/README.md`.
