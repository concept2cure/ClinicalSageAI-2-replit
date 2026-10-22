# Existing-editor assembly controller

W1 / D2. The five new production files implement one disclosure and one
ref-backed preview/build/run lane for the exact open document. DocumentWorkbench
and the existing AnA draft review remain the host and the only editor/review.
No CSS, dependency, provider configuration or client document store was added.

The roster loads when the disclosure opens. Selecting a template makes a
read-only whole-document preview to obtain its canonical row choices. An
explicit preview of the chosen document or exact section precedes the
structural commit. Runtime receipts require the exact document, project,
template, selection, fingerprint, section identities, codes, titles, text and
ordering. A malformed affirmative receipt holds the build as unknown.

Without AnA, the controller makes no generation or acceptance request. With
AnA, the saved, empty, explicitly eligible sections are checked and prepared
sequentially through the existing generation transport. The template supplies
the drafting region; unknown regions stop preparation. More than 20 pending
sections refuses the batch, and an exact section selection offers a reachable
single-candidate retry. Stop retains a successful current request and starts
no later one. Retry skips completed candidates. No candidate is automatically
accepted, and saved nonempty text is preserved.
Each slot retains its matching canonical template guidance and limitations as
bounded, fenced JSON reference context. It is explicitly labelled as reference
data, not instructions or project evidence, and never claims scientific source
support. Typed author requirements are sent separately. The snapshot remains
with its slot when a later build uses another template; truncation is recorded.

Controlled review sessions retain the full candidate, edited buffer, stated
reason, refusal and unknown-acceptance state by exact section. A deliberate
Review checks the exact saved parent and section before refreshing ownership
admission, including after a project or session change; the host then uses its
existing dirty leave guard. Acceptance still verifies the candidate's saved
base and authority on the server. Review editing remains available while a
later candidate is being generated.
The controlled session also survives an explicit discard, so a later Generate
in that same panel remains attached to its exact queue section.

Dirty or stale completions cannot refresh the host or start later generation.
An exact confirmed late structure receipt is retained for explicit resumption.
An uncertain commit remains held until an explicit scoped parent/detail/section
check, which performs no write and cannot prove which request created matching
content. A later preview and structural write remain deliberate choices.

## Verification

`controller-green.json` records 12 passing direct hook/validator cases: no-AnA behavior,
synchronous duplicate protection, unknown recovery, sequential candidate
retention, stop, bounded retry, edited-review retention, incorrect affirmative
receipt, dirty late completion, project-round-trip review admission and the
over-20 remedy. The final validator regression also confirms semantic trim/case
selection matching while preserving exact saved code identity in commit
receipts. A generation-request assertion verifies the fenced reference context
and separate user requirements. These are synthetic HTTP cases, with the real hook and shared
transport; they make no live-provider or regulatory-readiness claim.

`lint-green.json` records strict ESLint with zero errors and warnings for the
five new production files and their test. `source-pins.json` identifies the
verified source bytes. The parent workstream records compiler/build, actual
Workbench integration, server transaction and browser evidence separately.

`initial-absence-red.json` honestly records a missing-module collection failure,
not behavioral test failures. Two intermediate candidate receipts are retained
with their fixture-correction qualifications. JSON preserves original log text
and hashes without trimming terminal output.
`normalized-selection-red.json` is the actual failing validator case before
the final selection correction; the earlier 10-case green receipt and pins
remain preserved separately. This final correction did not change UI bytes.
`template-reference-red.json` records the omitted context before its correction;
the earlier 11-case green and source pins remain preserved separately too.

Reproduce from the repository root with Node 22:

```sh
NODE_OPTIONS=--max-old-space-size=4096 ./node_modules/.bin/vitest run client/src/concept2cure/v2/editor/__tests__/authoringAssemblyBuild.test.tsx
./node_modules/.bin/eslint client/src/concept2cure/v2/editor/AuthoringAssemblyBuild.tsx client/src/concept2cure/v2/editor/useAuthoringAssemblyBuild.ts client/src/concept2cure/v2/editor/assemblyBuildState.ts client/src/concept2cure/v2/editor/assemblyBuildTransport.ts client/src/concept2cure/v2/editor/assemblyDraftQueue.ts client/src/concept2cure/v2/editor/__tests__/authoringAssemblyBuild.test.tsx
```

Recovery and retained review state belong to this mounted component. They do
not promise durable workflow recovery or idempotency across reloads, remounts
or tabs. Human review, live provider behavior and production deployment remain
outside these synthetic checks.
