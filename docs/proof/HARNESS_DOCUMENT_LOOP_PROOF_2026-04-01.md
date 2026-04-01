# Harness Document Loop Proof (2026-04-01)

## 1) Biotech RI flow

- Route/path: `POST /api/concept2cure/conversations/:conversationId/promote`
- originSurface: `ri_copilot` (enforced in route)
- clientTrack: resolved from context (default `biotech` unless provided)
- submissionProgram: resolved from request metadata/body (default `general_ri`)
- persona: resolved from request (`regulatory` default)
- documentClass: resolved from promoted type + heuristics
- placement: resolved via `resolvePlacementTarget()` using workspace/document semantics
- gate checks: structured export checks now attached in `contract.exportEligibility.gateChecks`
- governed artifact consequence: **yes** (artifact insert blocked on invalid contract)
- provenance/audit consequence: existing provenance insert remains; contract metadata embedded in artifact metadata
- compare/version/approval: version baseline v1 preserved; approval defaults resolved by persona/rules

## 2) Biotech eCTD/IND flow

- Route/path: `POST /api/concept2cure/projects/:projectId/artifacts`
- originSurface: request-driven, now supports `ectd_coauthor` / `ind_workspace`
- clientTrack/program/persona/regulator/documentClass/readiness: accepted on schema + resolved centrally
- placement: no longer hardcoded to project; dossier/vault supported through workspace target + container IDs
- gate checks: explicit check set generated and included in contract resolution
- governed artifact consequence: **yes** (create blocked on governed validation failure)
- provenance/audit: existing route-level provenance + audit remains active

## 3) Biotech CMC → Module 3 flow

- Route/path: `POST /api/concept2cure/projects/:projectId/artifacts` with `originSurface=cmc_workspace`
- documentClass: `module3_output` supported and semantically governed
- required behavior enforced:
  - CTD 3.x mapping (`module3_output` requires `ctdSection` under `3.x`)
  - `sourceRefs` required by validator/rules
  - dossier-target expectation at submission candidate gate
- tests: `server/services/__tests__/governedDocumentContractService.test.ts` includes dossier/module3 case

## 4) Device flow (510k/PMA/CER-adjacent)

- Route/path: same governed create/update routes with `clientTrack=device`
- rule pack behavior:
  - 510(k) submission component requires predicate context semantics
  - PMA stricter review path outside exploratory
  - CER adds clinical lineage expectation
- tests: `server/services/__tests__/governedRuleResolver.test.ts` validates disallowed combinations

## 5) Diagnostics/regional flow

- Status: **partially viable in harness authority**
- Supported in semantics/rules:
  - diagnostics track
  - IVDR/regional programs
  - `regional_differences` class
  - multi-region logic expectation when `regulatorScope=multi`
- Missing substrate:
  - no dedicated diagnostics route-level flow rewired in this iteration
  - no diagnostics UI journey proof captured in this patch

## 6) Blocked export example

- `inspection_ready` with missing provenance provider/model now fails contract validation.
- `module3_output` without `3.x` mapping is blocked.
- Structured output includes:
  - `allowed`
  - `gateChecks`
  - `blockingReasons`
  - `warnings` (via validation/rules)
  - `readinessOutcome`

## 7) Compare/provenance/audit lifecycle proof

- Compare/version:
  - artifact update path keeps immutable version insertion (`concept2cureArtifactVersions`)
- Provenance:
  - create/update/promote flows keep provenance event insertion
- Audit:
  - create/update/audit export continue to call `logAuditEntry`

## 8) Approval/lock/signature-aware proof

- Harness now resolves approval defaults by:
  - document semantics default
  - persona overlay
  - readiness gate escalation
- Existing lock/signature systems remain in route code; this iteration did not alter signature endpoint logic.
