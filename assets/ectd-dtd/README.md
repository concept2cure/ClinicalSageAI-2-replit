# eCTD DTD vendoring point

This directory holds the agency-published eCTD DTDs that every generated
package bundles under `util/dtd/`, making each package **self-contained** and
DTD-validatable. Until the files below are present, every generated package
references DTDs it does not contain, and `validateEctdPackage` flags it as
**not submission-ready** (see `HI_8_ECTD_SCOPING_BRIEF.md` G1). Production
builds refuse to ship without them when `ECTD_REQUIRE_DTD=true`.

## Vendoring policy

Agency DTDs are **first-class vendored artifacts of this product**, handled
exactly like a pinned third-party dependency:

1. **They ARE committed to this repository** once acquired, so every developer,
   CI run, and release build validates against the identical bytes. This is the
   vendor's private product repository; bundling the agencies' own schema files
   into packages submitted back to those agencies is the DTDs' intended use.
2. **Provenance is mandatory.** Each DTD is committed verbatim as published by
   the agency — the agency's license/notice header at the top of the file is
   preserved untouched, and the acquisition (source URL, spec version, date,
   who fetched it) is recorded in `docs/runbooks/ectd-dtd-vendoring.md`.
3. **Integrity is enforced.** `checksums.txt` (SHA-256, `sha256sum` format)
   records every vendored file; `verifyChecksumManifest` refuses a DTD whose
   bytes do not match, and the qualification harness fails on unrecorded or
   tampered files. Update `checksums.txt` in the same commit as the DTD.
4. **Versions are pinned; upgrades are deliberate.** A DTD upgrade is a normal
   reviewed PR: new file + new checksum + runbook entry + a green qualification
   run. Never edit a vendored DTD in place.

Until the files are acquired they are simply absent (not committed yet) and the
engine runs in its documented degraded mode. This build environment's egress
policy blocks the agency sites — acquire the files from a network-permitted
machine and add them via PR.

## Required files

The exact filenames below are **load-bearing** — they are hard-coded in
`server/services/ectd/dtd-bundler.ts` (`ICH_BACKBONE_DTD`, `REGIONAL_DTD`) and
referenced verbatim by the DOCTYPE declarations emitted by
`server/services/submission-gateways/regional-packager.ts` (`buildIndexXml`,
`buildFdaBackbone`, `buildEmaBackbone`, `buildPmdaBackbone`, `buildHcBackbone`).
Renaming any file will break self-containment and gateway acceptance.

| File | Region | Spec version | DOCTYPE referenced by | Source |
| --- | --- | --- | --- | --- |
| `ich-ectd-3-2.dtd` | ICH backbone (`index.xml`) | ICH eCTD v3.2.2 | `buildIndexXml` ⇒ `<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">` | ICH eCTD Specification (https://www.ich.org/page/ich-electronic-common-technical-document-ectd) |
| `us-regional-v3-3.dtd` | FDA (`us-regional.xml`) | FDA US Regional DTD v3.3 (Module 1 Backbone Files Spec, current) | `buildFdaBackbone` ⇒ `<!DOCTYPE fda-regional:fda-regional SYSTEM "../../util/dtd/us-regional-v3-3.dtd">` | FDA eCTD Technical Conformance Guide & specifications (https://www.fda.gov/industry/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd) |
| `eu-regional.dtd` | EMA (`eu-regional.xml`) | EU Module 1 Specification v3.0.x | `buildEmaBackbone` ⇒ `<!DOCTYPE eu-regional SYSTEM "../../util/dtd/eu-regional.dtd">` | EMA / Heads of Medicines Agencies eSubmission portal (https://esubmission.ema.europa.eu/eumodule1/index.htm) |
| `jp-regional.dtd` | PMDA (`jp-regional.xml`) | PMDA Notification PFSB/ELD No.0617001 (latest) | `buildPmdaBackbone` ⇒ `<!DOCTYPE jp-regional SYSTEM "../../util/dtd/jp-regional.dtd">` | PMDA eCTD page (https://www.pmda.go.jp/english/review-services/regulatory-info/0006.html) |
| `ca-regional.dtd` | Health Canada (`ca-regional.xml`) | Health Canada Module 1 / Regional CTD (current) | `buildHcBackbone` ⇒ `<!DOCTYPE ca-regional SYSTEM "../../util/dtd/ca-regional.dtd">` | Health Canada eCTD guidance (https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/ectd.html) |

> Spec versions evolve. Before each acquisition cycle, re-check the agency's
> canonical page (column "Source") for the currently-mandated version and update
> this table + the runbook. Some regulators (notably FDA + EMA) maintain
> overlapping draft + production versions; vendor the **mandated production**
> version, not a draft.

## License notes

DTD ownership and notice terms differ by issuer; the license header shipped at
the top of each DTD file is preserved verbatim and travels with the file into
every generated package. Verify the current notice on each agency page at
acquisition time and record it in the runbook:

- **ICH** — published for use in organisations' own eCTD submission tooling;
  this private product repo and the packages it emits are that use.
- **FDA US Regional** — published on the FDA eCTD specifications page; bundling
  inside FDA-bound submissions is the intended use.
- **EMA EU Regional** — published via the EMA eSubmission portal for use within
  submissions, with attribution per the EU Module 1 specification terms.
- **PMDA JP Regional** — published under the relevant PFSB notification;
  bundling in PMDA-bound submissions is the intended use.
- **Health Canada CA Regional** — Crown copyright; reuse permitted with
  attribution per Open Government Licence — Canada.

## How bundling works

- On export, `bundleVendoredDtds()` (`server/services/ectd/dtd-bundler.ts`)
  copies every `*.dtd` in this directory (or `$ECTD_DTD_DIR`) into the package
  at `util/dtd/<name>.dtd`.
- Each backbone's DOCTYPE already points at the right filename, so once the
  files are present the references resolve.
- No code change is needed when you add the files — drop them in, update
  `checksums.txt`, and commit both together. The qualification harness's
  `xmllint --dtdvalid` step activates automatically for every region whose DTD
  is present in the generated package.
- Production blocking is opt-in via `ECTD_REQUIRE_DTD=true`; see
  `assessDtdReadiness` in `dtd-bundler.ts`.

## Validator integration

`server/services/ectd/ectd-validator-hardening.ts` `validateDtdConformance`
runs against the backbone XML string (passed by callers as `backboneXml`).
With no DTD file vendored, the function still runs — it performs **structural
checks** against the authoritative ICH v3.2.2 heading catalogue
(`server/services/submission-gateways/ectd-packager/ich-headings.ts` — the same
shared tree both backbone generators emit), plus DOCTYPE / namespace /
root-element / required-leaf-attribute checks. It does NOT invoke a full
DTD-bound parser; once the DTD files are vendored, the qualification harness's
`xmllint --dtdvalid` step provides real DTD validation on every generated
package. Until then, the structural layer is the documented always-available
mode.

The DOCTYPE accepted is `<!DOCTYPE ectd:ectd SYSTEM "…ich-ectd-3-2.dtd">` with
or without a path prefix — the packager emits the package-relative
`SYSTEM "util/dtd/ich-ectd-3-2.dtd"` form.

## Verification

After adding the DTDs:

1. Compute SHA256 of each file and update `checksums.txt` in the same commit.
   `verifyChecksumManifest` compares each vendored DTD against this manifest —
   protects against in-place tampering.
2. `validateEctdPackage()` should no longer emit the "not self-contained /
   not submission-ready" warning.
3. Run the qualification harness (`server/services/ectd/qualification`) — the
   per-region `xmllint DTD` validator rows must appear and pass.
4. Validate the resulting package against an external eCTD validator
   (e.g. LORENZ eValidator / FDA eValidator) before any real submission —
   see `HI_8_ECTD_SCOPING_BRIEF.md` Phase E.

## Test fixture policy

`fixtures/` contains anonymized backbone XML samples that the validator unit
tests reference. The fixtures are checked in (they are our own XML, not the
agency-issued DTDs) and use the authoritative ICH v3.2.2 heading hierarchy so
they remain valid against the real DTDs once those land:

- `fixtures/index-valid.xml` — a minimal but conformant ICH backbone that
  should pass `validateDtdConformance` cleanly.
- `fixtures/index-invalid.xml` — a backbone that violates several DTD rules
  the validator checks (missing DOCTYPE, missing required leaf attributes,
  wrong checksum-type, legacy abbreviated heading names) so the test suite can
  assert each finding is emitted.

Keep fixtures small (<5 KB) and anonymized — no real applicant info, no real
study IDs.

## Directory contents (when fully vendored)

```
assets/ectd-dtd/
  README.md                       (this file)
  checksums.txt                   (SHA256 manifest)
  fixtures/
    index-valid.xml               (small valid backbone)
    index-invalid.xml             (small invalid backbone)
  ich-ectd-3-2.dtd                (vendored agency artifact + license header)
  us-regional-v3-3.dtd            (vendored agency artifact + license header)
  eu-regional.dtd                 (vendored agency artifact + license header)
  jp-regional.dtd                 (vendored agency artifact + license header)
  ca-regional.dtd                 (vendored agency artifact + license header)
```

Everything in this directory is committed — the DTDs once acquired, with their
checksums recorded in `checksums.txt`.
