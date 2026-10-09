# POLICY-AI-008 — AI-Use Disclosure (DRAFT)

**Owner:** Founder. **Audience:** tenants, their regulators, Anthropic (as the
model provider). **TSC:** CC2.3.

## 1. What the AI does and does not do in Concept2Cure
- The platform's regulatory truth — packaging, validation, conformance checks,
  clocks, sample-size solvers, rule packs — is deterministic code. Language
  models **draft, frame and explain**; they do not produce numbers, verdicts or
  governed content on their own (`CLAUDE.md` Rule 2; `docs/LAUNCH_DEFINITION_OF_DONE.md`).
- Every governed action (freeze, sign, dispatch, approve) is performed by an
  identified, re-authenticated human (`server/services/part11/reverify-signer.ts`)
  and recorded in a hash-chained, HMAC-sealed audit trail. **No AI output is
  filed with a regulator without a human signature.**

## 2. Anthropic's usage policy — high-risk use categories
Anthropic's Usage Policy identifies high-risk domains (including healthcare and
legal/regulatory decisions) where **additional safeguards are required**: human
oversight of consequential decisions, disclosure to end users that AI is
involved, and no use of the model as the sole decision-maker. This policy is how
Concept2Cure meets those requirements. (Consult the current policy text at
anthropic.com before relying on this summary.)

| Requirement | How met | Status |
|---|---|---|
| Human-in-the-loop for consequential decisions | governed actions require a human signature; the model cannot sign | **Implemented** |
| Disclosure that AI was used | draft provenance is recorded per section (`server/services/document-intelligence`, provenance events in `server/routes/c2c/artifacts.ts`); an in-product notice on AI-drafted content | **Partial** — provenance implemented; a uniform user-facing notice on every AI-drafted surface is not verified |
| Qualified professionals review outputs | tenant's regulatory users; roles enforced (`signing-authority.ts`) | **Implemented** |
| No medical advice to patients; no diagnosis | the product has no patient-facing surface | **Implemented** (by scope) |
| Groundedness and PII screening | `AI_GROUNDEDNESS_ENFORCE`, `AI_PII_ENFORCEMENT` (`server/startup/ai-governance-posture.ts`) | **Implemented** (defaults visible at boot) |
| Model choice is governed, not marketed | approved-models registry with pinned versions and eval references | **Implemented** |

## 3. Disclosure to tenants (to appear in the pilot agreement and in-product)
> Concept2Cure uses large language models, including Claude by Anthropic, to
> draft and explain regulatory content. Every figure, validation result and
> compliance verdict shown in the product is produced by deterministic software,
> not by the model. AI-drafted text is marked as such in the document's
> provenance record, must be reviewed by a qualified user, and is filed only
> after that user applies an electronic signature that re-verifies their
> identity. Your content is sent to the model provider under the placement,
> residency and retention terms selected on your order form (see
> POLICY-DR-007), and is not used to train the provider's models.

Status of the disclosure: **Implemented** as text; **Planned** in the pilot
agreement (row D9) and as a first-run notice in the product.

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |
