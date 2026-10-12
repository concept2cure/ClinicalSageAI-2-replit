# D6 — a compliance report is not run for a date that has not happened

**Row:** D6 (security posture)
**Workstream:** W3b
**Finding closed:** HS-1008-6 (`docs/evidence/reviews/2026-10-08/honest-state.md`)
**Date:** 2026-10-12
**Head before:** `dbebe7e38`

## The defect

`parseReportPeriod`'s as-of branch returned before any comparison against the
clock:

```ts
const to = readDate(query.to) ?? (query.to === undefined ? utcDate(dayOf(now)) : null);
if (!to) return refused('The end date must be a calendar date written as YYYY-MM-DD.');
const end = new Date(to.getTime() + DAY_MS).toISOString();

if (kind === 'as-of') {
  return { ok: true, period: { from: null, to: dayOf(to), kind }, bounds: { start: to.toISOString(), end } };
}
```

So **"Access review as of 2027-01-01" returned today's membership under a date a
year away**, and a range ending in the future did the same. Nothing on either
side qualified it: the client's `pastAsOfNote` fires only for a date in the
*past*, which is precisely the case that needs no warning.

What comes out of that request is a signed, exported, regulator-facing document
headed with a date that has not happened, stating who had access on it. The
module's own docstring already forbade the shape of this:

> …refused — **never coerced into some other period**, which would hand an
> inspector a report about dates they did not ask for.

Presenting today's state under a future date is exactly that coercion. The rule
was written; the as-of branch returned above it.

## What changed

One check, after `to` is resolved and before either branch, so it covers both
kinds:

```ts
const today = utcDate(dayOf(now));
if (today && to.getTime() > today.getTime()) {
  return refused(
    kind === 'as-of'
      ? `The as-of date has not happened yet. A report is as of today (${dayOf(now)}) or earlier.`
      : `The end date has not happened yet. A report covers dates up to today (${dayOf(now)}).`,
  );
}
```

The route needed nothing: `audit-compliance-reports.ts:247` already turns any
refusal into `400 BAD_PERIOD` with the message, so the refusal reaches the
caller through the path the other five refusals already use.

`periodProblem` in `complianceReportsModel.ts` mirrors it, so the person is
stopped at the field rather than by a 400 after the round trip. It takes `now`
as an injectable parameter, as `defaultPeriod` already did. The client check is
a convenience and never the authority — the server refuses regardless.

### Two boundaries that had to hold

- **Today is not the future, and today is the default.** A naive `>=` would have
  refused every default request, since `to` defaults to `dayOf(now)`. Pinned on
  both kinds and on `parseReportPeriod({}, …)`.
- **The clock is a calendar day, not an instant.** `dayOf(now)` truncates to the
  UTC date, so a request at 15:42Z naming `2026-09-30` is today, not the past.
  Pinned at `T00:00:00Z`, `T15:42:00Z` and `T23:59:59.999Z`.

## Verified by making each check fail

| Suite | Against pre-fix code | Against the fix |
|---|---|---|
| `server/.../compliance-reports/__tests__/period.test.ts` | **2 failed / 17 passed** — `period.ts` restored from `HEAD` | **19 passed** |
| `client/.../compliancePeriodFutureDate.test.ts` | **2 failed / 3 passed** — `complianceReportsModel.ts` restored from `HEAD` | **5 passed** |

All four failures are the future-date refusals. Every other case passed against
the pre-fix code, including the two boundary groups above and the ordering case
asserting a malformed date is still named as malformed rather than as a future
date — so the new check did not swallow the five refusals that were already
there.

## Repo-wide gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run ci:internals-in-copy` | no new occurrences, 0 baselined |
| `npm run check:microcopy` | OK — 476 customer-facing files |
| `server/services/audit/compliance-reports` + the four client compliance suites | **12 files / 155 tests passed** |

## Remaining from the 2026-10-08 review

Two, both row D5, both untouched here because they need a different row's
evidence and one of them needs a database:

- **HS-1008-7** — `signedAuditExport.ts:311` attests that "every row carries a
  hash linked to its predecessor" for a check that skips a NULL `previous_hash`
  after a hashed predecessor and never re-derives `record_hash`. The sentence is
  stronger than the check and it is regulator-facing. The auditor's interim fix
  is to word it as "previous_hash pointers match; row content is not
  re-derived" until the derivation is implemented.
- **HS-1008-8** — `generatedAt` is stamped at each render, so re-rendering a
  stored run yields a different content hash. The 10-01 README lists seal
  re-verification as fixed; whether the pinned-timestamp half is also closed was
  not re-checked at HEAD, and the finding says to confirm that before keeping it.
