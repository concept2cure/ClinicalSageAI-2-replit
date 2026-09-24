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

**Other callers, still open.** A first version of this note said this route is
the only caller. That was wrong: the grep behind it searched the wrong path.
`assembleSequence` is also called by:

- `server/services/submission-service/submission-service.ts:844`, the pre-check
  assembly before a freeze or dispatch;
- the same file at `:1312`, the transmit assembly;
- `server/routes/ectd-compile.ts:976`, which already answers it, including a
  refusal's (`1c6f56e31`, another session, 18:27 the same day). An earlier
  version of this note listed it as open, which was wrong.

The two in submission-service do not pass the outcome on. They sit inside
the governed freeze/dispatch/transmit chain, whose responses would have to carry
it, and that chain is the package-spine lane's. They are left open and handed
on. `routes/ectd-export.ts` does not call it.
