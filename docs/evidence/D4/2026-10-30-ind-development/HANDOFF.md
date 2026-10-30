# Verified IND development handoff

## Resumed integration — publication pending

On continuation, canonical changes through `89b67685e` were merged normally at
`8a6958b77`. All 66 retained IND source hashes remain identical. The affected
Projects, Study/Protocol and IND regression checks pass 428/428 across 23 suites;
production client/server builds pass. Normal publication gates are the next step.
See the resumed-integration section of the README and its retained logs.

Project Home's intelligence-profile indication/population and IND's program/sole
charter facts remain separate records; this integration does not reconcile them.

## Previous publication attempts

Implementation commits: `8013c9457` (core drafting increment) and `f19544aee`
(blank-choice parity). Latest fully gated local source: `d7d70a7f28536cfbcbaa4dcb15fa132deef58549`.
The local working tree was clean and all 66 retained changed-source hashes matched.

The source is implemented in the existing project/Author workflow. The README
records individual regression groups, source/currentness boundaries, region
vocabulary limits, incomplete supplemental sweep and remaining scientific work.
Production client/server builds pass. The latest merged STF/pre-transmit tests
pass 63/63 after making a genuine Debian xmllint 2.9.14 binary available under
`/workspace/scratch/ind-xmltools/runtime/usr/bin`; no production dependency,
schema, model/provider or readiness approval was added. The native XML tests use
explicitly synthetic grammars, not agency qualification.

Seven normal publication runs completed every pre-push gate, including zero
TypeScript errors against the unchanged zero baseline and a net reduction of one
ESLint warning. Git then rejected each push because another session advanced
`concept2cure-v2` during those checks. No force push, hook bypass or baseline
expansion was used. The latest run's status and complete log are retained beside
this file as `publication-blocked-status.json.gz` and `publication-blocked.txt.gz`.

At handoff, the remote had advanced through `1ba87327`, including further protocol
workflow changes that are fetched but not merged into the last fully gated local
source. Publication requires a brief quiet window for the canonical branch, then
a normal merge, focused qualification of new owners, and a normal push. The
asynchronous coordination request asks for approximately ten minutes without
other pushes. The task-local runner `/workspace/scratch/run-ind-publication.py`
runs the ordinary `git push origin concept2cure-v2`, retains all hooks, and writes
an explicit completion status; no runner remains active at this handoff.

Remaining P-73 content/qualification work is explicit: dated regional Module 1
requirements, nonclinical study/source binding, populated disease/phase/population
applicability conditions, and independent scientific/regulatory/model assessment.
The 12 writing labels and 25 static profiles do not establish that coverage.
