# QOS publication: exact-source remote verification

W3 / D4, 2026-10-07. Only `concept2cure/ClinicalSageAI-2-replit`, branch
`concept2cure-v2`.

## Published behavior and source

Code publication:
[`fdd507a91c6b7c7976c78eae4fa9755f87326782`](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/fdd507a91c6b7c7976c78eae4fa9755f87326782),
tree `09bdd1233c21b130b533c24c705d00a3855400c8`.
The drug-substance and drug-product Module 2 stability sections carry their
existing Module 3 narrative intact, including deterministic holds, source/row
refusals and complete trend qualifications. [QOS-RESULTS.md](QOS-RESULTS.md)
preserves the genuine RED, unchanged reproducer, 83-file / 1,511-case passing
regression, warning comparison, build and reporter-failure controls.

The subsequent metadata-only publication
[`2c7b8bec41727a091a815f0f9fa99f0864b66133`](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/2c7b8bec41727a091a815f0f9fa99f0864b66133),
tree `eb095d2e9ccc9dba4bdc54179fef77746a73653f`, changes only
`.gitleaksignore` and five evidence files. Runtime, test, CI, schema and
scientific source is identical to the tested code publication; all eleven
integrated source blobs remain identical. Compiler, schema, lint and scientific
baselines are unchanged.

That metadata publication's own
[full compiler job 112985499361](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37677745714/job/112985499361)
also completed success with zero errors, compiler exit 0 and baseline 0.
[The exact excerpts](QOS-REMOTE-METADATA-COMPILER-GREEN.txt) establish its
independent execution; source equivalence does not replace that verdict.

At the final recorded snapshot, that metadata publication's own main lint,
security scan/contracts, blank-database provision/deploy, RLS production boot,
built-image sign-in/second-factor, AnA readiness and AIOS asset jobs also
completed success. Its broad Test, Integration Tests and Coverage jobs remain
in progress. [QOS-REMOTE-VALIDATION-SNAPSHOT.json](QOS-REMOTE-VALIDATION-SNAPSHOT.json)
pins both sources' actual job identities and verdicts; it does not treat an
unfinished overall workflow as a pass.

## Full-history checksum finding

The code publication's original full-history job
[112981179778](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477898/job/112981179778)
failed with one finding. [The actual RED](QOS-SECRET-SCAN-RED.txt),
[bounded disposition plan](QOS-SECRET-FINDING-PLAN.md) and
[source comparison](QOS-SECRET-CHECKSUM-COMPARISON.json) are preserved.
The candidate is the original manifest's SHA-256 digest of the unchanged
`server/services/ana/uploaded-file-access.ts`; the generic key rule reads the
word `access` in its property name and then the digest. Computed source bytes
match the recorded checksum exactly.

Only that original commit/path/rule/line-15 fingerprint was recorded as
`not a secret`. The scanner command, pinned v8.28.0 version, configuration,
credential rules and existing live-history entries remain unchanged. Local
verification passes the eight existing secret-history contract cases and
sixteen built-in working-tree scanner controls, with no skips. The local rule
diagnostic's Python translation limitations remain visible; it is not used as
the scanner verdict.

The actual unchanged remote full-history scanner on the metadata publication
[112985504696](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37677746198/job/112985504696)
**completed success**, scanning 9,676 commits and approximately 531.18 MB in
2m47s with zero unrecorded findings. [Its exact excerpts](QOS-SECRET-SCAN-GREEN.txt)
confirm the narrow historical checksum disposition resolves the actual finding.
This does not revoke or reclassify previously recorded live-history credentials.
The original failed job remains a failed job in its source's workflow history.

## Verified code-publication gates

Each verdict below belongs to `fdd507a91`, not an inferred overall workflow
or release verdict. Skipped governance jobs are not passes.

| Gate | Actual verdict | Exact job |
|---|---|---|
| Agent full semantic TypeScript | Success; zero errors, compiler exit 0, baseline 0 | [112981176880](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477193/job/112981176880) |
| Main lint/full semantic TypeScript | Success; zero errors, compiler exit 0, baseline 0 | [112981179868](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477898/job/112981179868) |
| Security scan | Success | [112981179457](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477898/job/112981179457) |
| Security contracts | Success | [112981179984](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477898/job/112981179984) |
| Semgrep | Success | [112981177234](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477205/job/112981177234) |
| CodeQL JavaScript/TypeScript | Success | [112981176094](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477130/job/112981176094) |
| CodeQL Python | Success | [112981177599](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477130/job/112981177599) |
| Blank PostgreSQL provision/deploy/replay, RLS and live schema | Success; zero NEW missing SQL references | [112989315125](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477898/job/112989315125) |
| Production bundle boot with RLS and non-superuser role | Success | [112989315345](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477898/job/112989315345) |
| Built production image, empty TLS database, sign-in and second factor | Success | [112989315242](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477898/job/112989315242) |
| Authenticated real-browser/database smoke | Success | [112981176296](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37676477169/job/112981176296) |

[QOS-REMOTE-AGENT-COMPILER-GREEN.txt](QOS-REMOTE-AGENT-COMPILER-GREEN.txt)
and [QOS-REMOTE-MAIN-COMPILER-GREEN.txt](QOS-REMOTE-MAIN-COMPILER-GREEN.txt)
contain the actual two full compiler executions: both zero errors and compiler
exit 0 against the unchanged zero baseline. The main job's existing
[214 Node guard controls](QOS-REMOTE-CI-GUARDS-GREEN.txt) also pass, with zero
failures, cancellations, skips or todo. Its ESLint ratchet records 6,258
warnings across 1,785 files / 21 rules against the unchanged 6,411 baseline;
the count did not grow. Schema, golden-journey and export-contract proof tiers
completed success. No local full TypeScript compiler ran on the 8-GiB host;
local builds and tests are separate evidence.

[QOS-REMOTE-LIVE-SCHEMA-GREEN.txt](QOS-REMOTE-LIVE-SCHEMA-GREEN.txt)
records native provision/deploy/replay and the actual live inventory: 1,297
relations, 758 server-SQL references, 13 resolved functions, 39 unchanged
baselined absences, zero NEW missing references. The required refusal on an
unprovisioned database, first-deploy tenant RLS, replay/idempotency, delegate
existence, readiness and post-deploy invariant steps completed success.

[QOS-REMOTE-PRODUCTION-BOOT-GREEN.txt](QOS-REMOTE-PRODUCTION-BOOT-GREEN.txt)
records both completed boot jobs and the image's actual non-superuser runtime,
readiness and sign-in/second-factor step verdicts.

## Existing PDF consumer check

A separate read-only execution follows the actual public Module 3 composer,
QOS builder, section conversion and PDF renderer, then extracts text with
Poppler. [Eight controls](QOS-EXPORT-CONSUMER-GREEN.txt) pass, zero failures,
exit 0, 4.115 seconds: monthly unnamed holds, conflicting criteria, short Water
trend refusals and later-study source/row reasons for both materials. Complete
QOS narratives of 2,878–3,424 characters and all expected refusal reasons
survive the existing WinAnsi-safe/whitespace-normalized PDF representation.
Sources, upstream sections and QOS objects remain unchanged.

[The manifest](QOS-EXPORT-CONSUMER-MANIFEST.json) verifies seven unchanged
source blobs, eight generated PDFs / sixteen pages, output digests and four
selected monthly-schedule page inspections. Those selected pages retain the
hold and source/row text inside their margins; this is not full layout
qualification. One rasterization has a nonfatal fontconfig-cache warning;
both rasterizations exit 0. [The exact reproducer](QOS-EXPORT-CONSUMER-REPRODUCER.ts.txt)
and original execution receipt are preserved. These eight controls are separate
from the integrated 1,511-case regression.

No further consumer defect was established. The existing orchestrator
explicitly packages Module 3 only; this check does not add Module 2 to that
package or qualify a deployed HTTP route, signature, provider or transport.

## Remaining qualification

Main CI's broader Test, Integration Tests and Coverage jobs remain in progress
at this snapshot. The native PostgreSQL Vitest step and release evidence retain
their independent verdicts. Pending and skipped jobs do not qualify those
boundaries; the successful provision/boot/browser gates above do not replace
the separate native-database test execution.

The earlier source `d46df5e1` had a failed unmocked native-database step after
successful provisioning and a successful broad mocked step. Its artifact
preceded the failing step and cannot identify the failing database assertion.
The new separate always-uploaded native-database JSON report preserves failures
and will expose the actual result when the current job reaches that step.
No native database repair or pass is inferred from local PGlite controls, the
expected unreachable-endpoint failure control or the earlier broad artifact.

D4 and D1–D10 remain open. Historical ancestry, scientific identity/unit/
criteria completeness, deployed intended use, production performance/races,
provider/transport PQ and accountable signed scientific/human acceptance
remain separately owed.
