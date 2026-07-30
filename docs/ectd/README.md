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
| Qualification harness | `server/services/ectd/qualification/` | Per region + version: golden package → accepted validators → preserved report (with exact spec version) → lifecycle (replace/delete/append, revise) → reopen ZIP and re‑verify every checksum. |
| Validators (existing) | `server/services/ectd/external-validator/` | Seam for LORENZ eValidator (opt‑in) + a license‑free FDA‑criteria subset; feeds the dispatch gate. |
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

**Gated on procurement / environment (seams built, drop‑in ready):**
- **DTD/XSD validity** against the *licensed* ICH/FDA DTDs and the ICH RPS
  schema — the DOCTYPE/schema references and the `xml-validator` are in place;
  vendor the files into `assets/ectd-dtd/` (DTD) / `util/schema/` (RPS XSD).
- **Agency‑grade eValidator** (LORENZ) — the adapter + dispatch gate exist; wire
  the licensed engine behind them.
- **Live transmission** (FDA ESG / EMA CESP / PMDA / HC gateways) — real gateways
  exist and are gated behind the Part 11 human e‑signature; not exercised by
  qualification (generation ≠ transmission).

Qualification reports record the **exact spec version** each package was measured
against, so "compliant" is always scoped to a named, dated specification.
