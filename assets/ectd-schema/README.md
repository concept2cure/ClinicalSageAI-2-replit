# eCTD XML-schema (XSD) drop-point

The eCTD v4.0 packager bundles any `*.xsd` files placed here into each generated
v4.0 package under `util/schema/`, making the package **schema-validatable**
(the RPS `submissionUnit.xml` and the controlled-vocabulary `.gc` files). Until
the required schema below is present, `qualifyV4` reports RPS schema validation
as **skipped** and — under `ECTD_REQUIRE_RPS_SCHEMA=true` in production — the
schema-readiness gate blocks the package as not submission-ready.

This mirrors `assets/ectd-dtd/` exactly. The filenames are **load-bearing** —
they are hard-coded in `server/services/ectd/schema-bundler.ts`
(`RPS_MESSAGE_XSD`, `GENERICODE_XSD`) and consumed by the xmllint-backed
`xml-validator`. Renaming a file breaks schema validation.

## Required / accepted files

| File | Validates | Source | Licensing |
| --- | --- | --- | --- |
| `rps-message.xsd` | `submissionUnit.xml` (ICH eCTD v4.0 / HL7 RPS message, PORP_IN000001UV) | ICH eCTD v4.0 Implementation Package (https://www.ich.org/page/ich-electronic-common-technical-document-ectd) — **licensed**, do not commit | ICH — internal-use-only; drop in per the vendoring runbook |
| `genericode.xsd` | the FDA controlled-vocabulary `.gc` files | OASIS genericode 1.0 (shipped in the FDA eCTD v4.0 Controlled Vocabulary Package) | OASIS open standard — redistributable; a maintainer may commit it after the per-file legal-review entry |

> The ICH RPS message schema is a **licensed** artifact, like the eCTD DTDs.
> `rps-message.xsd` is therefore **gitignored and NOT committed**. A maintainer
> obtains it from the official ICH implementation package and drops it here (or
> points `ECTD_SCHEMA_DIR` at a directory that holds it).

## Procedure

1. Drop the XSD files into this directory (or `$ECTD_SCHEMA_DIR`).
2. Record their SHA-256 in `checksums.txt`:
   `cd assets/ectd-schema && sha256sum *.xsd` → replace the placeholders below.
3. Commit `checksums.txt` (the licensed `.xsd` files themselves are NOT committed).
4. Run `npm run qualify:ectd` — v4.0 qualification now XSD-validates the RPS
   message and records `xmllint XSD (submissionUnit.xml): ok` in the report.
5. To enforce in production: set `ECTD_REQUIRE_RPS_SCHEMA=true`.

The checksum verifier (`server/services/ectd/checksum-manifest.ts`) refuses a
vendored schema whose bytes don't match its recorded hash.
