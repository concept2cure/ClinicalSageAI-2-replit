# eCTD DTD drop-point

The eCTD export service bundles any `*.dtd` files placed in this directory into
each generated package under `util/dtd/`, making the package **self-contained**
and DTD-validatable. Until the files below are present, every generated package
references DTDs it does not contain, and `validateEctdPackage` flags it as
**not submission-ready** (see `HI_8_ECTD_SCOPING_BRIEF.md` G1).

These DTDs are **licensed agency artifacts** and are intentionally **not committed**
to this repository. A maintainer must obtain them from the official sources and
place them here (or point `ECTD_DTD_DIR` at a directory that contains them).

The acquisition workflow (legal review → license sign-off → file drop → checksum
update → integration test → PR) is documented in
`docs/runbooks/ectd-dtd-vendoring.md`.

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
| `us-regional-v2-01.dtd` | FDA (`us-regional.xml`) | FDA US Regional v2.01 (current production) | `buildFdaBackbone` ⇒ `<!DOCTYPE us-regional SYSTEM "../util/dtd/us-regional-v2-01.dtd">` | FDA eCTD Technical Conformance Guide & specifications (https://www.fda.gov/industry/electronic-regulatory-submission-and-review/electronic-common-technical-document-ectd) |
| `eu-regional.dtd` | EMA (`eu-regional.xml`) | EU Module 1 Specification v3.0.x | `buildEmaBackbone` ⇒ `<!DOCTYPE eu-regional SYSTEM "../util/dtd/eu-regional.dtd">` | EMA / Heads of Medicines Agencies eSubmission portal (https://esubmission.ema.europa.eu/eumodule1/index.htm) |
| `jp-regional.dtd` | PMDA (`jp-regional.xml`) | PMDA Notification PFSB/ELD No.0617001 (latest) | `buildPmdaBackbone` ⇒ `<!DOCTYPE jp-regional SYSTEM "../util/dtd/jp-regional.dtd">` | PMDA eCTD page (https://www.pmda.go.jp/english/review-services/regulatory-info/0006.html) |
| `ca-regional.dtd` | Health Canada (`ca-regional.xml`) | Health Canada Module 1 / Regional CTD (current) | `buildHcBackbone` ⇒ `<!DOCTYPE ca-regional SYSTEM "../util/dtd/ca-regional.dtd">` | Health Canada "Preparation of Drug Regulatory Activities in the Electronic Common Technical Document (eCTD) Format" guidance (https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/applications-submissions/guidance-documents/ectd.html) |

> Spec versions evolve. Before each acquisition cycle, re-check the agency's
> canonical page (column "Source") for the currently-mandated version and update
> this table + the runbook. Some regulators (notably FDA + EMA) maintain
> overlapping draft + production versions; vendor the **mandated production**
> version, not a draft.

## Licensing notes

DTD ownership and redistribution terms differ by issuer. Do not assume they
share a license. The runbook (`docs/runbooks/ectd-dtd-vendoring.md`) requires a
per-DTD legal review entry before drop-in.

- **ICH** — the ICH eCTD specification (including its DTDs) is published by the
  International Council for Harmonisation; redistribution outside an
  organisation's own submission tooling is restricted. Treat as
  internal-use-only; do not commit to a public repo.
- **FDA US Regional** — published by the FDA on the eCTD technical
  specifications page. U.S. government work; check the FDA page for the
  per-file notice. Confirm with counsel that bundling inside outgoing
  submissions is permitted (typically yes, since the recipient is the FDA).
- **EMA EU Regional** — published via the EMA eSubmission portal. EMA permits
  use within submissions; redistribution requires attribution and adherence
  to the EU Module 1 specification terms.
- **PMDA JP Regional** — published by PMDA under the relevant
  Pharmaceuticals and Food Safety Bureau notification. Japanese-government
  artifact; bundling in PMDA-bound submissions is the intended use.
- **Health Canada CA Regional** — published by Health Canada under the eCTD
  guidance. Crown copyright; reuse permitted with attribution per
  Open Government Licence — Canada terms (verify current notice).

Per-DTD license texts must be archived in the legal review packet referenced
from the runbook (NOT in this repo), with a copy of the license header
preserved at the top of the DTD file as shipped by the regulator.

## How bundling works

- On export, `bundleVendoredDtds()` (`server/services/ectd/dtd-bundler.ts`)
  copies every `*.dtd` in this directory (or `$ECTD_DTD_DIR`) into the package
  at `util/dtd/<name>.dtd`.
- Each backbone's DOCTYPE already points at the right filename, so once the
  files are present the references resolve.
- No code change is needed when you add the files — drop them in, update
  `checksums.txt`, and re-export.
- Production blocking is opt-in via `ECTD_REQUIRE_DTD=true`; see
  `assessDtdReadiness` in `dtd-bundler.ts`.

## Validator integration

`server/services/ectd/ectd-validator-hardening.ts` `validateDtdConformance`
runs against the backbone XML string (passed by callers as `backboneXml`).
With no DTD file vendored, the function still runs — it performs **structural
checks** (regex-level DOCTYPE / namespace / root-element / required-leaf-attribute
matching against `ICH_ECTD_DTD_ELEMENTS`) and emits findings as it goes. It does
NOT invoke a full SAX/DTD parser today; once the DTD files are vendored, a
follow-up change (out of scope for this scaffolding) will swap that for a real
DTD-bound parser. Until then, the validator runs in **degraded structural-only
mode**, which is the documented expectation while DTDs are absent.

Specifically, the regex `validateDtdConformance` requires in the backbone:

```
<!DOCTYPE ectd:ectd SYSTEM "ich-ectd-3-2.dtd">
```

(literal filename, no path prefix). The packager actually emits
`SYSTEM "util/dtd/ich-ectd-3-2.dtd"` for the on-disk package. Fixtures in
`fixtures/` use the literal `ich-ectd-3-2.dtd` form to exercise the
validator's regex as-written.

## Verification

After adding the DTDs:

1. Compute SHA256 of each file and update `checksums.txt`. The CI integrity
   check (added when the validator flips to strict mode) compares each
   vendored DTD against this manifest and refuses to start a packager run on
   mismatch — protects against in-place tampering.
2. `validateEctdPackage()` should no longer emit the "not self-contained /
   not submission-ready" warning.
3. Run the test fixtures: `npm test -- ectd-validator-hardening` (the
   `fixtures/` files exercise the valid and invalid backbone cases).
4. Validate the resulting package against an external eCTD validator
   (e.g. Lorenz eValidator / FDA eValidator) before any real submission —
   see `HI_8_ECTD_SCOPING_BRIEF.md` Phase E.

## Test fixture policy

`fixtures/` contains anonymized backbone XML samples that the validator unit
tests reference. The fixtures are checked in (no licensing issue — they are
our own XML, not the agency-issued DTDs) and remain valid against the real
DTDs once those land. Two cases are mandatory and currently present:

- `fixtures/index-valid.xml` — a minimal but conformant ICH backbone that
  should pass `validateDtdConformance` cleanly.
- `fixtures/index-invalid.xml` — a backbone that violates several DTD rules
  the validator checks (missing DOCTYPE, missing required leaf attributes,
  wrong checksum-type) so the test suite can assert each finding is emitted.

When the validator flips to strict DTD-bound mode (post-vendoring follow-up),
add region-specific fixtures (`us-regional-valid.xml`, `eu-regional-valid.xml`,
…) alongside, one per region. Keep fixtures small (<5 KB) and anonymized —
no real applicant info, no real study IDs.

## Directory contents (when fully vendored)

```
assets/ectd-dtd/
  README.md                       (this file — committed)
  checksums.txt                   (SHA256 manifest — committed)
  fixtures/
    index-valid.xml               (committed; small valid backbone)
    index-invalid.xml             (committed; small invalid backbone)
  ich-ectd-3-2.dtd                (NOT committed — licensed)
  us-regional-v2-01.dtd           (NOT committed — licensed)
  eu-regional.dtd                 (NOT committed — licensed)
  jp-regional.dtd                 (NOT committed — licensed)
  ca-regional.dtd                 (NOT committed — licensed)
```

A `.gitignore` rule keeps the `*.dtd` files local-only; everything else in
this directory is committed.
