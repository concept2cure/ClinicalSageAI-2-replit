# eCTD DTD drop-point

The eCTD export service bundles any `*.dtd` files placed in this directory into
each generated package under `util/dtd/`, making the package **self-contained**
and DTD-validatable. Until the files below are present, every generated package
references DTDs it does not contain, and `validateEctdPackage` flags it as
**not submission-ready** (see `HI_8_ECTD_SCOPING_BRIEF.md` G1).

These DTDs are **licensed agency artifacts** and are intentionally **not committed**
to this repository. A maintainer must obtain them from the official sources and
place them here (or point `ECTD_DTD_DIR` at a directory that contains them).

## Required files (eCTD v3.2.2 — the GA target)

| File | Region | Source |
| --- | --- | --- |
| `ich-ectd-3-2.dtd` | ICH backbone (index.xml) | ICH eCTD v3.2.2 specification package (ich.org) |
| `us-regional-v2-01.dtd` | FDA (us-regional.xml) | FDA ESG / eCTD technical specifications |
| `eu-regional.dtd` | EMA (eu-regional.xml) | EU eCTD specification (Heads of Medicines Agencies / EMA) |
| `jp-regional.dtd` | PMDA (jp-regional.xml) | PMDA eCTD notification specification |
| `ca-regional.dtd` | Health Canada (ca-regional.xml) | Health Canada eCTD specification *(HC generation is still pending — see brief)* |

## How bundling works

- On export, `bundleVendoredDtds()` copies every `*.dtd` in this directory (or
  `$ECTD_DTD_DIR`) into the package at `util/dtd/<name>.dtd`.
- The backbone DOCTYPE already points at `util/dtd/ich-ectd-3-2.dtd`, so once the
  ICH DTD is present the reference resolves.
- No code change is needed when you add the files — drop them in and re-export.

## Verification

After adding the DTDs, `validateEctdPackage()` should no longer emit the
"not self-contained / not submission-ready" warning. Validate the resulting
package against an external eCTD validator (e.g. Lorenz eValidator / FDA
eValidator) before any real submission — see `HI_8_ECTD_SCOPING_BRIEF.md` Phase E.
