# External eValidator Integration Spec

**Date:** 2026-06-12
**Audit gap:** P0-4 (no external eValidator dry-run before live submission)
**Status:** Resolver, CLI/HTTP adapter, internal subset and dispatch seam implemented; actual vendor/profile/package qualification remains owed. The 2026-10-14 classification contract is recorded under `docs/evidence/D7-EXTERNAL-VALIDATOR-CLASSIFICATION/2026-10-14/`.
**Companion:** `GA_GAP_AUDIT_2026-06-10.md`, `HI_8_ECTD_SCOPING_BRIEF.md` (G3, Phase E)

## The gap

The platform has internal structural/region checks and an external-validator adapter seam. Internal checks are necessary but do not establish independently qualified regional validation. FDA publishes the tool and dated criteria in use for CDER/CBER eCTD; independent pre-submission validation should use a qualified tool/profile covering the applicable region, format and requirements. A local technical pass does not guarantee agency acceptance.

The audit's requirement: **when external validation is required, its result must gate dispatch**. Internal subset checks cannot satisfy that requirement. Production dispatch with `ECTD_REQUIRE_EVALIDATOR=true` needs an executed, coherent report matching the selected external engine. This classification gate does not itself establish the separate tool/profile/package qualification requirement.

The selected vendor engine may require a commercial licence. Regulator validation criteria are published; retain their source/version and observe the terms of each supplied asset. Procurement, correct profile/criteria selection and qualification remain separate from implementing the adapter.

## Where it plugs in (existing seams)

The dispatch gate is already designed for this. `server/services/ectd/dispatch-gate.ts` exposes the pure, provable rule:

```
evaluateDispatchGate({ validationErrors, unacknowledgedShadowCriticals }) → { cleared, blockers }
```

and `server/services/ectd/assess-dispatch-readiness.ts` (`assessSequenceDispatchReadiness`) is the DB-backed wrapper. It composes the existing external-validation gate with structural, Shadow Review and release-signature gates. External error counts and assessment status are reported separately; required production validation errors block through that external gate. Advisory external errors remain visible without changing the existing opt-in policy.

The packager already emits an unzipped tree (`emitUnzipped` in `regional-packager.ts`) precisely so a validator can walk the folder structure. That is the artifact the external validator runs against.

## Implemented interface and classification contract

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
  ran: boolean;               // declared execution, distinct from a qualifying external run
  findings: ExternalValidationFinding[];
  errorCount: number;          // findings with severity 'error'
  warningCount: number;
  passed: boolean;             // errorCount === 0
}

export interface ExternalValidator {
  readonly name: string;
  readonly kind: 'external_engine' | 'internal_subset' | 'unavailable' | 'unknown';
  /** Configuration discovery only; not licence, provider or profile qualification. */
  isConfigured(): Promise<boolean>;
  /** Validate an unzipped package directory against a region profile. */
  validate(args: { packageDir: string; region: 'fda' | 'ema' | 'pmda'; profile?: string }):
    Promise<ExternalValidationReport>;
}
```

### Adapters

- **`LorenzEValidatorAdapter`** — the existing external-engine integration target. The adapter invokes a configured CLI or HTTP endpoint and parses XML/JSON findings. `isConfigured()` discovers a URL/path; it does not verify a licence, provider identity, completion or qualified profile. Those claims need actual pinned-runtime and package/report evidence.
- **`FdaCriteriaValidatorAdapter`** (optional, no-license fallback) — encodes a curated subset of FDA's published *Specifications for eCTD Validation Criteria* (the quarterly-updated rule list) as deterministic checks for the highest-severity rules we can implement ourselves. This is a stopgap that raises the floor without a license; it is explicitly NOT a substitute for the agency validator.

### Severity mapping (authoritative)

The platform maps findings to error/warning/info. Under the required-production external gate, coherent error findings block; warnings remain visible and info is retained. Qualify the mapping against the pinned profile and applicable regulator disposition rules. This local mapping is not a prediction of every authority's decision. Unknown/unreadable executed-report findings cannot be treated as a clean result.

## Wiring into dispatch readiness

In `assessSequenceDispatchReadiness`:

1. Materialize and validate the exact package through the existing adapter; this DB-bound assessor cannot invoke a validator without a package directory. A caller supplies an already-run report; absence is not a pass.
2. Pass the selected server adapter's explicit kind/name, actual configuration outcome and report through `evaluateExternalValidationGate`. Unknown/internal adapters and missing, invalid or identity-mismatched reports cannot clear required production validation. An external report is checked for execution/pass/count coherence.
3. Return raw execution, qualifying execution, selected/reported identity, error count and factual assessment status through the canonical assessor. A nonblocking advisory failure must remain a failure in the existing views and deterministic QC explanation.
4. Reuse retained compilation report import/history and existing package owners for future authenticity, engine/profile/criteria version and exact package hash receipts. No new report table or schema is introduced by the classification slice. Imported parseable JSON alone does not prove external execution or qualification.
5. Default flag-unset/staging behavior remains advisory. Subset/absent checks show not assessed by an external engine; actual failed or invalid external reports show their factual outcome separately from policy clearance. Structural, Shadow Review and signing gates retain their own blockers.

This makes the three submission-grade gates uniform and composable:

| Gate | Module | Env flag | Blocks (production) when |
| --- | --- | --- | --- |
| PDF/A | `ectd/pdfa-readiness.ts` | `ECTD_REQUIRE_PDFA` | a PDF leaf is not PDF/A-1b |
| DTD self-containment | `ectd/dtd-bundler.ts` | `ECTD_REQUIRE_DTD` | a referenced DTD is not bundled |
| External eValidator | `ectd/external-validator/*` (this spec) | `ECTD_REQUIRE_EVALIDATOR` | no qualifying matched external run, invalid/inconsistent report, or external validation errors |

## Configuration & licensing

- `EVALIDATOR_BINARY` / `EVALIDATOR_ENDPOINT` — engine location.
- `EVALIDATOR_PROFILE_<REGION>` — validation profile id per region; pin dated criteria/tool support and review changes rather than assuming a fixed refresh schedule.
- `ECTD_REQUIRE_EVALIDATOR` — opt-in production enforcement.
- Document the chosen vendor, licence terms where needed, pinned tool/profile/criteria revisions and qualification evidence in the runbook. Published regulatory criteria are distinct from commercial tool licensing.

## Historical planned phases and remaining qualification

1. **Interface + DB** — `ExternalValidator` types, `submission_validation_reports` table, no-op default adapter (`isConfigured()` false). Pure, testable; no license needed.
2. **Dispatch wiring** — feed `errorCount` into `assessSequenceDispatchReadiness` → `evaluateDispatchGate`; add `ECTD_REQUIRE_EVALIDATOR` fail-closed. Tests with a stub adapter returning seeded findings.
3. **LORENZ adapter** — shell/endpoint integration + report parsing, behind the license. Integration-tested against a known-good and known-bad package.
4. **FDA-criteria fallback adapter** (optional) — deterministic high-severity subset for license-less environments.

The resolver, adapter wrappers, subset, compilation report import and assessor seam are now retained implementations. The historical new-table proposal above is not authority to add a duplicate report store. Actual qualified runtime/criteria/profile/package binding and authorised channel evidence remain release work, not inferred from those phases or a local pass.

## Verification

- Classification regression: the real resolver's clean internal subset must refuse a required-production external gate, while remaining an internal advisory result. Missing/unknown class, different engine, malformed counts/pass/severity, and unrun operational error must not become an external pass. Coherent external failures remain failed even when policy is advisory.
- Unit: severity mapping, `errorCount` → gate blocking, fail-closed when unconfigured + required.
- Integration: a deliberately malformed package (bad 2-6-2 name, missing leaf) yields `error` findings and a blocked dispatch; a clean package clears.
- End-to-end: assemble → external validate → dispatch-readiness → (blocked|cleared), with the report persisted and surfaced.

The classification patch is component/assessor/presentation evidence. It does not qualify tolerant XML parsing, CLI completion, service identity/licensing, profile coverage, package/report binding or actual agency submission. A genuine authorised test acknowledgement and sponsor-controlled release remain separate D7 evidence.

## Sources

- [LORENZ eValidator](https://www.lorenz.cc/Solutions/eValidator/) and [validation profiles](https://www.lorenz.cc/Solutions/eValidator-five/validation-profiles/)
- [FDA Specifications for eCTD Validation Criteria](https://www.fda.gov/media/87056/download) and [eCTD v4.0 validation criteria](https://www.fda.gov/media/179723/download)
- [FDA eCTD Submission Standards (v4.0 & Regional M1)](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/ectd-submission-standards-ectd-v40-and-regional-m1)
- [FDA eCTD v3.2.2 validation tool/criteria table](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/ectd-submission-standards-ectd-v322-and-regional-m1)
- [FDA submission, testing and sample-submission distinctions](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/submit-using-ectd)
