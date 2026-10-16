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
