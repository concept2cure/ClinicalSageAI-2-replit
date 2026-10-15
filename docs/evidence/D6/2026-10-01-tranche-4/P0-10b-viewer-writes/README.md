# P0-10b residual — a viewer writes none of the IRB, IACUC, IBC, RIM and BLA records

Launch row **D6** (with D5). Residual 6 of the P0-10b fix round (`docs/evidence/D6/2026-10-01-tranche-4/P0-10b/`):
the five routers had no write-role gate. The fix round closed their approval doors (the signed review is the only
way to "approved", and the signing-authority check refuses a viewer there), but a viewer who could open a record
could still create an IRB submission, IACUC protocol, IBC registration or RIM product, move a status no
determination sets, add a site, agent, amendment or label, put registrations, or persist a BLA assessment.
21 CFR 11.10(d) and (g): system access and authority checks.

## Change

- `server/routes/irb.ts`, `iacuc.ts`, `ibc.ts`, `rim.ts`: `router.use(requireEditorAccessForWrites)` — the gate the
  ProtocolDev, consent and deviations routers already mount (P11-C-1). Reads pass; every write needs a writing
  role (`GOVERNED_WRITE_ROLES`), so a write route added later is gated without anyone remembering to gate it.
- `server/routes/biopharma/bla-workbench.ts`: the same gate, except for the four computations when they save
  nothing. Whether a computation saves is one function, `willPersist`, which the gate and `maybePersist` both
  call, so the two cannot disagree. A viewer may still run a what-if computation; saving it is a write.
- Second door checked: the AnA tools that write these records (`create_irb_submission`, `add_irb_site`,
  `create_iacuc_protocol`, `create_ibc_registration`, `create_rim_product`) are confirm-class and already pass
  `writeRoleRefusal` (`server/services/ana/AnaToolExecutor.ts`, weekly review 2026-09-28).

## Tests

`server/routes/__tests__/research-compliance-viewer-writes.test.ts` (new): ten viewer writes across the five
routers → 403 before the handler; a member passes the gate; a viewer's reads and a save-nothing BLA computation pass.

- `red/viewer-writes.txt`: 10 of 14 fail on the unchanged routers (every viewer write got through).
- `green/viewer-writes.txt`: 14/14.
- `green/neighbours.txt`: `tests/db/domain-sign-ceremony.dbtest.ts` 53/53 on PostgreSQL. Its viewer case for
  IRB, IACUC, IBC, RIM and BLA now meets the write gate before the signing-authority check, so those routes carry
  `writeGate: true` as consent and deviations already did. Unit neighbours 90/90:
  `domain-sign-ceremony.routes.test.ts`, `bla-workbench-read.test.ts`, and
  `server/services/irb/__tests__/submission-context.route.test.ts`, whose stub user now carries a writing role.
