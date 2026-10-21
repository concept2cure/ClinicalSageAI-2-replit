# C-5 — withdrawn. The JSON is the envelope, and the CSV is already a CSV.

The review recorded:

> The compliance reports serve `json` and `csv` only. An inspector who asks for
> the access review is handed `application/json`.
>
> Open — `ReportFormat` + `readFormat`.

The Content-Type is accurate. The conclusion drawn from it is not, and **acting
on it would break a working 21 CFR Part 11 path.** This file exists so that no
later session "completes" the row.

## What the `application/json` actually carries

`buildSignedReport` (`server/services/audit/compliance-reports/signed-report.ts`)
produces a *sealed package*:

```ts
{ data, manifest, signature, filename, contentType }
```

`data` is the report body — the CSV text when `format === 'csv'`. `manifest`
carries `dataHash`, the SHA-256 **of exactly those bytes**, and `signature` is
the HMAC over the canonical manifest under the key the manifest names.

The route returns all three together:

```ts
body: { success: true, export: { data: signed.data, manifest, signature,
                                 filename: signed.filename,
                                 contentType: signed.contentType, … } }
```

So the response is `application/json` because **the signature has to travel
with the data.** The file's own type and name are not lost; they are fields
inside the envelope. `SignedReport.contentType` and `.filename` are therefore
not dead code either — the belief that they were was the second half of this
finding, and it is wrong: both are read at `audit-compliance-reports.ts:193-194`.

The module's own `VERIFY_INSTRUCTION` documents the workflow this shape exists
for:

> To verify a saved file, a signed-in member of the organisation sends
> `{ data, manifest, signature }` to `POST /api/audit/export/verify`. For a CSV,
> `data` is the CSV text exactly as saved, and `manifest` and `signature` come
> from the `.manifest.json` saved with it.

## The inspector already gets a CSV

`ComplianceReportResult.tsx`'s **Download CSV** button:

1. `POST /api/audit/reports/convert` with the sealed snapshot **on screen** —
   not a fresh GET, which the route comments note would be a new run over
   possibly changed rows. So the bytes are the ones the reader just reviewed.
2. `downloadText(`${base}.csv`, exp.data, 'text/csv;charset=utf-8')` — verbatim,
   with the code's own comment: *"the manifest's SHA-256 is over this exact
   string."*
3. `downloadText(`${base}.manifest.json`, …)` beside it — the sidecar
   `VERIFY_INSTRUCTION` names.
4. And if the browser refuses the sidecar, it says so rather than reporting
   success: *"Saved …csv, but this browser refused its manifest, so the file
   cannot be verified on its own."*

A `.csv` that opens in Excel, a `.manifest.json` that proves it, and an honest
failure message when only half arrived. That is the deliverable the finding
asked for.

And it is pinned, not merely present. `complianceReports.test.tsx` →
*"saves the CSV run's export.data byte for byte, with its manifest beside it"*
feeds a body built to break any careless re-serialisation — CRLF line endings,
quoted fields, a formula-neutralised `'=HYPERLINK("x")` cell, non-ASCII
(`Zoë — signed out  ` with its trailing spaces) and a trailing blank line — then
asserts both the string and its UTF-8 bytes:

```ts
expect(file.name).toBe('authentication-events-2026-07-03-2026-10-01.csv');
expect(file.text).toBe(csv);
expect(new TextEncoder().encode(file.text)).toEqual(new TextEncoder().encode(csv));
expect(manifest.name).toBe('authentication-events-2026-07-03-2026-10-01.manifest.json');
```

It also asserts the conversion went to `/convert` with the snapshot on screen,
and that the original GET ran exactly once — so the CSV cannot quietly become a
second run over different rows. Run on 2026-10-18: **19 passed (19)**.

## Why the "obvious fix" is a regression

Making `GET /audit/reports/:id?format=csv` respond `text/csv` with the raw body
would strip the manifest and the signature from the response. The caller would
hold a CSV that **cannot be verified at all** — no `dataHash` to check it
against, no signature, no key id. For a 21 CFR Part 11 §11.10(e) record that is
strictly worse than a JSON envelope: the authenticity is the point of the
export, not a decoration on it.

Headers could carry the identifiers, but not the manifest itself without
base64-encoding a structure into a header, and a bytes-only delivery that drops
verifiability to satisfy a Content-Type is the wrong trade.

## If someone still wants a one-request file download

The honest shape would be a **ZIP** containing `report.csv` and
`report.manifest.json` — the pair `VERIFY_INSTRUCTION` already describes, in one
response, with nothing dropped. That is a new delivery format and a product
decision, not a defect fix, and it would have to reuse `sendAuditedExport` so
the download still writes its chained audit row. It is not needed for the
inspector workflow, which the client already serves.

## Method note

The finding was checked by reading what the user receives, not what the route
sets. Three of this review's findings have now turned out to be wrong in the
same direction — C-5, C-6 (the cap was on the narrator's list, not the reader's
feed) and C-8 (the client and the engine measure different sets) — each stated
from one side of the boundary. A finding about an export is about the file that
lands, and a finding about a cap is about who cannot see past it.
