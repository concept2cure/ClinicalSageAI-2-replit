# W3 / D4 — Intelligent Awareness of assessment integrity

Anna's existing evidence tools now distinguish an actual structural assessment
from malformed inputs, unavailable evidence and a lack of comparable claims.
This advances D4 runtime evidence; D4 and commercial launch remain open.

Canonical base: `3ba0b56a2980e5836b07b0d49dbf5acd766d050c`. No new tool, surface,
model, dependency, integration, migration or governed write path.

## Defects reproduced before fixes

The registered handlers normalized unavailable claims/evidence into empty
arrays and ignored invalid numerical tolerances. The gap detector could throw
on malformed criterion shapes, silently ignore unsupported fields, drop null
evidence rows, or accept coverage from a partial input. Empty contradiction
findings did not distinguish an actual comparison from no comparable pairs.

`red-tests.txt`: **21 failures / 4 passes** at the actual registered-handler
boundary before the production fixes. The retained tests expose these cases;
additional regressions cover missing required fields, non-finite tolerance,
valid empty searches and explicit zero tolerance.

## Resulting behavior and reachable paths

- `server/services/ana/AnaToolExecutor.ts` passes the original supplied fields
  to the two existing canonical detectors. No conversion of unavailable data
  into an empty search result or silent replacement of an invalid tolerance.
- `evidence-gap-detector.ts` validates the query object, supported coverage
  criteria, criterion shapes, evidence array and supplied metadata types.
  Invalid input returns `assessed: false`, `complete: false`, no gap verdict,
  zero assessed evidence items and field-specific `inputIssues`. A valid empty
  search can still be assessed and report a metadata coverage gap.
- `evidence-contradiction-detector.ts` validates all supplied claims and the
  optional finite non-negative tolerance. An invalid row rejects assessment of
  the submitted set, rather than silently reducing it. Valid reports expose
  `comparedPairs` and `assessed`: an empty findings list with no comparable
  pairs is unassessed. Numeric comparison still requires matching endpoints
  and case-sensitive units; polarity comparison remains structural. Legacy
  comparisons with both units unspecified remain preliminary with a warning.
- Reports retain concrete repair instructions: use available source context
  to correct tool inputs and retry before asking the client to repeat known
  facts. Diagnostic messages name fields rather than echoing their values.
- `AnaToolDefinitions.ts` tells the model to read assessment status, counts,
  input issues and notes before synthesizing or asking consequential questions.

These replace the silent normalization and partial-input rules on the same
registered tool paths. Reachability is exercised by
`evidence-judgment-tools.test.ts`; detector tests cover fail-closed selection.
The real HTTP streaming route, using a controlled tool handler and scripted
model, retains the unassessed result and repair guidance in the next gateway
request (`stream-context-awareness.test.ts`). No live answer is implied.

## Validation

- Focused suites: **99 passing tests / 4 suites**.
- Broader regression: **437 passing tests / 39 suites**, including all AnA RI
  route tests, shared/submission IA, conversation bounds, caller/thread access,
  error containment, both evidence detectors and registered tool boundaries.
- **All 26 repository guards passed**; changed-file publication import/error/
  warning checks are recorded in `publication-checks.json`.
- Targeted ESLint: zero errors; existing warning counts are preserved. There
  are no detector/test warnings. The two large registry files retain their
  existing warnings; no baseline was increased.
- Isolated strict detector TypeScript check passed with no diagnostics:
  `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022
  --module NodeNext --moduleResolution NodeNext --skipLibCheck --types node`
  with the two canonical detector files as explicit inputs.
- `git diff --check` passed. Full local repository TypeScript remains deferred
  to GitHub under the previously authorized workspace-memory exception.

## Limits and release status

`assessed: true` means a structural check ran over valid supplied inputs. It
never establishes scientific sufficiency, source authority, regulatory
acceptance, joint applicability or semantic consistency. Missing source fields
still require appropriate source review. Different field labels and units are
not automatically equated or converted. Calendar-invalid string dates retain
an explicit limitation and cannot establish chronology.

The reports instruct input repair but cannot guarantee a model chooses the
right repair or asks a useful question. `acceptance-review.md` is pending live
review; the controlled fixtures are not scientific/regulatory qualification.

`published-parent-ci.json` records exact prior head `0efd2e86`: secret scan and
security contracts passed; Lint/TypeScript was still running or pending at
inspection. Security Scan failed at the dependency-risk ledger and Trivy
filesystem scan. This scoped fix does not resolve those failures or establish
an all-green release. Review exact new-head CI after publication.
