# Validation plan — launch catalog

**Document ID:** VP-LAUNCH-001
**Status:** draft for review and signature
**Scope:** the six launch applications defined in `shared/constants/launch-scope.ts`
**Companion rule:** `docs/LAUNCH_DEFINITION_OF_DONE.md` row **D4**

> This is the one document in the package that is written rather than generated,
> because a plan is a commitment and not an observation. Everything it commits to
> is produced by `scripts/ops/generate-validation-package.mjs` and enforced by
> `npm run ci:validation-traceability`. If this plan and those scripts ever
> disagree, the scripts are what actually runs, and the disagreement is a defect
> in this document.

---

## 1. Purpose

To establish that the launch catalog is fit for its intended use — the
preparation, review, approval and transmission of regulated regulatory
submissions and the controlled documents that support them — and to produce the
evidence a sponsor's quality unit or an inspector would ask to see.

## 2. What is in scope

The six applications that are on by default for a new organisation
(`LAUNCH_APPS` in `shared/constants/launch-scope.ts`):

| App | Intended use in one line |
|---|---|
| Projects | The regulatory programme and its filings, tasks and journey. |
| Vault | The controlled store for source and generated documents. |
| Authoring | Drafting, review and approval of regulatory content. |
| Submission Center | Assembly, publishing and transmission of a sequence. |
| Submission Readiness | Whether a sequence may be dispatched, and why not. |
| QMS controlled documents | Controlled documents and their lifecycle. |

Every other surface is behind the launch-scope flag and is off in production
(row D2). **Surfaces that are off are out of scope for this validation**, and a
surface cannot be turned on in production without entering this plan first.

### Explicitly out of scope

- The regulatory digital twin, the epistemic / causal / self-evolving engines,
  federated learning and the manufacturing digital twin. They are in the tree
  behind flags, they are off, and they are unvalidated.
- Performance qualification under production load with real data (see §8).
- The hosting environment itself, which is qualified by row **D1** and recorded
  by `node scripts/ops/ga-readiness-report.mjs`.

## 3. Regulatory basis, stated honestly

The binding requirements are **21 CFR Part 11** (electronic records and
signatures) and **EU GMP Annex 11**. **GAMP 5 (2nd ed.)** is the framework.

This package is *CSA-aligned in method*: it follows FDA's Computer Software
Assurance guidance in deciding assurance effort from the consequence of a
specific function failing, and in taking credit for automated and unscripted
testing rather than re-scripting it by hand.

Two things that would be an overstatement, and are therefore not claimed:

1. That guidance is scoped to **device production and quality-system software**
   and does not modify Part 11. This system is not that class of software.
   Borrowing the method is a deliberate choice; it is not a compliance claim.
2. The **edition** of the guidance applicable at the date of signature is for
   the signer to confirm. This document deliberately does not pin one.

## 4. System classification

GAMP category **5** (configured product with bespoke components). The platform
is developed in-house, and several launch surfaces decide governed outcomes —
who may sign, what may be dispatched, what is recorded — which is bespoke
behaviour, not configuration.

**AI components.** Where an application uses a model, the governed rule stated
in `CLAUDE.md` Rule 2 applies: *numbers, verdicts and governed content come from
deterministic engines; the model narrates.* A requirement whose outcome is a
figure or a verdict is therefore verified against the engine, never against a
model response. Model governance itself — the approved-models registry, the
pinned versions, the placement approvals — is qualified separately under
`docs/ai-governance/` and is referenced here rather than restated.

## 5. Approach

### 5.1 Requirements

A **User Requirements Specification** exists per launch app. Requirements live
as data in `docs/validation/launch/urs-registry.json`, and the URS documents are
rendered from it. Each requirement carries its intended use, the failure mode it
guards against, its CSA impact, its assurance level, the code that implements it
and the artifacts that verify it.

Requirements are written against behaviour that the code implements **today**.
A surface that is a stub or a placeholder does not get a requirement claiming it
works; it is recorded as out of scope until it does something.

### 5.2 Risk and assurance effort

| Impact | Meaning | Minimum assurance |
|---|---|---|
| `direct` | The software itself affects the integrity, authenticity or content of a regulated record, or decides who may act on one. | Never `low`. |
| `indirect` | Supports that work without producing the record. | Proportionate. |

| Assurance | Satisfied by |
|---|---|
| high | an integration or end-to-end test — never inspection or a unit test alone |
| medium | a unit test or stronger |
| low | inspection or stronger |

These are not aspirations in prose. `scripts/ci/check-validation-traceability.mjs`
refuses a registry that violates any of them, and its `--self-test` demonstrates
each refusal on a constructed case.

### 5.3 Qualification

| Stage | How it is performed | Where the evidence lands |
|---|---|---|
| **IQ** | `node scripts/ops/generate-iq-oq-pack.mjs` observes the runtime, the migration set, the toolchain and the posture variables actually present. | `docs/validation/IQ_OQ_EVIDENCE_PACK.md` |
| **OQ — platform Part 11 controls** | The same generator executes the suites that exercise OQ-01 … OQ-11 and records what they returned. | `docs/validation/IQ_OQ_EVIDENCE_PACK.md` |
| **OQ — launch-app requirements** | `node scripts/ops/generate-validation-package.mjs --run` executes each requirement's cited verification: vitest for unit and integration, and a real Chromium through Playwright against a booted application for the browser tier. | `docs/validation/launch/` |
| **PQ** | Out of scope here; see §8. | — |

The browser tier boots the application through the helpers in
`scripts/run-e2e-smoke.mjs` — the same recipe the repository already uses for
its authenticated smoke, rather than a second one that could drift from it.

### 5.4 Traceability

`TM-LAUNCH-001` is generated from the registry, one row per requirement, method
and verifying artifact, carrying the result observed at generation time. It is
not maintained by hand, and a citation that stops resolving fails CI rather than
emptying a cell.

## 6. Acceptance criteria

The package is **COMPLETE** only when every requirement in the registry has at
least one verification that was **executed** and **passed** in the same run, and
none that failed. Anything else renders **INCOMPLETE** and lists what is
outstanding. A generator that could only ever report COMPLETE would evidence
nothing, so the failing path is exercised deliberately and appears in the
evidence folder for this row.

Results carry four values and only four: `PASS`, `FAIL`, `ERROR` (the
verification could not be started — an absent observation, never a pass and
never a finding), and `NOT EXECUTED`.

## 7. Roles

| Role | Responsibility | Who |
|---|---|---|
| System owner | Owns the requirements and the intended-use statements; signs VSR-LAUNCH-001. | Founder |
| Independent reviewer | Reviews the evidence against the requirements and signs. Must not be the author of the code under review. | A qualified contractor (row D4) |
| Author / executor | Writes the requirements, the tests and the generators; executes the runs. | Engineering (including AI sessions, under `CLAUDE.md`) |

**What a machine cannot do, and does not claim to.** No generator establishes
that a requirement is *true* of the code, or that a cited test genuinely
exercises it. That is the reviewer's judgement, and every generated document
says so in its own header rather than implying a machine performed the review.
`inspection` is likewise recorded as NOT EXECUTED by the generator, because it
is a human act and recording it otherwise would assert a review nobody did.

## 8. What this plan does not cover

- **Performance qualification.** Load, concurrency and real-data behaviour
  against a real deployment. Blocked on row D1 and planned separately.
- **The hosting environment.** Row D1; `ga-readiness-report.mjs`.
- **Tenant isolation against a production image.** Row D3.
- **Licensed artefacts and agency credentials.** Rows D5 and D7;
  `submission-preflight.mjs`.
- **Supplier qualification** of the cloud and model providers. Existing
  `docs/validation/VQ-CORTEX-001-CLOUD_VENDOR_QUALIFICATION.md` covers the
  cloud provider and is not superseded by this plan.

## 9. Maintaining the validated state

- Change control follows `docs/RELEASE_GOVERNANCE.md`.
- `npm run ci:validation-traceability` runs on every push. A change that deletes
  or renames a cited test breaks the build with the requirement id that lost its
  evidence.
- `npm run pack:validation:run` is re-executed, and the regenerated package
  re-reviewed, before a release that touches a launch app.
- A new requirement, or a change to an existing one, is a change to this plan's
  scope and is reviewed as such.

## 10. Relationship to the existing `*-CORTEX-001-*` documents

`docs/validation/` contains an earlier validation set (`VMP-CORTEX-001`,
`IQ-CORTEX-001`, `OQ-CORTEX-001`, `VSR-CORTEX-001`, and others). Those documents
are dated 2025-01-24, are marked DRAFT, name a different product, and predate
the launch catalog entirely. **They are not evidence for row D4** and are not
cited by anything this plan produces.

They are left in the tree rather than deleted because two of them —
`VQ-CORTEX-001` (cloud vendor qualification) and
`CSRA-CORTEX-001` (security assessment) — cover ground this plan does not, and
deleting them would lose that work. Their disposition is a decision for the
signer of this plan, recorded here so it is not silently inherited.

## 11. Approval

| Role | Name | Signature | Date |
|---|---|---|---|
| System owner | | | |
| Independent reviewer | | | |
