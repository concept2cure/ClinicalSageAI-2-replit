# Existing project commands and CRO company-type labels

Launch row D2, A2.10, 2026-10-26. Companion audit:
`.design/client-journey/A2_10_REMAINING_PARITY_REVIEW.md`.

## What already exists

The phase-2 command metadata and command-executor registry already dispatch
`evidence_sufficiency.assess` and `reviewer_simulation.run` to their established
governed handlers. `ana-launch-scope.inventory.json::commands.inScope` already
classifies both independently of any portfolio surface. Its historical note
still associates them with device-workstream. Clarify the existing metadata and
current project-home placement, with no new execution, scope grant or handler
body change. Tests must pin the same dispatch targets and continued in-scope
classification with device-workstream removed from the supplied launch set.

`v2/surfaces/CroPortfolio.tsx::CRO_TYPE` already labels company types but knows
only biotech, pharma and medtech. The same screen's form and `/api/cro/clients`
store use medical_device and diagnostic; unrecognized values currently display
Biotech. Correct the existing map to label those recorded values and display an
unknown recorded type as itself (missing type as Not recorded). This changes
neither the client key, store, API nor onboarding/admission. The CRO fold stays
open because cro_clients engagement data is not a client_workspaces record.

## Red-first checks

`/tmp/a210-commands-red.log`: two current-scope/dispatch checks pass and two
metadata checks fail because neither command describes its selected project.
The implementation then changes only those two descriptions and the inventory
note; existing command behavior remains subject to its ownership, confirmation,
input-source and audit regressions.

The CRO guard failed eight cases on the original source (two existing values
already passed), then all ten cases pass after correcting the existing map and
removing its Biotech fallback. Both roster and selected detail are checked for
medical_device, diagnostic, medtech, biotech, pharma, an unknown recorded type,
two prototype-property names, blank and null. Missing values read Not recorded;
unknown recorded values retain their text with a neutral tone. No writer runs.

## Results

| Focused batch | Result |
| --- | --- |
| Scope/registry, phase-2 handlers, agent audit contract/outcome, model-input exclusion, programme ownership, CTD organization scope | 83 passed, 7 suites, 20.54 seconds |
| CRO company-type behavior, content guards, context PII exclusion and held action handling | 17 passed, 4 suites, 5.65 seconds |

`commands-source-proof.json` proves exactly two metadata-description edits,
unchanged executable inventory arrays and six unchanged guard/dispatch/service
files. Neither handler body changed. Ownership/confirmation/audit cases qualify
the existing behavior; they do not establish new accepted-program/PM-anchor
checks or native PostgreSQL validation.

Raw logs: `/tmp/a210-commands-red.log`, `/tmp/a210-commands-green.log`,
`/tmp/a210-cro-label-red.log`, `/tmp/a210-cro-label-green.log`; safe gzip copies
are alongside this evidence. No native execution, production inventory or
completed CRO/device shell retirement is claimed here.

Scoped ESLint returns zero errors. Both changed implementation files retain
the exact baseline rule counts (nine existing warnings total); changed/new test
files have no lint diagnostics. `extra-lint-summary.json` records the source
comparison. `git diff --check` passes. Full publication gates remain the lead
session's responsibility.
