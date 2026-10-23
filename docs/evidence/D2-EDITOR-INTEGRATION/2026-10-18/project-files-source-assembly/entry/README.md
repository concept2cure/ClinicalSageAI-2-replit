# Reach existing assembly from the Project files Vault lane

W1 / D2. Qualification resumed on 2026-10-20 at canonical source
`e1c63ae9b024ed0ecde835f61c07ecb589eab67d`. No production or test changes were
needed during this qualification. The existing pending adapter and launcher
fix are the bytes identified in the current receipts.

## What already exists

- `editor/SourceAssemblyDialog.tsx` and `useSourceAssemblyTarget.ts`: the shared
  action, explicit saved-document chooser and guarded read-only handoff.
- `editor/ProjectFilesPanel.tsx` and `ProjectFileActions.tsx`: the existing Vault
  browse/search rail and selected-file footer beside the document.
- `surfaces/Vault.tsx`: the full Vault's existing source-build adapter, now
  extracted to `editor/VaultSourceBuildAction.tsx` and reused by both callers.
- `editorTarget.ts`, `editor/authoringDraftTransport.ts` and the Workbench
  receiver: existing context ownership, exact target and navigation admission.
- `shared/authoring/assembly-sources.ts`: the existing namespace/checksum parser.

These paths are under `client/src/concept2cure/v2/` except the shared parser.
The [contract](../../../../../design/PROJECT_FILES_SOURCE_ASSEMBLY_2026-10-18.md)
connects these existing pieces; it introduces no editor, reader or source store.

## Current qualification

[Current tests](current-tests.json): **17/17 passed**, actual exit 0, Node
22.23.3, with all 15 direct/dependency pins unchanged before and after execution.
The actual panel, chooser, authentication service, shell project and target
channel run against synthetic HTTP. Cases cover local/external hosts, exact
`up-UUID` display row versus Vault `docId`, optional checksum, a later search
page without an invented checksum, excluded/malformed/missing identities, held
effective project and delayed project/account/source changes. Availability and
disabled-state round trips retire the old chooser; a fresh deliberate launch
can succeed. Source selection, chooser and handoff issue no authoring writes.

[Scoped lint](lint-summary.json): the four adapter/entry files and new
entry test have zero errors/warnings under the strict command. Full Vault has
zero errors and four warnings, matching `git show HEAD:.../Vault.tsx` supplied
through ESLint stdin. All three lint commands exit 0; six source/test pins stay
unchanged. No temporary TypeScript file or baseline change was used.
The exact commands, input/output hashes and raw outputs are retained in
[strict lint](current-lint-strict.json), [current Vault lint](current-vault-lint.json)
and [canonical Vault baseline lint](head-vault-lint.json).

The receipt wrapper's initial [pin-path correction](qualification-preflight.json)
records that canonical authentication moved from `authService.ts` to
`authService.tsx`. That preflight stopped before any test executed; no fixture
or product was changed to make the replay pass.

## Preserved interruption-era evidence

The [historical index](historical/index.json) archives eight original scratch
artifacts without changing their UTF-8 bytes: missing-action RED (two failed
cases), availability/disabled RED (two failed, two skipped), first green (four),
expanded green (17), the old five-file production freeze and lint artifacts.
Raw byte counts and SHA-256 values are verified. These precede the canonical
fast-forward and do not qualify the current integrated source.

The retained files do not contain their wrapper exit statuses. Those fields
remain null; their original test summaries and JSON-embedded lint statuses are
preserved rather than converted into inferred exit codes. Empty old lint stdout
is retained as empty output, without treating it as proof of a successful run.

## Limits

This packet qualifies entry/chooser ownership against synthetic HTTP. It does
not qualify current backend source admission, extraction/hash verification,
live provider consumption, scientific support, human acceptance, deployment or
filing readiness. Actual Workbench dirty/ceremony/build behavior and browser
geometry are qualified separately; counts across packets overlap.
