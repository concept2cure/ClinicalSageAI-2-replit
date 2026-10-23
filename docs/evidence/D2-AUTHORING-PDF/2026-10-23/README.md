# Complete ordinary Authoring PDF output

W1 / D2. Locally qualified on `concept2cure-v2`, following
`docs/design/AUTHORING_PDF_CONVERGENCE.md`.

## What already exists

The canonical `server/services/authoring/authoring-export.ts` already creates
rich DOCX and converts retained company correspondence using strict
`server/services/pdf-converter.ts`. Ordinary PDFs still use
`server/export/renderers.ts`, whose optional Chromium lane can fall back to a
labelled text PDF. `server/services/authoring/authoring-file-to-vault.ts`
correctly refuses that fallback, so the installed Word converter does not yet
make ordinary PDF filing available. Existing export/working-copy routes and
their current-source, signature, audit, admission and uncertain-outcome checks
remain canonical. Existing rich Word blocks own tables, images, captions,
citations, footnotes and pending revisions. The production image already
includes LibreOffice and fonts. No new renderer or dependency is required.

Searches covered those render/export/filing/working-copy/converter names in
code, routes, documentation and tests, plus deleted history for Authoring
exports and PDF renderer/converter names. No retired competing converter was
found. The design records the full inventory and implementation boundary.

The existing File to Vault and controlled-export UI now share
`client/src/concept2cure/v2/authoringPdfRefusal.ts` for coherent, readable
pre-write conversion refusals. The generic Submission mutation classifier is
unchanged. No control, renderer, dependency or version policy was added.

## Verified result

Ordinary downloads, working copies and Vault filings now use the existing rich
Word builder and strict canonical converter. Failed conversion sends a safe
503 before export audit/history or Vault admission. Capacity refusals retain
their retry delay. The existing UI permits a deliberate retry only for the
coherent pre-write refusal; malformed, conflicting and uncertain receipts still
require reconciliation. Controlled export delivery/recording uncertainty remains
separate from rendering failure.

`verification.json` records the qualified commit and checks. `source-manifest.json`
pins its changed source, selected tests and canonical conversion dependencies.
`tests.json` selects the latest completed result for each exact file: **522 passed
across 38 files, zero failures/skips, one inherited re-filing TODO**. Overlapping
runs are not added together or added to the earlier company-document count.
`routes-and-ui.json` retains detailed HTTP/SQL/component proof, functional RED,
fixture corrections and unchanged-warning comparison. The production build and
full TypeScript check pass with zero compiler errors.

The service tests first failed 6 of 7 cases on the old renderer. HTTP tests then
exposed wrong conversion/busy status and the pre-render EXPORT audit; UI tests
exposed unnecessary reconciliation for definite refusals. Each correction has
passing reruns. An initial test-fixture escaping error is excluded from product
RED. The approval-carry fixture gained its missing canonical registry migration;
the signature fixture now targets the actual Word conversion seam. Neither
correction weakens production gates. SQL fixtures also verify source-bound
rollback, approval, saved-content drift, compensation, exact Vault identity,
placement and retained filing derivation.

## Actual artifact review

`artifacts/ordinary-review.pdf` is an actual five-page ordinary Authoring PDF,
without company presentation, created by the canonical Word/LibreOffice path.
The accompanying DOCX and page-one raster show a real table, numbered list,
embedded figure, footnote, current cross-reference, pending insertion underline,
deletion strikeout and unresolved-change notice. Actual covering and stale
signature statements remain correct. The synthetic signatures exercise rendering;
they do not represent a live approval.

`artifacts/ordinary-working-copy.pdf` has the uncontrolled-copy header and footer
on every one of its five pages and prints no signature manifestation.
`artifacts/verification.json` records exact delivered hashes and checks. The
fixture uses a tiny synthetic embedded PNG; it does not qualify arbitrary figure
content. Citation/source guards and reference rendering are covered by the
selected SQL/Word regressions.

`artifacts/historical-company/` rechecks retained landscape company letterhead,
logo and correspondence through actual conversion. Its five-page PDF SHA-256 is
`0dd9da5744064bae6e16f9330c10c7066f34ed4fad695929083c1609ed04c60f`,
identical to the prior qualified company PDF. Current branding is never read.
Registered/signed legal originals remain outside this renderer, with their
unchanged-byte, final-ZIP and PDF/A refusal regressions passing.

## Reproduction and limits

Use the saved Node 22 activation and locked dependencies. The exact selected
suites can be run with:

```sh
source /workspace/.cloud-setup/activate.sh
node --input-type=module - <<'JS'
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = JSON.parse(fs.readFileSync('docs/evidence/D2-AUTHORING-PDF/2026-10-23/test-files.json', 'utf8'));
process.exit(spawnSync('./node_modules/.bin/vitest', ['run', ...files], { stdio: 'inherit' }).status ?? 1);
JS
npm run build
node scripts/ci/typecheck-no-regression.mjs --incremental
```

Private reproducibility helpers and raw reports are retained under
`/workspace/.cloud-setup/authoring-pdf/` and `/workspace/.cloud-setup/gap-closure/`;
report hashes and exact selections are recorded here. Actual artifact generation
uses `verify-artifacts.mts` and the saved converter activation.

The saved startup ran successfully and authenticated Authoring inventory returned
HTTP 200 with zero visible documents (`browser-inventory.json`). No existing
whole-document candidate was available, so a live browser PDF download was not
exercised; no content was created to claim one. Actual converter artifacts and
mounted HTTP/SQL/component checks are separate proof. The inherited historical
hash-version re-filing TODO remains outside this completion. No production
deployment, remote CI, live agency transmission or agency acceptance is claimed.

## Concurrent update qualification

Before publication, the incoming native AnA model-provenance update at
`4718e17cb1224022684829a0e45f92f5048b5850` merged cleanly. The combined source at
`70d112b8d8fb03857423011ccbe1e99f8d7d9c16` passed 43 supplemental cases in three
files, the production build and the full zero-error TypeScript gate. All 50
Authoring PDF source pins remain unchanged. These 43 cases are separate from the
522 PDF cases above; see `concurrent-ana.json` for exact scope and report hashes.
