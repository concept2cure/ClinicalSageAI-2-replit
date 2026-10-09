# D2: every Authoring section save failed (500); fixed, and the journey that should have caught it re-armed

**Row:** D2. Authoring is a launch app, and this is its one save path.
**Found by:** the LX-00 founder-path walk test (`tests/lineage/`), finding LX00-F1.
It is not in the lineage plan.

## The defect

`server/routes/authoring.router.ts:1798`:

```ts
updates.push(`content = ${paramCount}`);   // fde9d704, 2026-09-25 01:51
updates.push(`content = $${paramCount}`);  // before, and now again
```

In a template literal, `${paramCount}` interpolates the number itself. So the SQL
read `content = 1` with the bound content left unused. Postgres refused the UPDATE,
the transaction rolled back, and **every section content save answered 500**
(`LINEAGE_REQUIRED`). The editor could not save anything.

## Why nothing caught it

- **The IND authoring golden journey had been red since `fde9d704`.** That commit
  made the server require a reason-for-change on content saves, and the journey
  sent none. It stopped at a 400 before the UPDATE.
- **Behind that it had been red since `613c6e00`.** That change added
  `password_changed_at` to the account-standing read. The journey's hand-mirrored
  `users` table lacked the column, so the signing ceremony failed closed with
  `ACCOUNT_STATE_UNKNOWN`. That was correct behaviour on a wrong fixture.
- **`authoring-atomic-mutations.test.ts` runs on a mocked pool.** A mock does not
  parse SQL, so it could never see this bug. Two of its cases had also been red
  since `fde9d704`, for the same missing reason.

## The fix

- **`authoring.router.ts`:** the `$` is restored.
- **`ind-authoring.journey.test.ts`:**
  - The edit sends its reason-for-change.
  - The journey applies the real `db/migrations/20260725_users_signing_lockout_columns.sql`
    instead of hand-mirroring the account columns, so the next column added there
    reaches it.
- **`authoring-atomic-mutations.test.ts`:** both PATCH cases send a reason.

## Evidence

- `01-journey-reaches-the-broken-update.txt`: with the reason added and the router
  unfixed, the journey now reaches the UPDATE and gets the 500.
- `02-journeys-green-after-fix.txt`: all 11 golden journeys, 22/22.
- `03-founder-walk-edit-save-green.txt`: the LX-00 walk. `edit-save/save-accepted` and
  `edit-save/revision-chained` are green, and their baseline entries are removed
  (20 → 18).
- The authoring route suites are 30 files. `authoring-atomic-mutations` is 6/6, and it
  was 4/6 on trunk.

At HEAD, the walk's baseline recorded:

```
edit-save/save-accepted   observed {"status":500,"code":"LINEAGE_REQUIRED"}   (LX00-F1)
edit-save/revision-chained observed 1                                          (LX00-F1)
```

## Ownership

`authoring.router.ts` is inside the window of `…01FSu2RL` (`fde9d704`), which has no
lane row. The fix is the one character that commit dropped, made because every save
in a launch app was failing. It is recorded on the board for that session. The
journey's account-columns drift came from the D6 lane (`613c6e00`) and is recorded
there too.
