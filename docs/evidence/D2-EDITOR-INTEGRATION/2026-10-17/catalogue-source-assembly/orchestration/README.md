# Selected sources in the one editor build workflow

W1 / D2; source `ff5e065a7`. The existing Workbench, assembly controller,
sequential queue and AnA review remain the only authoring implementation.
No provider call, dependency, CSS, alternate editor or source-prose client
store was added.

The receiver accepts the validated, exact-document source intent in full and
embedded hosts. It captures account/session, organization, project visit and
receiver ownership before later work. Sources bind only after the exact
document navigation passes the existing unsaved-work and ceremony guards.
The default or an unrelated document never inherits them. A different target
in a pinned canvas uses the existing guarded external-document handoff, with
the exact source intent preserved for the full editor; the sender suppresses
its own synchronous event to prevent a navigation loop.

An accepted intent opens the existing build disclosure and permits a roster
GET. It does not preview, write or generate. Preview and commit send the exact
ordered selectors. Runtime decoding requires the text-free manifest's exact
project, selector order, expected versions, valid identities and bounded
UTF-16 excerpts. Commit also requires the exact previewed manifest and the
existing complete structural receipt. Without AnA, only stored template
content is assembled, with explicit source references; source prose is not
promoted into authored science.

Every queue slot retains its manifest. Both automatic preparation and manual
Generate/Regenerate in the same controlled review send that exact receipt.
Malformed receipts refuse rather than dropping selected sources or widening
retrieval. Source changes invalidate previews and asynchronous ownership.
Earlier candidates, edited text, reasons and unknown accept outcomes remain
held under their original selection. Returning to that exact selection still
requires deliberate review admission. A source change closes the active
review; a bound selection without a matching candidate cannot open the plain
draft action and silently fall back to project retrieval.

Unknown structural outcomes stay held in the existing document bucket across
selection changes. A fresh known-parent check performs no write or automatic
retry. The source disclosure presents saved titles, kinds, versions, original
and extraction hashes, excerpt bounds, availability/disposition and limits;
it explicitly distinguishes reference intent from scientific support,
citations, model consumption, approval and full-file review.

## Verification

`controller-red.json` preserves two actual initial missing-capability failures.
`orchestration-green.json` records **60 passing cases in four files**, including
12 selected-source controller/receipt cases plus the prior assembly and actual
Workbench creation/build regressions. The new cases cover deterministic and
AnA parity, invalid/partial/reordered/oversized manifests, changed commit
identity, retained review text, source-change suppression and unknown-write
holds. HTTP responses are synthetic. Server SQL/authorization, independent
actual source-dialog flows and browser checks belong to their separate
workstream evidence.

`strict-lint-green.json` records zero errors and warnings for the owned small
files. `workbench-lint-comparison.json` records zero errors and **13 existing
warnings before and after**. The extracted LeaveTarget/admission/current-target
helpers retain the same navigation decisions while keeping warning counts
unchanged. `source-pins.json` identifies the final tested source bytes.

Reproduce with Node 22 from the repository root:

```sh
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run client/src/concept2cure/v2/editor/__tests__/authoringAssemblySources.test.tsx client/src/concept2cure/v2/editor/__tests__/authoringAssemblyBuild.test.tsx client/src/concept2cure/v2/editor/__tests__/workbenchCreationContext.test.tsx client/src/concept2cure/v2/editor/__tests__/workbenchAssemblyBuild.test.tsx
```

These checks do not establish live-provider behavior, human review,
regulatory readiness or deployment. Controller recovery and retained review
remain component-owned; they do not promise persistence across reloads,
remounts or tabs. Root records compiler/build, UI gates and direct canonical
publication separately.
