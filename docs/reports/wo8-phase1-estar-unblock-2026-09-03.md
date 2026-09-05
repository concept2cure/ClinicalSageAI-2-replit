# WO-8 Phase 1 — eSTAR fill engine unblocked

Date: 2026-09-03. Branch: `concept2cure-v2`.

`estar-fill` returns `filled: true` with an empty `blockers` array for
`510k-device`, and every written value was verified by reading the output PDF
back field by field. What follows is what was done, what was found, and what is
still open.

## 1. Templates

Not downloaded by this session. `www.fda.gov`, `fda.gov` and
`www.accessdata.fda.gov` are refused by this environment's egress policy (HTTP
403 to CONNECT, logged four times as `connect_rejected`), so Step 2's download
could not be performed. The templates were supplied directly by JM and vendored
under the manifest's `expectedFileName` values.

| Descriptor | File | Bytes | SHA-256 |
|---|---|---|---|
| `510k-device` | `assets/estar-templates/eSTAR-510k-non-ivd.pdf` | 5,280,666 | `73de2f1e89546654cdb5cb4203c86e6368fccfcb975dd6e637f399072f0edb92` |
| `510k-ivd` | `assets/estar-templates/eSTAR-510k-ivd.pdf` | 5,525,244 | `90d936495e415f6f63f9202c0db15ecffb041df60c5faecc57bc468559c1594f` |

Both carry `%PDF` magic bytes and both self-report **Version 7.0 (2026-06-01)**
inside their XFA `template` packet. The version was read from the file, not from
the FDA page, which was unreachable. This matches `ESTAR_VERSIONS`, which already
records nIVD/IVD 7.0 as `current` with 6.2 retiring 2026-08-03.

Pinned to `version: '7.0'` in `ESTAR_TEMPLATE_MANIFEST` for `510k-device` and
`510k-ivd` only. The other seven descriptors remain `'unset'`.

Two other files were received and are recorded here but not used: `PreSTAR_30.pdf`
(`04fe69eb…`, out of scope) and a flattened `estar.pdf` (`c3e30a1b…`, 869,869
bytes) which contains 3 static pages and **zero** form fields, so it is not a fill
route.

## 2. The premise Phase 1 was written on was wrong

WO-8 Step 1.4/1.5 assume the eSTAR is a fillable AcroForm whose field names
`listAcroFields` can enumerate. It is not. Both templates are Adobe LiveCycle
**dynamic XFA** forms:

- `/NeedsRendering true` is set, and each renders a single "open in Acrobat" page
- the AcroForm `/Fields` array has length **0**
- the real fields live in the `/XFA` packets
- the files are permission-encrypted (`/Filter /Standard`, `V 4`, `R 4`, `AESV2`,
  empty user password)

Measured, before any change:

| Call | Result on the real eSTAR |
|---|---|
| `listAcroFields()` | **throws** — `Input document to PDFDocument.load is encrypted` |
| `PDFDocument.load(bytes, {ignoreEncryption:true})` then `getForm().getFields()` | **0 fields** |

So `POST /api/510k/estar/scaffold-field-map` returned HTTP 500
`ESTAR_SCAFFOLD_FAILED`, and no `acroField` name could ever have matched. The same
holds for the five official FDA forms already bundled at
`templates/forms/acroforms/`: all five throw on load, and all five expose 0
AcroForm fields once forced open. Their sidecar manifests already record
`fillSupported: false` with an empty `fieldMap`. `registryCoverage.ts:146-150` and
`ind-form-fill-service.ts:22-26` had reached this conclusion previously for
FDA 1571/3674.

## 3. Defects found and fixed

**3.1 — `listAcroFields` / `fillOfficialPdf` could not open an official FDA PDF.**
Both called `PDFDocument.load(templateBytes)` with no options
(`fill-official-pdf.ts:155, 269`) while `ind-form-fill-service.ts:218` already
passed `{ ignoreEncryption: true }` for the same class of file. Both now pass it.

**3.2 — the scaffolder collapsed every Adobe-authored field name to `"0"`.**
`slugifyAcroFieldName` (`510k-estar-routes.ts:603`) split on `. \ / [ ]` and took
`.pop()`. XFA names end in an occurrence index, so the last segment is the number:

```
form1[0].#subform[0].DeviceTradeName[0]     -> "0"
topmostSubform[0].Page1[0].ApplicantName[0] -> "0"
DeviceTradeName                             -> "deviceTradeName"   (plain names were fine)
```

Every key collided into `0, 02, 03 … 0N`. It now takes the last segment that is
not a bare index.

**3.3 — nothing could fill a dynamic XFA template.** Added XFA support to
`server/services/forms/fill-official-pdf.ts`:

- `isDynamicXfaPdf()` — detects `/NeedsRendering` / `/XFA`
- `listXfaFields()` — enumerates SOM path, widget type, the template's own
  caption, and whether the path exists in the `datasets` skeleton
- `fillXfaDatasets()` — writes values into the `datasets` packet and emits a PDF
  **incremental update**: the original bytes are preserved verbatim and a new
  revision of the single `datasets` object is appended with a fresh cross-reference
  stream. Nothing else is disturbed, which is what keeps the output the real FDA
  form rather than a re-render.
- `readXfaDatasetsValues()` — reads values back, for verification

Standard-security decryption (Algorithm 2 key derivation, per-object keys, AESV2
and RC4) is implemented with Node's built-in `crypto`. **No new dependency was
added.** AESV3/V5 is explicitly rejected with a named error rather than
mis-decrypted. `estar-fill` now routes on what the vendored file actually is and
reports it as `templateKind: 'dynamic-xfa' | 'acroform'`.

Correctness was established against an independent implementation: the decrypted,
inflated XFA packets are byte-identical to what `pypdf` extracts
(nIVD `datasets` object 244, 17,408 bytes, `sha256 305e43637ecd1598…`; `template`
object 5, 9,877,094 bytes, `sha256 c479abf5bd85c8fe…`). The filled output was then
re-read by `pypdf`, which resolves `/XFA` through the xref chain rather than by
scanning, confirming the appended cross-reference stream is structurally valid.

## 4. Enumeration

| Descriptor | fieldCount | fillableCount | in `datasets` (fillable) | captioned |
|---|---|---|---|---|
| `510k-device` (nIVD 7.0) | 1,318 | 574 | 454 | 411 |
| `510k-ivd` (IVD 7.0) | 1,577 | 656 | 538 | 459 |

Only paths present in the `datasets` skeleton can be filled; the rest are reported
as non-fillable rather than silently mapped.

## 5. The committed field map

20 entries for `510k-device`, 19 for `510k-ivd`, in `estar-field-map.ts`. Every
path was enumerated from the vendored template and verified to be both declared by
the template and present in its `datasets` skeleton. None was hand-typed. `caption`
is the template's own label, carried so a reviewer can confirm each mapping by
reading the form.

| Canonical key | XFA SOM path | Template caption |
|---|---|---|
| `deviceTradeName` | `root.AdministrativeDocumentation.PMNSummary.SSTextField220` | Device Trade Name |
| `deviceCommonName` | `root.AdministrativeDocumentation.PMNSummary.SSTextField230` | Common Name |
| `deviceClassificationName` | `root.AdministrativeDocumentation.PMNSummary.SSTextField240` | Classification Name |
| `regulationNumber` | `root.AdministrativeDocumentation.PMNSummary.SSTextField250` | Regulation Number |
| `productCodes` | `root.AdministrativeDocumentation.PMNSummary.SSTextField260` | Product Code(s) |
| `associatedProductCodes` | `root.Classification.USAKnownClassification.DDTextField517a` | Associated Product Code(s) |
| `applicantCompanyName` | `root.AdministrativeInformation.ApplicantInformation.ADTextField210` | Company Name |
| `applicantContactEmail` | `root.AdministrativeInformation.ApplicantInformation.ADTextField160` | Email |
| `applicantContactTelephone` | `root.AdministrativeDocumentation.PMNSummary.SSTextField130` | Applicant Contact Telephone |
| `applicantSummaryEmail` | `root.AdministrativeDocumentation.PMNSummary.SSTextField150` | Applicant Contact Email |
| `correspondentCompanyName` | `root.AdministrativeInformation.CorrespondentInformation.ADTextField410` | Company Name |
| `correspondentContactEmail` | `root.AdministrativeInformation.CorrespondentInformation.ADTextField360` | Email |
| `correspondentTelephone` | `root.AdministrativeDocumentation.PMNSummary.SSTextField180` | Correspondent Contact Telephone |
| `correspondentSummaryEmail` | `root.AdministrativeDocumentation.PMNSummary.SSTextField200` | Correspondent Contact Email |
| `predicateSubmissionNumber` | `root.PredicatesSE.PredicateReference.ADTextField830` | Predicate Submission Number (e.g., K210001) |
| `predicateDeviceTradeName` | `root.PredicatesSE.PredicateReference.ADTextField840` | Predicate Device Trade Name |
| `declarationCompanyName` | `root.AdministrativeDocumentation.DoC.DCTextField120` | Company Name |
| `declarationCompanyAddress` | `root.AdministrativeDocumentation.DoC.DCTextField130` | Company Address |
| `declarationDeviceTradeName` | `root.AdministrativeDocumentation.DoC.DCTextField140` | Device Trade Name |
| `indicationsForUseCitation` | `root.Labeling.SpecificLabeling.LBTextField130` | Indications for Use attachment/page citation |

`510k-ivd` carries the same map minus `indicationsForUseCitation`: the IVD template
does not declare `root.Labeling.SpecificLabeling.LBTextField130`. The generator
rejected it rather than mapping a path that does not exist.

## 6. The gate

`fillEstarSubmission({ type: '510k', variant: 'device', data })`:

```
descriptorId      : 510k-device
templateAvailable : true
fieldMapPopulated : true
templateKind      : dynamic-xfa
filled            : true
blockers          : []
pdfBytes          : 5,285,100 bytes, magic %PDF-
filledFields      : 20 of 20
skippedFields     : []
warnings          : (none)
```

Read-back of the produced PDF, per field: **20 pass, 0 fail.** Each of the 20
values was located at the SOM path it was mapped to and matched the submitted
value exactly.

Fail-closed behaviour was verified by making each check fail:

| Case | Result |
|---|---|
| template absent (`ESTAR_TEMPLATE_DIR` → empty dir) | `filled: false`, 1 blocker naming the missing file |
| descriptor with no verified map (`de_novo-device`) | `filled: false`, 2 blockers |
| mapped path the template does not declare | filled the real field, skipped the bogus one, warned; never invented |

Existing suite: `server/services/pathway-engines/estar` — **10 files, 91 tests,
all passing.**

## 7. Gaps, stated honestly

- **Acrobat rendering is unverified.** There is no Acrobat in this environment. What
  is proven is that the values are in the `datasets` packet Acrobat binds to, that
  the `template` packet is byte-identical to the original, that all ten XFA packets
  survive, and that an independent PDF library reads the result through the xref
  chain. Whether Acrobat displays all 20 values on open — and whether the form's own
  initialize/calculate scripts overwrite any of them — has not been observed. **This
  is the one thing Phase 1 still needs a human to confirm.**
- **The template's internal completeness check has not been run.** That is an
  Acrobat-side behaviour.
- 20 of 454 fillable nIVD paths are mapped. The remaining 434 are enumerated and
  available; they were not mapped because nothing upstream supplies values for them
  yet.
- No download was performed (§1). Provenance for these bytes is JM's transfer, not
  a recorded FDA URL. If provenance must be auditable, re-download from FDA and
  confirm the SHA-256s in `checksums.txt` match.
- **Step 1.7 (legal) is still open.** The templates are now committed to the
  repository, following the vendoring policy in `assets/ectd-dtd/.gitignore`
  ("Vendored agency DTDs ARE committed … pinned by checksums.txt, upgraded only via
  reviewed PR"). FDA materials are generally US Government works, but counsel has
  not confirmed redistribution inside a customer-facing product. If counsel says no,
  remove the two PDFs and point `ESTAR_TEMPLATE_DIR` at an out-of-tree directory —
  no code change is required.
- **WO-8 step 1.8 names `config/ui-surface-registry.json`. That file does not
  exist** (the registries are `shared/constants/ui-surface-registry.ts` and
  `.ui-v2.ts`, which describe UI surfaces, not template versions). The vendored
  version, FDA effective date, checksums and the "a version bump is a data change,
  never a code change" note were recorded in `assets/estar-templates/README.md` and
  `checksums.txt` instead, alongside the existing `ESTAR_VERSIONS` registry.
- Phase 2 (the six clicks) was not started.
