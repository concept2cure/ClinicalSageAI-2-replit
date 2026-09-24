# D5: the eCTD assemble route answers for its Part 11 audit row, 2026-09-24

Handed on by the WO-16C audit-outcome lane (`docs/work-orders/README.md`, "eCTD
callers"). `assembleSequence` (`server/services/ectd/assemble-from-core.ts`)
records an `ECTD_ASSEMBLE` row for every assembly, and an
`ECTD_ASSEMBLE_BLOCKED` row for every refusal. These are §11.10(e) records. It
returns what happened to each. `POST /api/submissions/sequences/:seqId/assemble`
dropped both:

- The success response carried no `auditTrail`, so an assembly that went
  unrecorded looked the same as one that was recorded.
- A refusal (a leaf path escaping the staging root) throws
  `EctdAssemblyBlockedError`, which has no `code`. `fail()` answered it as
  `500 INTERNAL "Request failed."`, which turned a refusal into an outage and
  dropped the outcome of the row that records the refusal.

**Change:** the success body carries `auditTrail`. A refusal is
`422 ECTD_ASSEMBLE_BLOCKED` with its message and its `auditTrail`.

**Proof:** `server/routes/__tests__/submissions-assemble-audit-outcome.test.ts`
mounts the real router with the assembly service mocked. It was red 3/3
(`red/at-HEAD.txt`: `auditTrail` undefined twice, and 500 for a refusal), and is
green 3/3 (`green/after.txt`). The related suites pass, 42/42: coauthor status
and the assembler's own audit-outcome test.

**Correction to the handed-on note:** `submission-service.ts` and
`routes/ectd-export.ts` do not call `assembleSequence` at HEAD. This route is
its only caller.
