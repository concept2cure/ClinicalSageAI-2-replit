# Project files source assembly browser qualification

The [definitive summary](final/summary.json), [execution receipt](final-run.json)
and [rollup](rollup.json) record **6/6 passing cases**, 31 measured stages and
25 screenshots on 2026-10-20. The execution base was `e1c63ae9b`, including the
pending Project files adapter changes identified by exact SHA-256 pins. All 43
production pins and all six fixture pins stayed unchanged during capture.

## What already exists

The fixture mounts the existing `DocumentWorkbench`, native rich editor,
`ProjectFilesPanel`, selected-file footer, `SourceAssemblyDialog`, editor target
receiver and assembly controller. The same source chooser already serves the
full Vault and Data Room. The current increment shares the existing Vault upload
adapter with the Project files footer. Existing product styles and tokens render
the rail, chooser, disclosures, notices and draft review panel; this packet adds
no product surface or stylesheet. Client paths are under
`client/src/concept2cure/v2/` (`editor/` and `surfaces/`). The parent
[contract](../../../../../design/PROJECT_FILES_SOURCE_ASSEMBLY_2026-10-18.md)
records the complete inventory and existing-capability searches.

## Definitive cases

| Viewport / theme | Mode or guard | Result |
| --- | --- | --- |
| Desktop 1440 × 1000, light | Without AnA | Pass |
| Desktop 1440 × 1000, dark | With AnA | Pass |
| Touch 390 × 844, light | With AnA | Pass |
| Touch 390 × 844, dark | Without AnA | Pass |
| Touch 390 × 844, light | Read-only working target | Pass |
| Touch 390 × 844, dark | Withdrawn, superseded and earlier source versions | Pass |

The four primary cases cover both modes across desktop and touch, light and
dark. They are a bounded subset, not the full eight-case mode/theme/size matrix.

Each admitted case opens **Project files → Vault**, selects the actual upload
row and reaches **Build in editor** in its existing footer. The row's display ID
is `up-<UUID>`; the chooser receives the exact Vault document UUID and supplied
checksum, without substituting the display ID or a same-byte Data Room identity.
The synthetic source retains readable data with unavailable original bytes.
Assembly stays available while **Work on document** is disabled.

The shared chooser performs exactly two project-scoped document-list GETs for
each admitted handoff: an initial read and a fresh target check. Opening the rail,
selecting a file, opening the chooser and accepting its local target execute no
authoring mutation, preview or generation. The existing editor receives the
selection and opens its build disclosure without external navigation. The user
then chooses a template and explicitly previews/builds. Template selection uses
the controller's existing preview behavior; this is separate from the zero-work
handoff assertions.

Without AnA, the user builds one missing section and then the remaining document
structure. Existing saved text, original section identity and order are preserved;
new scientific text remains empty. With AnA, the same fresh manifest reaches two
sequential candidate requests. Review switching preserves the edited first body
and reason. Only explicit acceptance saves that exact first candidate; the other
candidate stays unaccepted and the original prose remains unchanged.

Across the six cases there are **10 previews, six commits, four candidate
generations and two explicit acceptances**. All 16 preview/commit requests carry
the exact Vault selector and checksum. All four candidate requests carry the
fresh synthetic manifest. Presence POST/PUT traffic from the existing
collaboration controls is allowed; zero-write assertions refer to authoring
actions. There are zero console errors, page errors, unexpected HTTP endpoints
or external navigation callbacks.

The read-only working target may inspect and select a source through the same
chooser, but its current edit refusal disables template, preview, build and AnA
controls. It executes zero authoring mutations. Each excluded source case shows
the existing visible refusal and a disabled build action, with no chooser or
authoring mutation. These exercise reported access and availability flags in the
synthetic responses; they do not qualify backend authorization.

## Visual and reachability checks

All measured page, rail/footer, chooser, assembly and review controls fit
horizontally at the tested widths. Every measured editor stage retains one
native editor and keeps assembly outside the toolbar scroller. The
`*-rail-action-reachability.json` receipts assert the footer action is naturally
visible or reachable using real wheel input over the existing right rail; they
do not programmatically scroll to that action. Chooser measurements assert its
existing Open action is visible within the viewport.

Direct inspection includes [touch light selected source](final/touch-light-ana-selected-vault-source.png),
[desktop dark chooser](final/desktop-dark-ana-source-target-dialog.png),
[touch dark deterministic result](final/touch-dark-deterministic-deterministic-built.png)
and [read-only target](final/touch-light-read-only-read-only-build-disabled.png).
Long identity/hash wrapping uses the existing product styles. These receipts do
not establish an accessibility audit or simultaneous visibility of every field.

## Historical and preparation receipts

- The [original missing-action RED](initial-entry-red/receipt.json) and
  [screenshot](initial-entry-red/selected-vault-before-build-entry.png) are retained
  unchanged from the interrupted 2026-10-18 work. The actual selected Vault footer
  had no Build action; the recorded production source stayed frozen. Its
  [fixture pins](initial-entry-red/fixture-pins.json) describe that earlier fixture,
  which changed during preparation. They are not final-capture pins.
- [Initial fixture lint](initial-fixture-lint.json) returned exit 1 because five
  browser globals in the Node runner lacked `window.` qualification. That
  fixture-only correction left production unchanged.
- The [resumed diagnostic](diagnostic-run.json) passed one touch-light
  deterministic case before the final runner's lint/pin additions. Its exact
  diagnostic source/fixture pins remain in [its summary](diagnostic/summary.json).
  It is not substituted for the definitive six-case run.
- [Final fixture validation](fixture-validation.json) records zero ESLint errors
  and warnings across all five executable fixtures, plus four passing Node 22
  syntax checks. No lint baseline or dependency was changed.

## Reproduction and cleanup

From the repository root, using the existing Node 22 toolchain and installed
Chromium/Playwright Core, start the loopback fixture in one terminal:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/project-files-source-assembly/browser/server.mjs
```

Run the existing qualification runner in another terminal:

```sh
PATH=/workspace/scratch/editor-toolchain/node_modules/.bin:$PATH node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-18/project-files-source-assembly/browser/browser.mjs
```

The server uses `127.0.0.1:5192` with watching disabled; restart after source or
fixture changes. `--diagnostic` runs only one touch-light deterministic case.
Runners overwrite their respective output directories, so preserve prior proof
before replay. `baseline-entry.mjs` expresses the historical missing-action
assertion and now passes when the implemented entry exists.

[Cleanup](cleanup.json) verifies that the owned server PID is absent, loopback
port 5192 refuses connections, and production/fixture hashes still match the
definitive capture. The owned server was stopped with SIGTERM after testing.

## Limits

The fixture mounts the editor directly. Auth, HTTP, saved source/extraction data,
provider output and access/availability responses are synthetic. The full app
shell, real Vault surface, Data Room intake, later-page search, context/eligibility
ABA races, backend audit/access/source validation and live providers are outside
this browser packet. Separate entry/controller/backend evidence addresses those
contracts. Request parity proves the UI's exact selector/manifest transport, not
real model consumption, citation support, scientific correctness, filing
suitability, regulatory readiness, native PostgreSQL concurrency/RLS, human
acceptance, deployment or agency transmission.
