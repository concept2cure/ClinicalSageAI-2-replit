# Chapter 07 — 21 CFR Part 11 / Annex 11 and the compliance claims

**Verdict: the engineering is stronger than the paperwork, and the paperwork is what
regulators and enterprise buyers audit.**

This is an unusual and, for a buyer, favourable shape of problem — but it is decisive for
Gate G3, and one part of it is a live legal exposure at Gate G2.

---

## 7.1 What is genuinely built — and it is good

The tamper-evidence machinery here is real cryptography, not a `created_at` column relabelled
as an audit trail. Verified by reading the implementation:

**Two independent layers.**

1. **Public SHA-256 hash chain** — `server/services/audit/chain.ts`. Each entry hashes
   `{action, actor_id, target, payload_hash, occurred_at, previous}`. Critically,
   `computeAuditChain` issues its predecessor lookup as
   `SELECT … ORDER BY occurred_at DESC, id DESC LIMIT 1 **FOR UPDATE**` (`chain.ts:56-58`)
   **inside the caller's transaction**. That is anti-fork locking — it prevents two
   concurrent writers from both chaining off the same predecessor and silently branching the
   chain. Most implementations that call themselves hash chains do not do this.
2. **Secret-keyed HMAC-SHA256 seal** — `server/services/audit/audit-hmac-seal.ts`. The
   rationale is written down in `auditSealPosture.ts:1-14`: *"Because the hash algorithm is
   public, an attacker who can rewrite the whole table could recompute a self-consistent
   SHA-256 chain; the keyed seal is what makes forgery infeasible."* Correct threat model,
   correctly addressed.

**A fail-closed production boot matrix** (`auditSealPosture.ts:24-33`) — this is the detail
that separates real controls from theatre:

| Condition | Behaviour |
|---|---|
| Key present, ≥32 bytes | Boots, seals active |
| Key present but too short | **Refuses to boot** — no escape hatch |
| Key absent + `AUDIT_SEAL_ACCEPT_UNSEALED=true` | Boots with a prominent structured warning naming the accepted risk |
| Key absent, no flag | **Refuses to boot** |

Its header names the hole it closes: *"a production deploy that simply never set
`AUDIT_HMAC_KEY` would SILENTLY run with the tamper-evident guarantee disabled."*

**Supporting machinery, all present:** `audit-integrity-service.ts`,
`chainIntegrityMonitor.ts` (started at `server/startup/services.ts:237`, stopped cleanly at
`shutdown.ts:78`), `server/jobs/auditChainIntegritySweep.ts`, `signedAuditExport.ts`,
`audit-archive.service.ts`, `server/lib/tamper-proof-audit.ts` (632 lines), SIEM export at
`server/routes/admin/audit-siem.ts`. API-layer immutability via `applyImmutabilityPolicy` /
`isImmutableAuditPath` in `server/startup/middleware.ts:144-150`, which 403s any `DELETE` or
`*bulk-delete` under five Part-11 prefixes.

**A populated traceability matrix.** `docs/validation/TM-CORTEX-001-PART11-TRACEABILITY.md`
maps **12 controls (P11-01 … P11-12)** from regulation clause → implementing module path →
*named automated verification*. Example: P11-06 (§11.10(e), deletes of regulated records are
audited) → hard-delete plus `audit_events` insert in one transaction across four named route
files → verified by `scripts/ci/check-regulated-delete-audit.mjs`, which runs **blocking** at
`ci.yml:140`, plus contract tests. This is the artifact a regulator asks for, and it is
filled in rather than templated. Its "Open items (tracked, not yet closed)" section is
candid, including the admission that the delete→audit contract tests are *mocked* and a
DB-backed test is deferred.

**E-signature surface exists and is tested**: `server/routes/esignature.ts`,
`server/routes/part11-compliance.ts`, `server/services/part11/{signing-authority,resolve-signer-role}.ts`,
`server/services/compliance/signature-manifestation.ts`, an `electronic_signatures` table,
migrations `db/migrations/054_gcc_part11_audit.sql` and `080_gcc_21cfr_part11_compliance.sql`,
UI at `Part11SignModal.tsx` / `Part11Console.tsx`, and eight dedicated test files.

**Verified strength, in one sentence:** if a buyer's concern is "did they actually build
tamper-evident audit", the answer is yes, and better than most.

---

## 7.2 The system is not validated — G3 fails here, and not marginally

21 CFR Part 11 §11.10(a) requires **validation of systems** to ensure accuracy, reliability
and consistent intended performance. `docs/validation/` contains a complete, well-structured
protocol set: VMP, IQ, OQ, PQ, VSR, ISO 14971 risk analysis, HIPAA/FDA security assessment,
cloud vendor qualification, and the Part 11 traceability matrix.

**Every execution record is blank.** Counted mechanically (`☐`, `____`, `PENDING`, `____%`):

| Protocol | Unexecuted markers |
|---|---:|
| `OQ-CORTEX-001-OPERATIONAL_QUALIFICATION.md` | **158** |
| `IQ-CORTEX-001-INSTALLATION_QUALIFICATION.md` | **122** |
| `PQ-CORTEX-001-PERFORMANCE_QUALIFICATION.md` | **100** |
| `VSR-CORTEX-001-VALIDATION_SUMMARY_REPORT.md` | **99** |
| `CSRA-CORTEX-001-HIPAA_FDA_SECURITY_ASSESSMENT.md` | 66 |
| `VQ-CORTEX-001-CLOUD_VENDOR_QUALIFICATION.md` | 16 |

The Validation Summary Report — the document that would certify the system — reads:

```
**Version:** 1.0.0-DRAFT
**Status:** ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE
| 1.0.0-DRAFT | 2025-01-24 | Engineering | Initial draft | PENDING |
```

Its IQ/OQ/PQ approval checkboxes are unticked; `Executed By` lines are blank; overall
status is `☐ PENDING ____%`.

**So: the protocols are written and the system has never been qualified against them.** This
is not a code defect and cannot be fixed by engineering. It is a programme of work —
typically weeks of execution with a named validation owner, plus change control thereafter.
It is the single largest determinant of the G3 timeline.

## 7.3 The Part 11 controls that are built but not running

Three controls exist in code and are connected to no scheduler:

| Control | Evidence | Consequence |
|---|---|---|
| **Audit-chain verification** | `scripts/run-chain-verify.mjs` prescribes crontab entries in its own header (`30 2 * * *`, `0 4 * * 0`). `audit:verify:24h` and `audit:verify:full` are npm scripts; **no workflow and no in-repo scheduler invokes either.** | Tamper evidence is only evidence if someone checks it. Today that is an unwritten operator duty. |
| **Record retention** | `server/jobs/retentionCron.ts` has **no scheduler caller**; the only entry point is the manual CLI `server/bin/run-retention.ts`, which itself appears in `unreferenced-modules-baseline.json`. | §11.10(c) protection of records throughout the retention period is unenforced. The policy doc `docs/operations/audit-log-retention-policy.md` is marked *"Draft for compliance review."* |
| **Audit archival** | `audit:archive` — orphaned npm script. | Long-term retention to cold storage is manual. |

The in-process `chainIntegrityMonitor` and `auditChainIntegritySweep` **do** run (the sweep
defaults on in production when `AUDIT_TRAIL_ENABLED=true`), so this is a gap in the
scheduled/attestable verification layer rather than a total absence.

## 7.4 The signature-binding gap

`server/services/ai-actions/handlers/promote-artifact.ts:245-246` carries, in the code:

```
TODO(compliance): require electronic_signatures record … before flipping status to 'approved'
```

Artifact promotion to `approved` records an approver name, role and reason, but binds **no
`signatureId`, no `manifestHash`, and no `electronic_signatures` row**. Under §11.70,
signatures must be linked to their records such that they cannot be excised, copied or
transferred; under §11.50, the signed manifestation must carry printed name, date/time and
meaning. An approval that records only a name in a status field satisfies neither.

This one *is* a code defect and is fixable in days, not weeks. It should be fixed before any
qualification run, because qualifying the current behaviour would qualify the gap.

## 7.5 The claims register — where marketing outruns code

This is the part that is a **G2** problem, not just G3, because it is a representation made
to customers.

`SECURITY.md:39-52` states, unqualified:

| Claim | Verdict | Basis |
|---|---|---|
| *"21 CFR Part 11 compliant audit trails"* | ❌ **Unsupported** | The audit chain is real, but §11.10(a) requires validation and the system is unvalidated (§7.2). "Compliant" is not available as a word here. "Built to support Part 11 workflows" is. |
| *"SOC 2 Type II controls"* | ❌ **Unsupported** | No SOC 2 report, auditor, control matrix or observation window exists anywhere in the repository. The only occurrences are aspirational mentions in planning and competitive documents. A SOC 2 Type II claim without a report is the single most likely item to end an enterprise security review badly. |
| *"All data encrypted at rest (AES-256)"* | ⚠️ **Partially supported** | `server/services/security/field-encryption.ts` provides **field-level** encryption for specific fields. That is not whole-database encryption at rest, which is a property of the storage layer (e.g. RDS/Neon), not of this application. As written the claim overstates what this codebase provides. |
| *"ISO 14971 risk management"* | ⚠️ **Partially supported** | `RA-CORTEX-001-ISO14971_RISK_ANALYSIS.md` exists and there is a `risk` app, but the risk file is itself unexecuted in places. |
| *"HIPAA-ready data handling"* | ✅ **Supported, and correctly hedged** | "Ready" is the honest word. `server/utils/logger.ts:1-26` redacts HIPAA identifiers (`mrn`, `patient_id`, `subject_id`, `dob`, `ssn`) before Pino with a nested-key walker, plus `observability/redaction.ts` and a telemetry-redaction test. |
| *"Rate limiting on all endpoints"* | ⚠️ **Partially supported** | Rate limiting exists (`rateLimiter.ts`, `redisRateLimiter.ts`, referenced in 58 files) and is applied per-prefix, not universally. Also: when Redis is unavailable it silently degrades to in-memory, which is per-instance and therefore not a cluster-wide limit. |

**The team has already demonstrated it knows how to fix this class of error.**
`PRODUCT_READINESS_ASSESSMENT.md:99-103` documents blocker #7 — *"FDA 21 CFR Part 11
Compliant" on the live signup page* — resolved by softening to *"Built to support FDA
21 CFR Part 11 workflows."* That is exactly the right correction. **It was never applied to
`SECURITY.md`.**

This is a one-hour edit and it is the highest return-on-effort item in the entire audit.
Until it is done, the product is making two unsupported compliance representations in a file
named `SECURITY.md`, which is precisely where a customer's security reviewer will look
first.

## 7.6 GDPR / PHI / data residency

Better than expected, and worth crediting:

- **Log redaction is centralised and correct** — every log line passes `redactContext`
  *before* Pino, using a nested-key walker rather than Pino's fixed-path `redact.paths`.
- **AI residency is a first-class concept** — `.env.example` carries per-provider residency
  and zero-retention flags (`AI_BEDROCK_RESIDENCY=us`, `AI_VERTEX_RESIDENCY=us,eu`,
  `AZURE_OPENAI_RESIDENCY=us,eu`, `*_ZERO_RETENTION`), enforced in
  `server/services/ai-governance/approved-models.ts`.
- **GDPR services exist** — `gdprComplianceService.ts`, `globalComplianceEngine.ts`.

Two shipped defaults undercut it, and both are one-line changes:

- **`AI_PII_ENFORCEMENT=audit`** is the `.env.example` default — the PII gate *observes*
  rather than *blocks*. For a platform whose users paste clinical narratives, the default
  should be `block`.
- **`OPENAI_ZERO_RETENTION=false` and `ANTHROPIC_ZERO_RETENTION=false`** are the shipped
  defaults. Unless the operator has a BAA/ZDR contract and flips these, customer regulatory
  content is retained by the provider under standard terms.

---

## 7.7 What this means for the gates

| Gate | Status on compliance grounds |
|---|---|
| **G1 · External pilot** | **Not blocked by Part 11.** Non-regulated data does not require validation. The `SECURITY.md` overclaims should still be corrected before external eyes see the repo. |
| **G2 · Paying commercial** | **Blocked, cheaply.** The unsupported "SOC 2 Type II" and "Part 11 compliant" claims are a contractual and security-review exposure. Cost to clear: hours. |
| **G3 · GxP / submission-grade** | **Blocked, expensively.** Requires: executing IQ/OQ/PQ with a named validation owner and signed VSR; binding e-signatures in `promote-artifact.ts`; scheduling audit-chain verification, retention and archival; closing the traceability matrix's own open items (PDF/A conformance, DB-backed delete→audit test); and a real SOC 2 engagement if that claim is to be kept. Cost to clear: months, mostly non-engineering. |

The encouraging read for a buyer: **none of the G3 gap is architectural.** The hard part —
building tamper-evident audit that survives scrutiny — is done and done well. What remains is
qualification, scheduling and honest wording, which is the recoverable failure mode.
