# Reach existing assembly from Project files

W1 / D2; `concept2cure-v2`. Work began at `3cae08d23` on 2026-10-18 and was
interrupted before final qualification or publication. Resumed 2026-10-20 after
fetching and reviewing canonical `e1c63ae9b`, then carrying forward the bounded
adapter extraction without replacing the incoming Vault search consolidation.
The [contract](../../../../design/PROJECT_FILES_SOURCE_ASSEMBLY_2026-10-18.md)
records this existing capability's integration boundary.

## What already exists

The full Vault details pane already offers **Build in editor** through
`SourceAssemblyAction` / `SourceAssemblyDialog` and `useSourceAssemblyTarget`.
The Project files rail already reads the same Vault through `ProjectFilesPanel`
and provides file actions through `ProjectFileActions`, but its selected Vault
upload footer lacked this assembly entry. Data Room and ProjectHome already
reach the shared chooser.

`editorTarget`, `assemblySourceIntent`, `DocumentWorkbench` and
`useAuthoringAssemblyBuild` remain the sole target/navigation/build path.
`shared/authoring/assembly-sources.ts` and the existing authoring source resolver
remain authoritative for exact identity, current access, version, readable text
and disposition. The full-Vault search guard remains in `VaultLibraryResults`.
The extracted `VaultSourceBuildAction` shares the existing upload adapter between
the full Vault and rail; it does not add an editor, reader, provider or surface.
Client paths are under `client/src/concept2cure/v2/` (`editor/` or `surfaces/`).
Current source-assembly/build name searches across client, routes, authoring
services and shared contracts, plus deleted-file history for ProjectFile,
SourceAssembly and VaultSourceBuild, found no competing rail implementation.
The browser packet reuses the sibling saved-source fixture host, with a scoped
mock binding; the retained historical host itself stays unchanged.

## Qualification

- [Catch-up review](release/catch-up.json): current rules and source searches,
  deleted-file history, the canonical fast-forward and retained Vault search
  consolidation. The existing rail gap was confirmed before carrying it forward.
- [Entry checks](entry/README.md): 17/17 current cases, exact UUID versus display
  row ID, optional search checksum, retained data, excluded versions, scoped
  handoff and availability/disabled round trips. Strict source/test lint is
  clean; the full Vault retains its four canonical warnings.
- [Independent editor checks](independent/README.md): 9/9 actual Workbench flows,
  both explicit build modes, fresh source manifests, dirty Stay/Leave, ceremony,
  held project, stale reads and later search results. No automatic acceptance.
- [Browser](browser/README.md): 6/6 cases, 31 stages and 25 screenshots across a
  bounded desktop/touch, light/dark and mode subset plus read-only and excluded
  source cases. Exact selector/manifest transport and existing prose are retained;
  no console/page/unexpected-request/navigation errors occurred. Root inspected
  the touch source footer and desktop dark chooser against the existing styles.
- [Combined replay](release/integration.json): 228/228 across 17 suites, including
  the existing import, citation, saved-source, assembly and backend source checks.
- [Official compiler](release/typecheck.json): zero errors, unchanged zero
  baseline. [Production build](release/build.json) and all
  [nine editor/design/security gates](release/static-gates.json) passed.
- [Warning comparison](release/warning-ratchet.json): no per-file count changed
  across the 12 lintable product, test and retained browser fixture files.

The [root checks index](release/checks.json) binds the current qualification to
the exact source bytes and states its limits.

Counts overlap and must not be summed. Current receipts record exact commands,
actual exits and source pins. Historical missing-action/eligibility failures and
candidate output remain separate, with original bytes and unknown exit statuses
kept unknown. A fixture-only lint correction and the preliminary one-case browser
diagnostic are retained; neither is substituted for the final six-case result.

No source reader, schema, dependency, stylesheet, provider, editor target channel
or native editor implementation was added or replaced. Direct publication uses
the normal commit/push gates.

The [first push was refused](release/first-push-rejected.json) because this
packet copied an existing browser host. The fixture now imports that retained
host and binds this packet's mock explicitly. The
[duplicate-code gate passes](release/fixture-reuse-repo-health.json) with zero
duplicate groups and no baseline change. Earlier captures and the
[first qualification index](release/first-qualification-checks.json) are retained
separately. The six affected browser cases pass again with 43 product hashes
and seven fixture dependency hashes unchanged. The compiler/build/228-test
receipts retain the same 55 source/configuration bytes; those broad checks were
not repeated for the fixture-only change.

The [Codespaces guide](../../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md)
includes the rail handoff and live eligibility checks. Its 39 human cases remain
**Not run**. Browser HTTP/provider fixtures and automated editor tests do not
establish live model consumption, scientific correctness, regulatory readiness,
native PostgreSQL concurrency/RLS, full-shell human acceptance or deployment.
