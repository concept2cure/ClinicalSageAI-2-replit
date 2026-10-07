# Anna biotech workflow depth — W2 Authoring / D4

Parent: `f91be02e1de837d827049615f1e4a69f486deba6`, canonical branch `concept2cure-v2`.
The user authorized continued improvements, direct push without a PR and GitHub CI for the whole-project TypeScript check after the local host exhausted memory. No gate, baseline, approval rule or branch rule was weakened.

## Delivered behavior

| Existing workflow | Enhancement | Scope limit |
| --- | --- | --- |
| Protocol authoring | One shared current M11 record drives named reference, project scaffold, existing DocumentOutline renderer and actual section drafting; 87 headings (14 level 1, 70 level 2, three front-matter rows). Missing deeper headings fail explicitly. Current registry authority separates protocol from SAP. | This encodes level 1/2 headings, not the full M11 technical exchange specification. Existing E6 projects need reviewed mapping; client scientific design and regional implementation remain unresolved. |
| Biotech client inquiry | Existing three-question preparation step selects lifecycle-specific questions for amendments, changes, advice/meetings, master files, pediatric/orphan, biosimilar, safety, periodic reports, commitments, quality studies, risk management and signals. | Questions are platform planning prompts. Discussion markers prevent repetition, never certify evidence. Country/source-version changes require revisiting affected questions. |
| IND safety reports | Registry, scaffold, lifecycle and actual drafting distinguish report subtypes and commercial status, correct route and reporting-clock guidance and avoid universal Module 5/MedWatch/follow-up assumptions. Numeric scaffold keys retained, document groups use module 0, conditional applicability remains unresolved. | No case classification, due-date computation, E2B construction, validation or transmission is added. |
| Registry readiness and manifests | Approval completion is separate from document presence; unknown/retired states cannot satisfy requirements; empty sections and missing IDs cannot complete the modeled content; inconsistent current records cannot pick approval by input order. A signature state alone is not approval. Source IDs for all current artifact records remain visible. | Structured inputs measure their supplied scope, not scientific adequacy, cryptographic validity or technical agency acceptance. Unknown artifact matrices and applicability remain explicitly unassessed. |
| Anna package tool | Project mode ignores model-supplied project IDs/status arrays; resolves the active live tenant-owned program and reads its existing canonical lifecycle projection. Only saved exact filing placements satisfy section rows. Wrong-meaning, missing, unbound or stale-bound saved signatures remain review progress. Hypothetical scenarios are explicit and cannot certify a client package. Errors are not empty success. | The projection does not inventory unlinked working documents or every source store. Both tool modes keep packageComplete false; filing readiness is unassessed. Larger inventories go to the governed Submission Center. No new document store, tool, engine, dependency or surface is introduced. |

## Evidence

- `final-integrated.txt`: **572 passing tests in 23 files**, including current protocol, exact registry coverage, lifecycle/resolver fingerprint contract, actual Anna handler, scope boundaries, region-specific drafting, readiness, bootstrap, E3 overlay and five database-backed inventory/tenant cases plus signature cases. Tests cover real PGlite SQL and the existing canonical store, not a mock claiming a successful DB read.
- `final-lint.txt`: zero errors across all changed source/test files; existing warnings retained. The pre-push warning delta check records whether any new warnings were introduced.
- `build-server.txt`: server bundle passed. No client implementation was changed in this tranche.
- `canvas-path.txt`: existing project → Anna canvas → workbench → Vault path remains wired.
- `coverage.json`: outline availability only, all active biotech registry entries and the requested markets/shared global entries. This is not a qualified-filing count.
- `protocol-*` and `inquiry-*`: primary-source checks and fail-before/pass-after evidence. Exactly two IND-safety resolver hashes were updated after the semantic correction; no fixture gate was suppressed.
- `submission-status-red.txt`: 13 reproduced approval/presence failures; `submission-tool-red.txt`: five reproduced model-status/project-scope failures; `submission-review-red.txt`: four further reproduced malformed-input/signature failures. The final integrated run supersedes earlier intermediate green logs.

Official protocol and safety sources are recorded with URLs and checked dates in `protocol-review.md`, `protocol-ind-safety-review.md` and `inquiry-report.md`. The protocol and IND safety route have one heading/fact owner, respectively; their consumers project that owner.

## Release and qualification status

Source validation and direct-push evidence will be recorded against the published commit. Full-project TypeScript uses the previously authorized GitHub gate; no local full-project TypeScript run is attempted on this memory-limited host.

This tranche advances deterministic authoring, inquiry and honest assessment behavior. D4's complete client workflow/model/SME qualification remains open: representative client source-linked document builds, approved high-risk model PQ, accountable scientific/regulatory review, dataset and message validation, package conformance and transmission checks are separate required evidence. Indexed headings or passing unit tests cannot establish those results.
