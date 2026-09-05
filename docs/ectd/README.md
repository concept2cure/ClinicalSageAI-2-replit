# eCTD Publishing Engine — v3.2.2 & v4.0

The publishing engine turns a submission's leaves/documents into an
agency-acceptable eCTD sequence, for **both** eCTD standards:

- **eCTD v3.2.2** — the folder + heading + leaf model with regional Module‑1
  backbones (FDA / EMA / PMDA / Health Canada). Accepted by every agency today.
- **eCTD v4.0** — the ICH / HL7 **RPS** object model: one `submissionUnit.xml`
  message binding a submission unit → submission → application, a flat list of
  Contexts of Use (with priority numbers, keywords, and lifecycle references),
  and reusable documents. FDA-forward.

Normative requirements were extracted from the FDA/ICH source specs into
[`SPEC_DIGEST.md`](./SPEC_DIGEST.md) (validation criteria v4.5 & v4.0 v1.5, file
formats v9.3, the Module‑1 backbone examples + addenda, PDF specs, the eCTD v4.0
Technical Conformance Guide, Form 5640 transmission, and the FDA v4.0 controlled
vocabulary package v1.1).

## Module map

| Area | Path | What it does |
|---|---|---|
| Controlled vocabulary | `server/services/ectd/controlled-vocab/` | FDA v4.0 genericode CVs (CL1–CL13 + status/telecom) with code‑system OIDs; v3.2.2 `fdaat/fdast/fdasst/fdaft/fdaact` coded attributes; the v3→v4 crosswalk; OID validation; the FDA Regional IG OID. |
| v3.2.2 packager | `server/services/submission-gateways/regional-packager.ts` | Region backbones (FDA us‑regional **DTD 3.3**, EMA, PMDA, HC) + shared `index.xml`; finalize‑first so every `<leaf>` carries an inline MD5 matching the shipped bytes; backbone‑relative hrefs; lifecycle `modified-file`; PDF/A gate; DTD self‑containment gate; `util/index-md5.txt`. |
| v4.0 (HL7 RPS) engine | `server/services/ectd/ectd4/` | `submissionUnit.xml` serializer, deterministic UUID derivation, the v3.2.2→v4.0 forward‑compat mapper, the RPS structural + CV validator, and the RPS packager (PDF/A + SHA‑256 integrity = shipped bytes). |
| XML validation | `server/services/ectd/xml-validator.ts` | `xmllint`-backed well‑formedness + DTD + XSD validation (replaces the hand‑rolled scanner); fail‑open when `xmllint` is absent. |
| Schema drop‑in | `server/services/ectd/schema-bundler.ts` + `assets/ectd-schema/` | `util/schema/` drop‑point for the ICH RPS message XSD + genericode.xsd (v4.0 analogue of the DTD bundler), with a fail‑closed readiness gate (`ECTD_REQUIRE_RPS_SCHEMA`). |
| Artifact integrity | `server/services/ectd/checksum-manifest.ts` | Verifies each vendored DTD/XSD against its recorded SHA‑256 (`checksums.txt`); refuses tampered/stale/unlisted artifacts. |
| Qualification harness | `server/services/ectd/qualification/` | Per region + version: golden package → accepted validators (xmllint well‑formed + **DTD/XSD when vendored** + checksum‑manifest integrity + external eValidator + RPS model) → preserved report (with exact spec version) → lifecycle (replace/delete/append, revise) → reopen ZIP and re‑verify every checksum. |
| External validators | `server/services/ectd/external-validator/` | **LORENZ eValidator adapter** (CLI or endpoint invocation + JSON/XML report parsing, fail‑closed) + a license‑free FDA‑criteria subset; `runExternalValidation()` feeds `evaluateExternalValidationGate`, composed into `assess-dispatch-readiness`. |
| Pre‑transmit gate | `server/services/submission-gateways/pre-transmit-check.ts` | Package‑fitness preconditions at the gateway guard: size limit (hard), region identity — backbone region and format tag must match the target gateway (hard), PDF/A grade + DTD self‑containment + regional Module 1 conformance (opt‑in), external gate (route layer) — alongside the Part 11 human authorization. |
| Transmit path (packages) | `server/routes/submission-ops.ts` (identifiers / assemble / preflight), `server/services/ectd/section-to-ctd.ts`, `client/src/concept2cure/v2/surfaces/GatewayTransmittals.tsx` | Record identifiers → assemble (one leaf per artifact, placeable headings only, findings persisted) → transmit, on one package id, from the Dispatch surface or the API. Operator runbook: `docs/runbooks/ectd-transmit-path.md`. |
| Study Tagging Files | `server/services/ectd/stf-generator.ts` (wired in `regional-packager`) | Per‑study `stf.xml` (FDA STF v2.6.1) generated for M4/M5 study leaves (`EctdLeaf.studyId` + `stfFileTag`), placed in each study's folder, referenced in `index.xml`, and checksummed — cross‑linked to exactly that study's leaves. |
| Cross‑references | `server/services/ectd/cross-reference-resolver.ts` (wired in `regional-packager`) | Declared intra‑package hyperlinks (`PackagerInput.crossReferences`) resolved at package time; dangling / withdrawn‑target links surfaced on `SubmissionBundle.crossReferenceStatus` and blocked in production under `ECTD_REQUIRE_XREF`. |
| API | `server/routes/ectd-v4.ts` (+ `ectd-export.ts`) | Controlled‑vocab serving, RPS validate, v3→v4 forward‑compat preview, spec versions; the existing export/compile/validate routes. |
| Client | `client/src/concept2cure/v2/surfaces/PublishingCenter.tsx` | Version‑aware Publishing Center: spec versions, CV browser, honest states. |

## Qualifying a release (real validators)

```bash
npm run qualify:ectd
# generates golden packages for FDA/EMA/PMDA/HC (v3.2.2) + FDA (v4.0),
# validates them with xmllint (+ DTD/XSD when vendored, + external eValidator
# when configured), reopens each ZIP and re-verifies every checksum, exercises a
# lifecycle sequence, and writes JSON reports to ./qualification-reports/.
```

Environment flags:

- `ECTD_REQUIRE_DTD=true` — once the licensed DTDs are dropped into
  `assets/ectd-dtd/` (see that folder's README + `docs/runbooks/ectd-dtd-vendoring.md`),
  DTD‑validate every backbone and fail closed on a non‑self‑contained package.
- `ECTD_REQUIRE_PDFA=true` — enforce PDF/A on production packages (needs
  Ghostscript/veraPDF; no‑op otherwise).
- `ECTD_REQUIRE_REGIONAL_BACKBONE=true` — block a production transmit whose
  regional Module 1 backbone is not built to the agency's structure. Only the FDA
  backbone is; EMA / PMDA / Health Canada file Module 1 flat and the widened
  regions reuse the EMA structure — always surfaced, blocking only under this flag
  (see `docs/runbooks/ectd-transmit-path.md`).
- `EVALIDATOR_USE_FDA_CRITERIA_FALLBACK=true` — run the license‑free FDA‑criteria
  subset validator.
- LORENZ eValidator wiring: see `server/services/ectd/external-validator/config.ts`
  and `EVALIDATOR_INTEGRATION_SPEC.md`.

## What is proven in CI vs. what needs procurement

**Proven here (unit + integration tests, real `xmllint`):**
- Both backbones/messages generate and are **well‑formed** (real parser).
- Every controlled‑vocabulary code + OID is the FDA‑published value.
- The RPS validator enforces the High‑severity v4.0 criteria.
- Lifecycle sequences (replace/delete/append, revise) generate and validate.
- Reopen‑and‑verify: every `util/index-md5.txt` entry and every v4.0 per‑document
  SHA‑256 matches the bytes actually shipped.

**Wiring complete + tested — only the licensed artifact must be dropped in:**
- **DTD/XSD validity** — the `xmllint` validator, the `assets/ectd-dtd/` and
  `assets/ectd-schema/` drop‑points, the readiness gates, the checksum‑manifest
  verifier, and the qualification wiring are all built and tested. Drop the
  *licensed* ICH/FDA DTDs and the ICH RPS message schema into the drop‑points
  (and record their SHA‑256) and validity flips from "skipped" to enforced;
  `ECTD_REQUIRE_DTD` / `ECTD_REQUIRE_RPS_SCHEMA` make it fail‑closed in production.
- **Agency‑grade eValidator (LORENZ)** — the adapter (CLI/endpoint invocation +
  JSON/XML report parsing), the fail‑closed `runExternalValidation()`, and the
  dispatch gate composition are built and tested. Point `EVALIDATOR_BINARY` /
  `EVALIDATOR_ENDPOINT` at the licensed engine and set a region profile;
  `ECTD_REQUIRE_EVALIDATOR` makes it block dispatch fail‑closed.
- **Live transmission** (FDA ESG / EMA CESP / PMDA / HC) — real gateways, now
  fronted by the pre‑transmit precondition gate **and** the Part 11 human
  e‑signature. Not exercised by qualification (generation ≠ transmission); needs
  live agency credentials to send for real.

Qualification reports record the **exact spec version** each package was measured
against, so "compliant" is always scoped to a named, dated specification.
