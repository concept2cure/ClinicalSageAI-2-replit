# D1 runtime recovery and D7 demo scenarios
Date: 2026-10-16. Local Codespace demonstration; not production validation.

- Preserved the incomplete concept2cure-ri database. Provisioned a separate local
  c2c_showtell_20261016 database with the canonical db:provision path successfully.
- Existing GA fixtures plus eight explicitly fictional programs and eight draft
  walkthrough documents cover biotech, pharma, devices, CRO, academia, CDMO,
  consultancy and health systems. Seed module 125-demo-scenarios.mjs is discovered
  by the local-only GA orchestrator. Repeated seeding added zero duplicate programs.
- Scenario anchors use an unambiguous organization workspace and retain ordinary
  project access controls. Chrome Projects displayed all 20 programs, including all
  eight new scenarios. No readiness scores, clinical results or approvals fabricated.
- OpenAI model-list request returned 200. Live AnA conversation returned a response
  through the fallback provider after projecting unsupported root JSON-schema
  combinators out of OpenAI function parameters. Canonical schemas and server-side
  argument validation remain intact. The conversation's empty demo search result
  preceded creation of the new project anchors; not evidence of successful retrieval.
- Anthropic authentication returned 401. High-risk approved-model readiness remains
  blocked; no governance policy or model approval changed.
- Adapter regression tests: 28 tests passed across openai-tool-schema.test.ts and
  openai-tool-calls.test.ts. Migration ordering passed (399 migrations).
- Registered the existing feature_toggles provision migration on the durable deploy
  path before final tenant sweeps, resolving the initial pre-push deploy-path failure.
- Centralized secret management is deferred at the user's request. No keys committed.

Follow-up: walkthroughs also have project-linked draft Authoring records and one
plain-language section each, retaining existing object ACLs and explicit synthetic
provenance. No acceptance, signatures, audit events or approvals are seeded.
A project-scoped AnA turn completed, but its answer summarized organization sample
context without consulting sources; do not present that as verified project retrieval.

Remote landing remains blocked by the existing repository-health strict gate:
one duplicate pair in bundled gstack code, 77 files above 100000 bytes (ceiling 57),
and 140 above 1500 lines (ceiling 114). No hook bypass or ceiling increase performed.
Migration manifest was synchronized; earlier migration/security gates passed.

## Push cleanup
The size/duplication failure was entirely caused by the bundled upstream gstack
developer-tool checkout. Converted it to a pinned submodule at its existing
upstream revision, with all 12 local synthetic-secret annotations preserved as a
patch in tools/gstack. Reconstructed the upstream archive plus patch and compared
every one of the 3,390 prior tracked files byte-for-byte: zero mismatches.
The unchanged repository-health gate now passes: 55 oversized-by-byte files
(ceiling 57), 110 oversized-by-line files (ceiling 114), zero content duplicates.
No application files, UI, thresholds, or runtime dependencies changed in this cleanup.

## Lint and audit follow-up
Extracted named test cases from oversized suite callbacks and separated tool-intent
construction from selection. The pushed-warning ratchet now reports net zero
warnings versus origin; no baseline changed. Three migration suites and tool
selection passed in the initial run (54 passing cases outside the audit suite).
The audit suite exposed an existing historical verifier-event hash mismatch:
jsonb reordered the fixed details written by that historical event. Added a
deterministic verification candidate for that known shape, preserving both prior
hash forms and every field. Regression verifies the historical row and rejects
an edited entriesVerified value. Audit plus context/workflow selection checks:
46 passed; final audit-only recheck: 7 passed.
CMC and the client-category app catalog were opened through the existing UI:
logo/Home -> Browse all capabilities -> CMC / Module 3. No UI changes.

## Client navigation request
Founder explicitly requested Apps catalog, Tasking and Communication in the left
rail, and a visible Home. Added those entries using existing surfaces. Tasking
clears the personal filter; My work still requests the signed-in person's tasks.
Communication joins the Projects launch surface set, without adding module grants.
Navigation suite: 23 passed. Communication suite: 9 passed, including tenant-scoped
program UUID resolution, missing anchors and lookup failures. The v2 shell passes
program UUIDs; the legacy communication endpoints now resolve their project anchor
through the existing strict resolver rather than rejecting every UUID.

All earlier local pre-push gates passed, including typecheck (zero errors).
GitHub push protection then rejected credential-shaped upstream test fixtures in
the local-annotations patch. Replaced the patch with hash-checked comment-only
edits (12 files); only inserted annotations, offsets and hashes are stored.
Rebuilt the two unpublished cleanup commits to remove the patch from pushed history.

## Explicit read-only AnA requests
A reported read-only summary request still triggered drafting. Added a server-set
per-turn constraint: the existing tool authorization register limits offered tools
to reads, non-read calls are refused before approval handling, the tool wrapper
also refuses them, and post-processing strips executable blocks without dispatching
or proposing them. Draft persistence is suppressed on these turns. The current
request overrides earlier drafting history; normal later drafting remains subject
to existing model and human-approval controls. Negated drafting is not classified
as a governed draft request. No model approval or permission was changed.
Focused regression suites: 33 passed across intent, tool refusal/read allowance,
and post-processing (no writes or approval proposals).
