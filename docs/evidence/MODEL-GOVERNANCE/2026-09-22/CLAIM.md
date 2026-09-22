# Claimed: model governance for high-risk drafting — 2026-09-22

**Row:** D4 (owed: "a PQ-passed provider for the model step"), via the DoD rule
"only PQ-passed models serve high-risk regulatory drafting".

**Directory set:** `server/services/ai-gateway/gateway.ts` (model selection and
the fallback ladder), `server/services/ai-governance/approved-models.ts`, their
tests. Another session touching these files today should read this first.

**Defect being fixed:** the approved-models registry says in prose which models
are not approved for high-risk regulatory drafting; nothing enforces it. The
fallback ladder, `cost_optimized`, `round_robin`, `explicit` and `task_based`
selection can each route `document_drafting` / `regulatory_review` to one of
them.

This file exists because `LAUNCH_DEFINITION_OF_DONE.md` assigns workstreams from
a playbook the repository does not contain, and two sessions built D4's
validation package in parallel on 2026-09-21 as a result. A claim pushed before
the work starts is the cheapest substitute. It is replaced by the evidence
README when the work lands.
