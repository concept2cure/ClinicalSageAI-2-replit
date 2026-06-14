# GA Readiness Audit — 03: Regulatory Compliance & Data Integrity (21 CFR Part 11 / GxP)

**Date:** 2026-06-14
**Scope:** `server/` and `services/` backend. 21 CFR Part 11 / GxP controls in code: audit trails, e-signatures, reason-for-change, immutability, governed exports, eCTD integrity, AI-content governance.
**Method:** Net-new source review. Tracing whether CODE enforces controls.

> Status: IN PROGRESS — written incrementally.

---

## Executive Summary

The platform has *substantial* compliance scaffolding: a SHA-256 hash-chained audit
log, an HMAC-sealed variant, DB immutability triggers, a daily chain-verify cron, a
retention job, governed-export CI checks, and e-signature tables. However, the
implementation is **fragmented across three mutually-incompatible audit subsystems**
that do not share a table, a hash chain, or a verifier — so the "tamper-evident audit
trail" is not end-to-end verifiable in practice. Critically, **audit writes are NOT
transactional with the actions they record** and **every audit failure is swallowed**,
meaning a regulated mutation can succeed with no durable audit record. These are
audit-trail completeness failures that would fail a Part 11 inspection.

**GA verdict: NOT READY (compliance/data-integrity dimension).**

---

## Findings

(populated below; updated incrementally)
