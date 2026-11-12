# F1 — the audit trail and Part 11 reads (GA readiness map, lane L5) — 2026-11-12

The GA readiness map (`docs/evidence/GA-READINESS/2026-11-10/`) lists four open items in lane L5. This file records
each as it is fixed.

## What already exists

- The screen: `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` (`AuditTrail`). It reads
  `GET /api/audit-trail/ledger`, lists the entries, filters them by kind, searches them, states two chain verdicts
  and offers the signed export.
- The route: `server/routes/audit-trail-ledger.routes.ts` (held by another session for event names; not changed
  here). It merges both audit stores newest first, takes `limit` (default 200, at most 1,000) and returns
  `meta.chain`, a verdict computed over the whole chain on the server, independent of the entries it lists.
- The signed export: `GET /api/audit/export/signed` (`server/services/audit/signedAuditExport.ts`), read from the
  stores, with its own 50,000-row ceiling and a `truncated` flag.
- Tests of the screen: `client/src/concept2cure/v2/__tests__/auditTrail*.test.tsx`, `anaOperatesAuditTrail.test.tsx`,
  `anaSeesScreens.test.tsx`.

Nothing new was added: no route, parameter, screen or table.

## GA-D5-05 — the screen read the newest 200 entries and presented them as the whole trail

**Before.** The screen called the route with no `limit`, so it received at most 200 entries. Its heading said
"200 entries", its filters counted those 200, and its search read those 200. A signature older than the newest 200
entries was not in the list, so "E-sign" could not find it. The screen's summary for AnA stated the same number as
the total.

**Fix (screen only).** The screen now asks for the route's full window (`?limit=1000`). When a full window comes
back, it no longer states a total: the heading reads "Newest 1,000 entries shown", a status line says that any
older entries are not listed, that the filters, their counts and the search read the listed entries only, that the
chain verdicts cover the whole trail, and that the signed export is read from the ledger and not from the list.
AnA's summary says the same and gives no total (`totalEntries: null`, `listIsNewestOnly: true`).

**Red first.** Two tests were added to `auditTrailChainVerdict.test.tsx` and failed on the old code:

```
× finds an e-signature that is older than the newest 200 entries
  → Unable to find an element with the text: /300 entries — hash-chained/
× says so when the trail is longer than the window: the count is not stated as the whole trail
  → Unable to find an element with the text: /Newest 1,000 entries shown — hash-chained/
```

After the fix: the audit-trail suites and `anaSeesScreens` pass (5 files, 50 tests). Three tests keyed on the exact
URL now name `?limit=1000`.

**In the running app** (local GA database, signed in as the administrator). The organisation's trail was 122
entries; 100 real settings changes, each with its reason, took it to 224.

- The route's default read (what the screen used to ask for): 200 entries.
- The screen now requests `/api/audit-trail/ledger?limit=1000` and receives 224. Heading: "224 entries —
  hash-chained — append-only". The chain banner beside it: "verifies intact over 224 chained entries". On the old
  read the heading would have said 200 beside a verdict over 224. Screenshot: `audit-trail-224-entries.png`.
- No status line is shown, because the list is the whole trail.

**Not shown in the running app.** This database has no e-signature rows (`electronic_signatures` is empty), so
"E-sign finds the seeded signatures" was checked in the component test only, not against the biotech demo seed.
The more-than-1,000 case was also checked in the component test only.

**Left for the route's holder.** A trail longer than 1,000 entries still cannot be filtered or searched past the
newest 1,000 from this screen. That needs a cursor or a `kind` parameter on the route, which is another session's
file. The screen now says so plainly in place of implying the list is complete.
