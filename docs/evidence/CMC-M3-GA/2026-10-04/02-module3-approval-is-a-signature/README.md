# A Module 3 section approval is a signature over what is filed, made by someone who may sign

Row **D5** (Part 11). Found by the 2026-10-04 discovery map (server and client
mappers: `m3-approve-no-signing-authority`, `approve-clears-stale-gate-blind-to-drift`,
`approve-tx-hygiene-and-digest`), then re-read and confirmed against the code
before fixing.

## The defects (`server/api/cmc/module3OperatingSystemRoutes.ts`, approve route)

1. **No signing authority (§11.10(g)).** Batch release, specification approval
   and register qualification ask `refusedWithoutSigningAuthority`
   (`cmc-signer.ts`). The section approval, which is the signature over the
   text filed in Module 3, re-authenticated the password and nothing else. Any
   member of the organisation, a read-only viewer included, could approve a
   section.
2. **Stale content approved, and the flag erased.** The route never read
   `stale`. Its `UPDATE … SET approval_state = 'approved', stale = false,
   stale_reason = null` signed a section the system had already recorded as
   out of date, and cleared that record, with no recompile.
3. **Drift invisible to the gate.** `stale` is set by one of the three writers
   of `cmc_source_objects` (`cmc-write-through`). `module3-convergence-service`
   and `POST /module3-os/source-objects` write sources without setting it, and
   the write-through skips locked sections. The export gate counted only the
   flag.
4. **The signature did not cover the filed prose, and placement filed the
   live row.** The approved version froze `deterministic_json` only, so the
   §11.70 digest bound none of `narrative_text`. Placement then read the live
   row, not the approved version.
5. **An open transaction handed back to the pool.** The signature meaning was
   validated after three writes. Its 400 returned without a ROLLBACK, so
   `client.release()` returned a connection with an open transaction to the
   pool.
6. **A fabricated governed state.** The route passed `hasEvidence: true,
   hasBeenReviewed: true, hasProvenance: true, isStale: false` as literals to
   `buildCanonicalGovernedState` and returned the result. Nothing read it.

## The fix

- The meaning is validated first. Then the authority gate (403
  `ESIGNATURE_NO_AUTHORITY`) runs before the password, and only then does the
  password run (`verifyReauth`). Nothing is written before all three pass.
- Inside the transaction, a stale section is refused with 409 `SECTION_STALE`,
  naming its reason, and a drifted section with 409 `SECTION_DRIFTED`, naming
  each source. Both roll back. The approval no longer touches `stale`.
- `server/services/cmc/section-drift.ts` (new) derives drift from
  `cmc_section_lineage` whoever wrote the source. It flags a source that changed
  since compile, a source that no longer exists, and a newer source of a type
  the section reads. The type map is the write-through's own impact map.
- The export gate (`final-export-gate.ts`) adds `driftedApprovedSections` and
  blocks on it, naming every section and reason.
- The approved snapshot carries `narrativeText`. The digest covers it, and the
  binding note says so.
- Placement (`readPlaceableSections`) files a section only when its live record
  and narrative equal the signed snapshot. Otherwise it is skipped and named:
  either "approved before the signature covered the narrative; re-approve", or
  "changed since it was approved".
- The fabricated governed state is removed from the route.

## Red, then green

Mutants were planted, one per fix, and run together:

```
× refuses a signer without signing authority before the password and before any SQL (§11.10(g))
× refuses to approve a stale section — 409, rolled back, the stale flag left standing
× refuses to approve a section whose lineage has drifted from its sources, whoever changed them
× blocks final export when an approved section drifted from its sources without anyone setting stale
× findSectionDrift … reports a source that changed after compile, though nobody set stale
× readPlaceableSections … a narrative changed after the signature is not
× readPlaceableSections … a compiled record changed after the signature is not
× readPlaceableSections … a section approved before the signature covered the narrative is named as such
Tests  8 failed | 29 passed (37)
```

With the mutants restored: 37/37. The tests now live in:

- `server/api/cmc/__tests__/module3SectionApproveSignature.test.ts`: authority,
  meaning, the frozen narrative, stale, drift at approval, and drift at export;
- `server/services/cmc/__tests__/section-signature-binding.pglite.test.ts`:
  `findSectionDrift` and `readPlaceableSections` on the real column types (jsonb,
  uuid, timestamp), plus `placeableContent`, the skip decision.

Wider runs: `server/api/cmc`, `server/services/cmc`, `server/services/ectd` and
the CMC client suites (143 files, 1,789 tests), all green. tsc is clean.

## Live, on the local server

`scripts/dev/cmc-staff-simulation.sh`: **118 passed, 0 failed.** It covers
approval with re-authentication, refusal of an empty section, refusal of an
undeclared meaning, compile, gate, placement, and a placement refusal. The
response-draft step now names its project, as PF-07 requires of every document.

Probe on the simulation's approved program (`live-gate-before.json`,
`live-gate-after.json`): the drug-substance specification was changed through
`POST /module3-os/source-objects`, which sets no stale flag.

- Stale flags set: 2 before, 2 after (the simulation's earlier change control).
- Drifted approved sections: 2 before (§3.2.P.3 and §3.2.S.2, from that change
  control), 4 after. The change also drifts §3.2.S.4 and §3.2.P.5, both of
  which read the specification.
- Before this change the gate's answer rested on the two flags alone. §3.2.S.4
  and §3.2.P.5 would have reached export carrying an approval over the old
  specification.

## Noted, not changed here

A `specification` source feeds both §3.2.S.4 and §3.2.P.5 whatever material it
specifies. The composer cannot tell a drug-substance specification from a
drug-product one, and it also lists `POST /module3-os/source-objects` as a door
that bypasses the registers. Both are later slices in this lane.
