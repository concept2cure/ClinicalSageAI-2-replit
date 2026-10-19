# AI, authoring and feedback audit outcomes

This continuation implements the existing [audit-response contract](continuation-contract.md) in five more discarded-outcome sites. It preserves the previous core-project repairs, canonical stores, model gateway, recorded turns and signed document-acceptance transactions.

| Site | Actual outcome now reaches |
| --- | --- |
| AI section edit and template generation | Existing JSON `meta.auditTrail`, mapped from `logAuditEntry` and correctly identifying the regulatory store as `chained: false` |
| Personal response feedback | Existing JSON response plus the actual saved feedback ID and `meta.auditTrail` |
| Shared AnA model-provenance writer, used by eight generation routes | Awaited JSON metadata, SSE completion metadata or the combined result of every actual batch generation |
| Persisted section generation | `GenerateSectionResult.auditTrail`, carried intact in the existing submission route’s SSE `done` frame |

An audit outage does not turn a completed suggestion, saved draft or recorded feedback into a falsely failed business operation. Real audit-write success, refusal, rejection and subsequent recovery remain distinguishable. All-failed batches receive no invented successful-generation audit. The [AnA evidence](o01-ana-model-provenance.md) documents the eight response paths and asynchronous completion controls separately.

## Project source authority

The two editing/template routes now admit an optional legacy integer project through the existing current-membership/workspace/private-project read policy before retrieval or provider execution. An accessible project supplies its persisted numeric ID to the existing retrieval helper’s project filter and the existing RIM context; a raw body identifier does not become source authority or a `NaN` project. `proj_3` and integer `3` resolve through the canonical project parser. Both gateway requests explicitly receive the authenticated organization and user. Foreign/private refusal controls run before retrieval, generation or audit; positive controls exercise both endpoints.

This reuses the existing project-filtered Data Room retrieval. It does not qualify that atom corpus as current Vault passage evidence or replace the canonical governed Authoring acceptance workflow. Ad hoc editing remains an unsaved suggestion. Section generation retains its established tenant-scoped submission and supplied-evidence contract; this change does not qualify a new clinical-source adapter.

## Feedback persistence and uncertainty

The old feedback route attempted `CREATE TABLE` during requests, swallowed both DDL and INSERT failures, and then answered `recorded: true`. The production application role cannot provision a missing store. The exact existing `public.ai_feedback` table now has the replay-safe additive migration [20261014_ai_feedback_persistence.sql](/workspace/ClinicalSageAI-2-replit/db/migrations/20261014_ai_feedback_persistence.sql), registered by the control tower before canonical tenant sweeps and grants. Existing runtime-created rows and nullable historical actors remain intact; no historical identity is fabricated.

New writes resolve the current active persisted user/organization membership, ignore body-supplied identities, require a boolean decision, bound message/conversation labels and comments, and obtain the actual `RETURNING id`. Viewers may submit personal feedback; that does not grant document-edit authority. An optional project requires the existing project read policy before business effects or its RIM signal. No project is inferred from a message/conversation label or replaced with project zero.

A proven PostgreSQL statement refusal returns `FEEDBACK_NOT_RECORDED` with no saved-action receipt. A lost connection reply or missing trustworthy INSERT identity returns `FEEDBACK_SAVE_UNCONFIRMED`; it does not claim rollback or invite a duplicate save. One regression commits a real feedback row and then suppresses the database reply: the response correctly remains unconfirmed and emits no invented saved identity or audit receipt. After a confirmed save, an actual regulatory audit outage instead leaves the feedback saved and returns the canonical audit warning. These are distinct outcomes.

The labels remain opaque personal feedback references. This migration does not establish native conversation/message relationships, a model-training job or a new user-facing workflow. [Seven native database cases](ai-feedback-native-persistence.md) exercise the genuine authenticated application role, positive tenant ALS binding, unchanged deployed FORCE RLS, foreign isolation, actual RLS business/audit refusal and recovery, and the unconfirmed-completion case.

## Section stream completion and error containment

Mounted tests also reproduced an empty SSE response despite a generated and saved draft. The route listened to the incoming request’s `close` event, which fires after its body completes. It now listens to the response connection’s `close` event, so a completed request body does not suppress later chunks and `done`. Actual disconnects still stop subsequent writes. The final saved result includes the canonical actual audit outcome without attempting to rewrite flushed headers.

Controlled provider and business-store failures emit a contained `error` frame without a fabricated `done` receipt. Provider diagnostics and database errors are excluded from the response and new route/service error logs carry bounded codes. The real provider gate, model provenance, section requirements, text escaping, draft state and governed acceptance are preserved.

## Verification and reachability

The first 17 mounted/PGlite cases recorded 15 failures and two passes before the repairs, exposing missing audit outcomes, false feedback success, unvalidated input, project admission gaps and the empty SSE stream. A separate exact project-filter assertion then failed before the route passed its admitted project into retrieval. Final persisted tests exercise actual regulatory/chained audit writers, actual rejected INSERT constraints, saved feedback/draft rows, recovery and the exact SSE frames. Their secondary independent audit backend is deliberately unavailable, so successful chained outcomes require a real `audit_logs` INSERT. The unused nullable coauthor embedding column is represented as text in PGlite; no vector behavior, live provider, production container or agency qualification is claimed.

The final bounded test/lint summaries are recorded in [o01-ai-authoring-continuation-checks.txt](o01-ai-authoring-continuation-checks.txt). The separate native and AnA evidence state their own counts and limits. The control tower owns the unique integrated test inventory, typecheck, build, release checks and any evidence-backed baseline ratchet.

The current BatchDraft UI calls `/api/claude/batch` through the shared `apiRequest`, which consumes the existing metadata warning. Repository searches found no current client caller for the other seven AnA generation routes, these two legacy editing/template APIs, feedback or the submission section-generation SSE endpoint. API and stream repairs do not establish new launch UI consumers or qualify standalone document approvals.
