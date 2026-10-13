# A European device programme can record its own class

**Row:** D4
**Found by:** the previous commit's own projection. It reported
`eu_mdr_class` and `ivdr_class` as unprojected, by name, with the reason *"no
column holds the MDR classification"* — which is what made the gap a finding
instead of a silence.

## What was wrong

`regulatory_programs.device_class` is the **US** 21 CFR 860 class. The eSTAR
administrative-data projection and the 510(k) surfaces print it on a US form,
so it cannot hold `IIa`.

No column held the MDR or the IVDR class. The platform knew them everywhere
else:

- AnA's project-setup interview **asks** both (`eu_mdr_class` with the seven
  declared classes, `ivdr_class` from the governed catalogue);
- the Annex VIII rule engine **derives** the MDR class from the interview's own
  facts and reports a mismatch against the sponsor's declaration;
- the conformity routes are **offered from** the class, and a route the class
  contradicts is marked;

and then the record had nowhere to keep the answer. A European device or
diagnostics programme could be configured in every respect except the one
thing that decides its conformity assessment route.

## What this change does

`migrations/20261012b_regulatory_programs_eu_device_classes.sql` —
`eu_mdr_class` and `eu_ivdr_class`, additive and `IF NOT EXISTS`, registered in
`C2C_MIGRATION_FILES` before the tenant sweeps.

**Two columns, not one.** A device is classified under the MDR and a diagnostic
under the IVDR: different regulations, different vocabularies (MDR: the seven a
sponsor **declares** — I, Is, Im, Ir, IIa, IIb, III; IVDR: A, B, C, D). One
column holding either would mean every reader having to ask which regulation
the value came from.

**The regulator is in the name**, unlike `device_class`. That column stays as
it is: it is read by the eSTAR projection, the 510(k) device routes and the
standards-applicability service, and renaming it is a change that owes a
reachable replacement by path, not a column addition.

**No CHECK constraint.** The vocabularies are
`shared/regulatory/device-class.ts`'s and the write validates against them; a
CHECK copied into SQL would be a second list that drifts — and under RULE 1 a
constraint a later file also defines is exactly the replay hazard that rule
exists for.

**The record keeps the DECLARED class, not the rule class.**
`programmeFactsFrom` reads Is/Im/Ir onto Class I, because the caution rules
reason about the four the Annex VIII rules yield. The record keeps the seven,
because the notified body's involvement for the sterile, metrological or
reprocessing aspect follows from which one the sponsor declared (Art 52(7)).
The projection therefore uses `euDeviceClassOf`, not the fact reader.

**'Not applicable / No EU filing planned' clears the column** rather than
standing in it. That answer says there is no European classification, which is
not a classification — so the projection sets `null` (withdrawn), and both
columns are nullable in the write for the same reason.

## The gates

| Gate | Holds |
|---|---|
| `records the class the sponsor DECLARED, not the one the rules yield` | Is → `Is`, not `I` |
| `clears the column where no EU filing is planned, rather than standing a class in it` | `null`, and the key is present so it is a withdrawal rather than a silence |
| `records the IVDR class on its own column, for its own regulation` | and not onto the MDR column, in either direction |
| `keeps a class in the person’s own words off the record as a class` | `__other__` stays their wording on the session |
| `never puts a European class in the US column, which is printed on a US form` | |
| `takes each European class on its own column, for its own regulation` | the write refuses an IVDR class as an MDR one and vice versa |
| `lets a European class be withdrawn` | both nullable |
| `every field the interview can answer is projected or has a written reason` | the two fields moved from the reason list to the projected list, and the sweep still passes in both directions |

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| T1 'no EU filing planned' stored as the string `'na'` | `clears the column where no EU filing is planned` |
| T2 the declared class collapsed to the rule class (via the fact reader) | `records the class the sponsor DECLARED` |
| T3 the IVDR class written onto the MDR column | `records the IVDR class on its own column` |
| T4 the two European vocabularies merged into one enum | `takes each European class on its own column` |
| T5 a European class made unwithdrawable | `lets a European class be withdrawn` |

```
$ npx vitest run server/services/c2c/__tests__ \
      server/services/cmc/__tests__/programme-configuration-commit.test.ts \
      server/routes/__tests__/510k-device-profile-estar-fields.test.ts
Test Files  12 passed | 1 failed (13)
     Tests  173 passed | 2 failed (175)

$ npm run ci:migration-set-order
OK — 375 migrations, sweep last, tail uuid step → child scope → sweep
$ npm run ci:migration-drop-safety
OK — 375 migrations, 36 DROP(s), none re-created by the set
$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 — OK, matches baseline
$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
6 lintable file(s) changed -- no file changed its warning count
```

The two failures are the same pre-existing `node-status-follows-work.pglite`
cases reported in the previous commit's evidence; they fail on a clean tree and
are not this change's.

## What is written and not yet read

The columns are **written** by the interview commit and the programme-profile
write. Nothing reads them yet: `PmsPmcfTab` and the post-market readiness
service take a device class from the device profile, and the CER surfaces take
theirs from their own stores. Pointing those at the MDR column is a surface
change with its own honest-state questions (what a surface shows when the class
is `null`), and it is not claimed here. Stated plainly so the next session does
not assume the loop is closed.
