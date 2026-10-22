# Complete public FDA recognition database acquisition — 2026-10-14

The previous search-page-only probe did not establish whether a complete public
export existed. The unfiltered official
[results page](https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/results.cfm)
does expose an export form. Its hidden `stds_id_list` contains **1,738 unique
official record IDs**, including records beyond the first displayed page.
Submitting that exact browser form to
[standards_Excel.cfm](https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfStandards/standards_Excel.cfm)
returned HTTP200, 343,308 exact bytes and the official
`application/excel-csv;charset=UTF-8` response. The file is CSV, despite the
endpoint name. Exact original bytes are preserved as `official-export.csv`.

The CSV has **1,895 nonblank data rows** representing **1,738 unique recognition
numbers**; 157 records also publish identical-adoption designation rows. Those
aliases are preserved. Its eight headers are Date of Entry, Specialty Task
Group Area, Recognition Number, Extent of Recognition, Standard Developing
Organization, Standard Designation Number/Date, Title of Standard, and Transition
Expiration Date. It does not contain product-code associations.

All **1,738** official SIS detail pages were downloaded with eight workers,
bounded 30-second requests and one bounded retry. Collection completed in
166.1 seconds with **zero HTTP failures**. `details-acquisition.json` records
each exact URL, HTTP outcome, byte count, SHA-256 and retrieval timestamp;
`record-manifest.json` joins each source ID/hash to its recognition identity,
list ID, official entry date and association state. Every byte count/hash was
checked again during normalization. The complete exact HTML archive is retained
at `/workspace/audit/recognized-standards-investigation/official-sis-records.tar.gz`;
its hash is pinned in `acquisition-manifest.json`. Representative actual pages
are included here. Response headers retain HTTP/date/content type information
and exclude response cookie tokens.

The deployed asset has **1,738 complete records**, **1,621 distinct product codes**
and **7,582 explicitly published associations**. The normalizer installs no
candidate unless all official source identities are acquired, matched exactly
once and structurally parsed. Every SIS entry date also matches its CSV row.
Any acquisition, identity, date, required-field or column-layout failure rejects
the entire candidate.

Source formatting matters. FDA's CSV removes commas, including some designation
commas, and some title quotation marks. Primary designation and title therefore
come from the identity-matched SIS Standard block, with the exact export aliases
retained. Product Code column positions use actual HTML colspans: records
11-311/11-343/11-365/11-373 include explicit codes in three-cell rows whose first
cell spans two columns. Their actual codes are retained. Full-width citation rows
carry no code. An independent classification-link crosscheck agrees with the
normalized codes in **1,737** records; the remaining record, **4-261**, explicitly
publishes **LPK** as plain text in its actual Product Code cell without a link.
No code is derived from a CFR citation, device name or standard subject.

**681** complete SIS records publish no explicit code: 402 omit the association
section, 208 publish a section without a Product Code table, and 71 publish a
table with no code values. These full source records are retained with distinct
`publishedAssociationStatus` values and empty `productCodes`, following the
existing loader contract. Uncoded citation rows are retained. Missing/failed
source acquisition never becomes an empty association array.

All **279** uncoded records with a published association section also preserve
the complete section text in `record-manifest.json`. Reviewing all 208 sections
without a table found 62 distinct published statements, including “All Medical
Devices” and “ALL PRODUCT CODES IN CLINICAL CHEMISTRY, TOXICOLOGY, HEMATOLOGY,
IMMUNOLOGY, MICROBIOLOGY, PATHOLOGY.” These are broader FDA scope declarations,
not literal individual code lists; they are retained for regulatory review and
are not expanded into guessed associations. The mounted DeviceProfilePanel now
labels positive and zero results as **explicit product-code associations** and
states that broader published scope needs separate review. A zero result does
not declare that no FDA-recognized standard could apply.

The snapshot is cumulative. Record recognition lists range from **003 to 067**.
The official database's latest Date of Entry is **2026-09-07**; that is the
asset's `publishedOn`, explicitly labeled by `publishedOnBasis` as a database
entry date, not an FR publication date. The separate official
[FR documents page](https://www.fda.gov/medical-devices/division-standards-and-conformity-assessment/federal-register-documents)
currently links through list **066**, with an independently acquired
[2026-08-24 Federal Register notice](https://www.govinfo.gov/content/pkg/FR-2026-08-24/html/2026-17229.htm).
One actual SIS record, **2-298**, publishes list **067** and entry 2026-09-07.
Its FR publication date is not guessed. Record-level list IDs and entry dates
are preserved, rather than describing every record as list 066.

The pinned normalized dataset SHA-256 is
`8795ab4429987c05e2912434e87b25c2754dc36ee736521c72dcc76f6411ee7a`.
The existing canonical parser and disk loader both load all records and index
all codes. Real lowercase lookups verify JPI, MUE, LLZ, LXY, MBD, MJO and LPK
against the independently inspected source records. Recognition 12-121 stays
unmapped; an unknown code returns available/loaded with zero matches, distinct
from missing data. Corrupting the final record still refuses the whole file.
`canonical-loader-verification.txt` records this actual complete-asset proof.

The initial existing service and mounted DeviceProfilePanel regression suites
passed **51/51 across two files** (`lookup-ui-regression.txt`). After the explicit
scope wording correction, the final suites pass **53/53 across two files**
(`lookup-ui-explicit-scope-final.txt`), including two mounted cases that use the
actual acquired asset through the canonical disk loader: MUE's six explicit
associations and ZZZ's available/loaded zero association result. Fixture cases
retain malformed/missing-data refusal and the distinct UI states. The complete
real asset is also exercised separately by the canonical verifier. The sole
application change is DeviceProfilePanel copy clarifying the existing lookup's
scope; no association expansion or database contract change was made.
Targeted lint with `--no-ignore` reports zero errors and three existing warnings
(panel length/complexity and the test's existing RequestInfo global). Offline
normalization reproduces both the installed dataset and the entire source-record
manifest byte for byte (`offline-normalization-reproduction.txt`).

The unconfigured GA preflight now reports **42 rows: 8 ready, 34 blocked, zero
unknown, 18 outstanding blockers and 16 advisories**. The recognized-standards
asset row is ready; provider/account/agency qualifications remain separate.
This closes the recognized-standards data availability and normalization gap.
It does not claim SDO full-text licensing, regulatory applicability decisions,
agency acceptance or overall production qualification.

Recheck the actual installed bytes and canonical adapter from the repository
root with the supported Node 22 runtime:

```sh
node --import tsx docs/evidence/AUDIT-REMEDIATION/2026-10-14/agency-assets/recognized-standards/verify-canonical-dataset.mjs
(cd assets/fda-recognized-standards && sha256sum -c checksums.txt)
```

For offline normalization reproduction, put `official-export.csv`,
`details-acquisition.json` and the extracted archive's `details/` directory in
one review directory, then run `python normalize-official-dataset.py <directory>`
from this evidence directory. It regenerates the same candidate only after every
source/identity/hash check succeeds. `collect-official-sis-records.py <directory>`
is the bounded public download procedure using the preserved `export-form.json`;
a future source snapshot must be reviewed rather than silently replacing the
current pinned one.
