# The run PDF is a faithful, marked copy (reporting review 2026-10-01, Part 11)

## What it replaces

The export was a one-page cover sheet:
- five lines, the providers and up to twenty blockers, cut off silently when the page ran out;
- every character outside ASCII turned into a space;
- a missing time printed as the moment of export;
- nothing to mark a partial report as not final;
- no seal, no signer and no export identity.

## What it prints now

`server/services/report-os/pdf/run-pdf.ts` (`buildRunPdf`), wired into
`GET /api/report-os/runs/:id/export.pdf`, prints:
- **The report body.** Every section and block, wrapped and paginated, never cut. For a final run
  it is the sealed document, and only when it verifies against the audit chain. A record that does
  not verify is refused: 409, no PDF, nothing recorded.
- **For a final run:**
  - the signature manifestation (11.50): who, as what, and when;
  - the reason and the status before finalizing;
  - the seal;
  - the verification verdict at export, with any failing check.
- **For any other run:** "NOT FINAL (STATUS)" across every page.
- **On every page:** the run, the export id and the export time (UTC), and "Page n of N". The export
  id and time are also recorded on the `report_os.run_exported` chain row, beside the hash of the
  exact bytes.
- **Characters:** Latin-1 is kept. Any other character prints as "?", and the PDF says how many there
  were. A chart is named, not drawn.

## Tests

- `server/services/report-os/pdf/__tests__/run-pdf.test.ts`: 8 cases, each on text extracted from
  the PDF.
- `server/routes/__tests__/report-os-audit-recording.test.ts`: three new export cases, all three
  failing on the previous route (`red-route-cases-on-previous-route.txt`):
  - the export id is printed and recorded, and a run that is not final is marked;
  - a final run exports its sealed document, signed and verified;
  - a record that does not verify is refused.
- `tests/db/report-os-registry-seed.dbtest.ts`: the real sealed run, exported as app_service with
  RLS on. The PDF names the signer, the reason and "intact", and the chain row carries the export id
  it prints.
