# Roadmap item 2 — the predicate of record

Date: 2026-09-07. Branch `concept2cure-v2`. Roadmap item 2 of
`docs/handoff/HANDOFF_DEVICE.md` §6, opened by the market-readiness verdict in
`docs/reports/device-market-readiness-2026-09-07.md`.

## 1. What was wrong

The official FDA eSTAR fills its predicate submission number and predicate device trade
name from `regulatory_programs.predicate_devices[0]` — `predicateSubmissionNumber` and
`predicateDeviceTradeName` in `server/services/pathway-engines/estar/estar-administrative-data.ts:147–152`,
projected by `firstPredicate` at `:287–290`.

**Nothing a user could click wrote that column.** `profilePatchSchema`
(`server/routes/510k-device-routes.ts`) had no `predicateDevices` key, so `PUT /profile`
stripped it and refused the patch as empty. The 510(k) surface's predicate table had
checkboxes, but they drove `selected`, a `Set<string>` in component state used for the
side-by-side SE comparison and persisted nowhere. The reduced openFDA fallback rows —
real FDA clearance records — were inert by design, with an empty checkbox cell.

So on a filed form those two fields traced back to a seed script and to no human action
at all. That is the WO-8 stop condition "depends on a seeded response", and it is a Part 11
problem before it is a UX one: an inspector asking *equivalent to what, and who said so*
had no answer.

## 2. What it is now

A **predicate of record** — a deliberate claim, distinct from the comparison selection:

- `PUT /api/510k/device/profile` accepts `predicateDevices`, through the gates the rest of
  the governed profile write already carries (`requireEditorAccess` →
  `requireEntitlement('device_assembly_readiness')` → session actor → org-scoped update →
  `DEVICE_PROFILE_UPDATED`).
- The audit entry names **which** predicate was claimed, not just that the field changed:
  `details.predicateDevices` carries the K-numbers written, and `[]` records a withdrawal.
- The 510(k) predicate panel states what the eSTAR will carry —
  `Predicate of record: K221847 — Dexcom G7 CGM System`, or
  `No predicate of record — the eSTAR predicate fields stay blank.` — and every candidate
  row carries a Claim control. Withdrawing is one click and stores `[]`.
- **openFDA fallback rows are claimable.** They stay unselectable into the SE matrix, which
  has no scoring behind them, but a real FDA clearance record is a legitimate predicate
  claim and that is the one thing about it that does not depend on the shadow service. It
  is also the only path a tenant has while predicate intelligence is down.

### Three refusals, each with a test that was seen failing first

| refusal | why |
|---|---|
| `id` and `name` required; whitespace is not a name | element `[0]` of this column is a claim to FDA; an unnamed one is not one |
| blank optional facts DROPPED, never stored as `''` | the eSTAR reports a fact it does not hold as blank; `''` would print as an answer |
| duplicate ids refused | "which one is predicate `[0]`" must have one answer |

and one on the client, which is the load-bearing one:

**An example row can never be claimed.** In sample mode the fixture K-numbers render with
the claim control disabled and the reason on it — *"Example rows cannot be claimed as the
predicate of record"*. Sample mode exists so a demo can populate a screen; a fixture
K-number written into `predicate_devices` would reach FDA as this sponsor's own assertion
of substantial equivalence. `useShowingSample(predicates.rows)` is the same predicate the
row gate uses, so the two cannot drift.

Reading the column back is equally explicit. `predicateDevicesOnFile` keeps `unreadable`
separate from `devices`, because the eSTAR fills from element `[0]` *whatever it is*: a
reader that skipped an unreadable first entry and showed the second as "the predicate on
file" would name a device the form will not carry. A legacy bare-string list
(`['K182234', 'K191435']`, the shape `seed-demo.ts` uses elsewhere) is reported as two
unreadable entries, never coerced into a device with an invented name.

## 3. A render loop found on the way, and fixed

Writing the first test that renders the 510(k) surface **with live predicate rows** hung
the runner. `useK510Predicates` re-derived its rows array from the payload on every render,
so `sourcePredicates` had a new identity every render; the effect that re-seeds the
comparison selection depended on that identity and returned a fresh `Set` every time. Set
state on every render → re-render → effect → forever, for exactly as long as predicate
intelligence stayed healthy.

Every test that existed before this one either had no program selected or 503'd the shadow
service, so the live path had never been rendered and the loop had never been seen.

Two fixes, both narrow:

- `reseedSelection(prev, rows)` is now a pure exported function that returns **the same
  set** when the selection is unchanged. Five tests pin that identity, seen failing before
  the function existed.
- `useK510Predicates` memoizes its adapted rows on the payload, so the identity churn that
  made the loop possible is gone at the source.

The test file went from hanging past a 4-minute timeout to 2.3 s.

## 4. Verification

Every check below was seen failing on the case it exists to catch before it passed.

| check | result |
|---|---|
| `tests/routes/510k-device-routes.test.ts` | 35 passed (7 new; all 7 failing first — the three write cases on a stripped key, the four refusals on `JSON.stringify(body)` not naming `predicateDevices`) |
| `client/.../hooks/__tests__/useDeviceProfile.test.ts` | 34 passed (8 new, 7 failing first on the missing reader) |
| `client/.../__tests__/k510PredicateOfRecord.test.tsx` | 11 passed (6 surface + 5 loop invariant; 6 failing first, then the hang) |
| server route suites (device routes, governed writes, official eSTAR) | 3 files / 73 passed |
| MDX client suite | 43 files / 521 passed |
| `npx tsc --noEmit` | clean |
| `npx eslint` on the touched non-ignored files | 0 errors |

## 5. What this does NOT do

- **SE comparison stays an authored section.** The checkboxes still drive the local
  side-by-side and nothing else; claiming a predicate does not populate the SE matrix, and
  the matrix does not claim a predicate.
- The eSTAR still writes **two** predicate fields. A 510(k) citing multiple predicates
  raises the existing advisory (`estar-administrative-data.ts:367–375`) and files the first
  entered; that is a field-map question, not this one.
- Nothing here reaches an attachment slot. Roadmap item 4 is still the keystone.
