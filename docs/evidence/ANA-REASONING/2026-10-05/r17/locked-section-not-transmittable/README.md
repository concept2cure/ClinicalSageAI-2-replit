# A filing section is transmittable only on a status a signature produces

Row **D1**. Decision **P-29** (`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`).
Round 17.

## The fail-open

`isFinalizedStatus(status, 'c2c_document_sections')` — the predicate the eCTD
assembler and dispatch readiness use to decide whether a leaf may be
transmitted — borrowed `C2C_SECTION_COMPLETE_STATUSES`, which is
`{'approved','locked'}`.

That set is right where it belongs. It is the TypeScript mirror of
`c2c_recompute_document_readiness()`, and
`tests/schema-contract/c2c-section-completion.contract.test.ts` parses the
migration and fails if the two disagree. **Readiness is a progress metric.**
Transmittability is an attestation, and the answer is narrower:

- `approved` is written in exactly ONE place — `approveBoundFilingSections`,
  inside the signature's own transaction, and only for a section whose filed
  text equals the text signed. A signature stands behind it by construction.
- `locked` is written by **no production path**. The filing-side route refuses
  `status: 'locked'` outright (`APPROVAL_REQUIRES_SIGNATURE` — "a section cannot
  be locked here"); `commitSectionToFiling` only reads it; the document lock
  sets `c2c_documents.status`, not a section's.

**And it was reachable**, which is what made this a fail-open rather than dead
vocabulary: `migrations/20260529_phase9_backfill.sql` maps a legacy section's
status through `WHEN 'locked' THEN 'locked'`, and that file is on the applier
(`scripts/db/migration-set.mjs`). So a legacy-migrated section could ship as a
finalized eCTD leaf **with no electronic signature ever having covered its
text** — §11.70's link to the record absent, on the last gate before
transmission.

## The change

One new set in `server/services/ectd/leaf-source-resolver.ts`:
`C2C_SECTION_TRANSMITTABLE_STATUSES = {'approved'}`. The readiness set is
untouched, and the new suite pins that it was not narrowed to achieve this —
narrowing it would have broken the migration pin and quietly moved every
document's completion percentage.

The refusal names the status, so a client sees `locked` as the cause rather
than a gap.

## Red before green

`server/services/ectd/__tests__/leaf-finalized-status-needs-a-signature.test.ts`,
8 cases, 3 red before the fix:

```
 × refuses `locked`, which no production path writes
   -> expected true to be false
 × names `locked` in the refusal, rather than passing it silently
   -> expected null to be 'locked'
 × the two questions now give different answers for `locked`
   -> expected true to be false
```

The decide phase of the P-29 review noted this refusal "has never been driven
through a refusal by any test". That was accurate.

## One existing test asserted the defect, and was updated with its reason

`leaf-source-resolver-governed-sections.test.ts` had
`expect(result.unfinalized).toBe(1)` under the comment *"approved + locked are
finalized; drafted is not."* — the old rule, written down. It now expects 2 and
names both the locked and the drafted section, with the reason in place. Updated
rather than deleted, because the case is a good one: it renders three real PDFs
and checks which are flagged.

## Attributed, not fixed here

`server/services/ectd/__tests__/submission-gate-posture.test.ts` fails 2 of 8,
identically with this change stashed — `ESTAR_REQUIRE_TEMPLATE` is recorded as
blocking while `assets/estar-templates` now vendors every manifest pathway. The
test's own message says to re-decide the posture. Another lane's; handed on.

Full run: 1212 passed, 2 failed (those two), across
`server/services/ectd/__tests__/` plus the readiness contract pin.
