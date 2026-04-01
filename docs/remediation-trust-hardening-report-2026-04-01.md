# Trust Hardening Remediation Report (April 1, 2026)

## Scope
This sprint addressed high-impact integrity gaps where simulated or fail-open behavior could be interpreted as production-truthful governance.

## Findings and Remediations

### 1) Part 11 electronic signature password verification (Critical)
- **Issue:** Signature flow accepted any password with minimum length and then marked `passwordVerified: true`.
- **Fix:** Added real credential verification against `users.password_hash` with bcrypt comparison; rejects empty/legacy temp hashes.
- **Result:** Signatures are now only persisted with `passwordVerified=true` when cryptographic verification succeeds.

### 2) Regulatory intelligence compliance scoring endpoint (High)
- **Issue:** Endpoint emitted simulated compliance score values with authoritative shape.
- **Fix:** Disabled endpoint with explicit HTTP 501 response and governed-mode rationale.
- **Result:** Simulated scoring is no longer exposed as operational truth.

### 3) AnA/RIM signal wiring mismatch (High)
- **Issue:** Enrichment paths treated RIM signal summary as a list and called `getProjectSignals` with wrong argument shape.
- **Fix:** Updated call sites to pass `(organizationId, projectId)` and consume `SignalSummary` fields (`totalSignals`, `overallTrend`, etc.).
- **Result:** Context now reflects live summary metrics rather than broken/list-shaped assumptions.

### 4) Notification route mock behavior in production (High)
- **Issue:** Email path always returned mock-success behavior; protocol details returned hardcoded mock payload.
- **Fix:** Mock email send is refused in production unless explicitly overridden; protocol lookup throws in production and marks non-prod payload as simulated.
- **Result:** Production environment no longer silently pretends notification delivery or protocol truth.

### 5) Tenant/org default fallback in governance/readiness paths (High)
- **Issue:** Multiple authoring-action routes defaulted tenant/org context to `1` or `'default'`.
- **Fix:** Replaced with strict tenant requirement (`requireTenantId`) and propagated actual org ID through readiness/contradiction calls.
- **Result:** Governed/readiness actions now require scoped tenant context and do not silently mis-scope operations.

## Remaining Work
- Client mock/simulated regulatory surfaces still require truth-in-UI labeling and/or production gating.
- Extend export governance fail-closed enforcement to all remaining export routes (started in this sprint for study bundle + IVDR classification report).
- Add CI guardrails: no simulated scoring/mock responses in production route handlers.
