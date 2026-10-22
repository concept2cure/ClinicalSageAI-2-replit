# Authoring remedies — F03 and F13, 14 October 2026

Scope: launch row D2 (reachable authoring) and D5 (source identity and controlled writes). The user authorized the contemporary audit remedies. No provider calls, deployment, commit or push were used for these checks.

## F03: section drafting reads the document's own sources

`POST /api/authoring/sections/:id/ai/draft` derives the project from the saved author's document (`client_program_id`). It searches the canonical Vault passage service with that program filter, the verified organization id and organization UUID. It never falls back to an organization-wide atom search when program scope is absent.

Each hit's current document and extraction/catalog hash are checked through the canonical catalog reader. The parked draft generator carries a server-held receipt: program, document id, original byte hash and version. At acceptance, the existing transaction reserves the disposition/program and source stores and rechecks that receipt before changing content. A missing, withdrawn, superseded, differently scoped or changed source produces `409 DRAFT_SOURCES_UNAVAILABLE`; rollback preserves the single-use candidate and the previous content.

Source citations use the existing CRE registry and span-lineage service. An exact same-tenant, same-program, current captured source with the same byte checksum can link a Vault passage to its CRE id. A directly uploaded Vault document without that registry record remains honestly uncited; its exact version receipt still survives with the accepted draft's generator/audit record. No source id or citation row is invented and no second evidence corpus was created.

The model and retrieval outages retain the existing visible draft-grounding states. An unscoped legacy document reports retrieval failure and never searches other programs; an empty scoped search reports empty. The existing ungrounded-draft warning and author acceptance remain explicit.

## F13: the lock takeover action reads the current reason

The cached callback now depends on the reason and its validity. The reason typed after opening confirmation is trimmed and sent to the existing takeover endpoint. The stable-toast regression exercises the normal first-use sequence.

## QMS editor integration

The canonical mutation middleware calls the QMS shared content helper on edit-class requests, and its governance helper on signing/approval requests. The document read reports the same content and signing refusals. The same Workbench renders QMS controlled content read only and exposes the server's reason without claiming that `IN_REVIEW` is frozen. Signing is directed to Quality. The QMS migration's database trigger is the transactional/direct-writer backstop; applying that migration is required before these routes are deployed.

Embedded Back now goes through the Workbench's existing unsaved-work decision, including Back to Quality. Leaving without saving preserves device work and performs no implicit governed save.

## Evidence

- Before fixing F13, the added takeover regression failed because no takeover POST was sent (`authoring-lock-before.log`). After the fix all nine collaboration tests passed.
- Before fixing F03, all three new HTTP regressions failed: no program passage call, wrong fallback corpus, and a foreign source treated as valid (`authoring-sources-before.log`).
- Consolidated Node 22 Vitest run: **11 files, 109 tests passed** (`authoring-consolidated.log`). Includes actual PGlite source-link SQL, candidate generator roundtrip, recorded-turn/accept SQL, source receipt rejection, actual HTTP draft scope, canonical mutation gates, and real-editor unsaved/read-only controls.
- `ci:canvas-path` passed. Targeted ESLint had no errors; pre-existing large-file/complexity warnings remain. The new source adapter passes ESLint without warnings.

The consolidated tests mock model calls and passage retrieval where appropriate. The source-id resolver and draft/turn stores execute against PGlite. This is code/contract evidence; live deployment and provider readiness are separate release evidence.
