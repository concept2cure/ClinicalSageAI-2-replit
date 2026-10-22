# Official FDA eSTAR templates

FDA's interactive PDFs are vendored here verbatim under the existing public
agency-artifact policy and pinned by `checksums.txt`. The canonical registry
`server/services/pathway-engines/estar/estar-template-registry.ts` reads these
files or `ESTAR_TEMPLATE_DIR`; a required missing, altered or unpinned form
cannot become an official submission artifact.

The FDA eSTAR Program page was read verbatim on **2026-10-14**:
<https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program>.
The current-version table names nIVD/IVD **7.1** and PreSTAR **3.1**, including
the OMB numbers below. It does not publish retirement dates for 7.0/3.0; no dates
were inferred. The PDFs themselves identify **2026-09-21** as their version date.
Full source, response headers, download provenance and field-map checks are filed
under `docs/evidence/AUDIT-REMEDIATION/2026-10-14/agency-assets/`.

| File | Family/version | Logical descriptors | OMB numbers | Direct FDA source |
|---|---|---|---|---|
| `eSTAR-510k-non-ivd.pdf` | nIVD 7.1 | 510(k), De Novo, PMA × device | 0910-0120, 0910-0844, 0910-0231 | <https://www.fda.gov/media/192777/download?attachment> |
| `eSTAR-510k-ivd.pdf` | IVD 7.1 | 510(k), De Novo, PMA × IVD | 0910-0120, 0910-0844, 0910-0231 | <https://www.fda.gov/media/192778/download?attachment> |
| `PreSTAR-q-sub.pdf` | PreSTAR 3.1 | Q-Sub, IDE, 513(g) × PreSTAR | 0910-0756, 0910-0078, 0910-0511 | <https://www.fda.gov/media/192779/download?attachment> |

There is one physical FDA PDF per family. The Q-Sub-named file is also the
IDE/513(g) form, just as the 510(k)-named files also carry De Novo/PMA. The
pathway is selected inside the official form; this platform does not invent
separate FDA forms or set that declaration on the applicant's behalf.

All existing marketing field-map primary and secondary SOM paths were
re-enumerated against 7.1 and exist in both the template and datasets skeleton.
The form-script behaviour suite also passes against the new exact bytes.
**PreSTAR administrative preparation is available:** Q-Sub, IDE and 513(g)
share four verified applicant/correspondent company/email mappings. The canonical
pipeline also preserves the actual PreSTAR `***Begin***` manifest seed and can
embed a cover letter under its measured chapter without changing FDA's form or
scripts. Prepared files are labeled as administrative prefills and retained under
distinct document codes; the filing picker excludes them, and signed filing
explicitly refuses their document codes. Request-specific questions/declarations,
the remaining attachment routing and an Adobe-rendered completed request are
not qualified. Filing readiness stays blocked, even with complete content and
registration. Evidence: `prestar-prefill-verification.md` in the audit-remediation
directory above. No agency acceptance is inferred from these local checks.

These are dynamic Adobe LiveCycle XFA forms with an empty AcroForm `/Fields`
array. `fillXfaDatasets` writes the datasets packet by an incremental PDF update
that preserves the official original. FDA directs applicants to download the
form and use a compatible PDF editor; it does not open as an interactive form
in a browser. A filled administrative field alone is not proof of a completed
submission or transport qualification.

Verify verbatim acquisition with `sha256sum -c checksums.txt` from this directory.
When FDA republishes a template, replace its bytes, update the checksum and
manifest version, record official source/date/OMB facts, and re-enumerate every
primary/secondary map path plus form behaviour before enabling production fills.
No version may be bumped solely to clear a readiness blocker.

- `ESTAR_TEMPLATE_DIR` overrides this drop point.
- `ESTAR_REQUIRE_TEMPLATE=true` enforces missing-template refusal for production.
- Filing readiness independently checks template currency, populated maps,
  governed content, client registration, and other submission prerequisites.
