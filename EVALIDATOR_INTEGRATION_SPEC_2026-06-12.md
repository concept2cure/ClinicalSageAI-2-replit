# External eValidator Integration Spec

**Date:** 2026-06-12
**Audit gap:** P0-4 (no external eValidator dry-run before live submission)
**Status:** Design spec — implementation pending vendor selection
**Companion:** `DOCUMENT_PLATFORM_AUDIT_2026-06-12.md`, `HI_8_ECTD_SCOPING_BRIEF.md` (G3, Phase E)

## The gap

The platform validates eCTD packages with **internal** validators only — `server/services/ectd/ectd4-validator.ts` (structural: 2-6-2 filenames, MD5 format, lifecycle ops, completeness) and `server/services/ectd/ectd-regional-rules.ts` (FDA/EMA/PMDA size and naming limits). These are real and necessary, but they are **not** the validator the agency runs. FDA's Electronic Submission Gateway runs **LORENZ eValidator** against FDA's published *Specifications for eCTD Validation Criteria*; EMA and other regions validate similarly. A package that passes our internal checks can still be rejected at the gateway on a rule we don't model.

The audit's requirement: **an external eValidator dry-run must gate dispatch** — no production transmit until the package passes the same validator class the agency uses, at the severity the agency enforces.

This is a vendor-integration task: the validator engines (LORENZ eValidator, and the FDA criteria they implement) are **commercial/licensed**, like the eCTD DTDs. This spec defines the seam so the engine drops in behind a stable interface, exactly as `dtd-bundler.ts` and `pdfa-readiness.ts` were built as code gates around procurement artifacts.

## Where it plugs in (existing seams)

The dispatch gate is already designed for this. `server/services/ectd/dispatch-gate.ts` exposes the pure, provable rule:

```
evaluateDispatchGate({ validationErrors, unacknowledgedShadowCriticals }) → { cleared, blockers }
```

and `server/services/ectd/assess-dispatch-readiness.ts` (`assessSequenceDispatchReadiness`) is the DB-backed wrapper that already counts error-severity findings and feeds them into that gate. **The external validator's error count must flow into the same `validationErrors` input.** No new gate is needed — the existing one becomes authoritative once it is fed real agency-grade findings.

The packager already emits an unzipped tree (`emitUnzipped` in `regional-packager.ts`) precisely so a validator can walk the folder structure. That is the artifact the external validator runs against.

## Proposed interface

Mirror the gateway abstraction (`submission-gateways/types.ts`) and the graceful, fail-closed pattern of the PDF/A and DTD gates.

```ts
// server/services/ectd/external-validator/types.ts
export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ExternalValidationFinding {
  ruleId: string;              // e.g. 'FDA-1734'
  severity: ValidationSeverity;
  message: string;
  leafHref?: string;           // package-relative path the finding is about
  criterion?: string;          // citation into the agency criteria doc
}

export interface ExternalValidationReport {
  validator: string;           // 'lorenz-evalidator' | 'fda-evalidator' | ...
  profile: string;             // validation profile / region, e.g. 'FDA eCTD 3.2.2'
  ranAt: Date;
  findings: ExternalValidationFinding[];
  errorCount: number;          // findings with severity 'error'
  warningCount: number;
  passed: boolean;             // errorCount === 0
}

export interface ExternalValidator {
  readonly name: string;
  /** True when the engine binary/endpoint + license are configured. */
  isConfigured(): Promise<boolean>;
  /** Validate an unzipped package directory against a region profile. */
  validate(args: { packageDir: string; region: 'fda' | 'ema' | 'pmda'; profile?: string }):
    Promise<ExternalValidationReport>;
}
```

### Adapters

- **`LorenzEValidatorAdapter`** — the primary target. LORENZ eValidator runs as a CLI/automation engine (used by FDA CDER/CBER, Health Canada, TGA, NMPA). The adapter shells to the engine (path via `EVALIDATOR_BINARY`) or calls its automation endpoint, points it at the unzipped package, selects the region profile, and parses its report (XML/JSON) into `ExternalValidationReport`. Licensed — fails `isConfigured()` when absent, never silently passes.
- **`FdaCriteriaValidatorAdapter`** (optional, no-license fallback) — encodes a curated subset of FDA's published *Specifications for eCTD Validation Criteria* (the quarterly-updated rule list) as deterministic checks for the highest-severity rules we can implement ourselves. This is a stopgap that raises the floor without a license; it is explicitly NOT a substitute for the agency validator.

### Severity mapping (authoritative)

Follow the agency model exactly: **error ⇒ hard block** (gateway rejection in real life), **warning ⇒ advisory** (surfaced, not blocking), **info ⇒ logged**. The adapter maps each engine's native severity onto this triple; only `error` increments the count that feeds `evaluateDispatchGate`.

## Wiring into dispatch readiness

In `assessSequenceDispatchReadiness`:

1. After assemble (`emitUnzipped: true`), run the configured `ExternalValidator.validate()` on the package directory.
2. Add `report.errorCount` to the existing `validationErrors` total before calling `evaluateDispatchGate`.
3. Persist the `ExternalValidationReport` on the sequence (new `submission_validation_reports` row) for audit and UI.
4. **Fail-closed, opt-in for production:** when `ECTD_REQUIRE_EVALIDATOR=true` and `isConfigured()` is false, treat an un-run external validation as a blocker for a production dispatch (you cannot prove the package passes the agency validator). Default (flag unset / staging) is advisory, consistent with the PDF/A and DTD gates.

This makes the three submission-grade gates uniform and composable:

| Gate | Module | Env flag | Blocks (production) when |
| --- | --- | --- | --- |
| PDF/A | `ectd/pdfa-readiness.ts` | `ECTD_REQUIRE_PDFA` | a PDF leaf is not PDF/A-1b |
| DTD self-containment | `ectd/dtd-bundler.ts` | `ECTD_REQUIRE_DTD` | a referenced DTD is not bundled |
| External eValidator | `ectd/external-validator/*` (this spec) | `ECTD_REQUIRE_EVALIDATOR` | the agency-grade validator reports an error, or could not run |

## Configuration & licensing

- `EVALIDATOR_BINARY` / `EVALIDATOR_ENDPOINT` — engine location.
- `EVALIDATOR_PROFILE_<REGION>` — validation profile id per region (profiles track the agency's quarterly criteria refreshes).
- `ECTD_REQUIRE_EVALIDATOR` — opt-in production enforcement.
- The engine + criteria are **commercial**; procurement note belongs alongside the DTD note in `assets/ectd-dtd/README.md`. Document the chosen vendor and license in a runbook (`docs/runbooks/evalidator-setup.md`).

## Phased implementation

1. **Interface + DB** — `ExternalValidator` types, `submission_validation_reports` table, no-op default adapter (`isConfigured()` false). Pure, testable; no license needed.
2. **Dispatch wiring** — feed `errorCount` into `assessSequenceDispatchReadiness` → `evaluateDispatchGate`; add `ECTD_REQUIRE_EVALIDATOR` fail-closed. Tests with a stub adapter returning seeded findings.
3. **LORENZ adapter** — shell/endpoint integration + report parsing, behind the license. Integration-tested against a known-good and known-bad package.
4. **FDA-criteria fallback adapter** (optional) — deterministic high-severity subset for license-less environments.

## Verification

- Unit: severity mapping, `errorCount` → gate blocking, fail-closed when unconfigured + required.
- Integration: a deliberately malformed package (bad 2-6-2 name, missing leaf) yields `error` findings and a blocked dispatch; a clean package clears.
- End-to-end: assemble → external validate → dispatch-readiness → (blocked|cleared), with the report persisted and surfaced.

## Sources

- [LORENZ eValidator](https://www.lorenz.cc/Solutions/eValidator/) and [validation profiles](https://www.lorenz.cc/Solutions/eValidator-five/validation-profiles/)
- [FDA Specifications for eCTD Validation Criteria](https://www.fda.gov/media/87056/download) and [eCTD v4.0 validation criteria](https://www.fda.gov/media/179723/download)
- [FDA eCTD Submission Standards (v4.0 & Regional M1)](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/ectd-submission-standards-ectd-v40-and-regional-m1)
