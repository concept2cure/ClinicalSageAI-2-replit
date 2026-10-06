# W3 / D4 — Bound optional context enrichment

Project profile and workflow context previously loaded sequentially before the
requested slash/app/topic enrichment, with no wait bound. A stalled source held
the turn indefinitely. enrichment-red.txt records eight pre-fix failures.

Common profile/workflow reads now start alongside requested enrichment, sharing
one three-second budget across the optional stage. Healthy results remain in
their original prompt order. Slash commands and app mentions retain their
rewriting and static invoked-app instructions even when the data read times out.
Natural-language claim-grounding guidance still runs. The existing greeting rule
is preserved when common project context already supplies an answer.

Expired or propagated-failed reads have explicit unavailableSources metadata,
distinct from healthy empty results. The profile loader now propagates failure
to the bounded composer rather than reporting an empty profile. Existing inner
service fallback behavior remains. A model availability note survives optional
composer trimming and does not count as evidence or a successful source. This
fixed note can add tokens beyond the optional substantive-context token budget.
The stream emits a plain-language warning and records it in the turn audit.

Timers clear on settlement. Late results cannot change the returned snapshot.
Existing database/service work is not cancelled and may finish in the background.
No authorization, approval, governed execution, model, tool or regulatory gates
are shortened by this optional narrative-context budget. Both chat paths call
the shared enrichment service; the streaming path additionally emits its warning.

Validation: enrichment-green.txt records 33 passing tests across five suites,
including simultaneous stalls, healthy/slow context retention and ordering,
profile/workflow errors, app/slash intent, static claim guidance, composer
availability, absent project scope, late-result stability, existing tenant guards,
actual stream warning/model/turn-record wiring, source grounding and turn input
records. All 26 repository guards passed (repository-gates.json); the server-error
leak gate also passed after the final error-propagation change. Changed-file lint
has no errors, with existing six enrichment and 24 stream warnings and none in
the tests. Final publication checks are recorded in publication-checks.json.

The preceding published pass f315fdf3 passed full and beta-slice TypeScript, lint,
browser smoke, AnA readiness and production boot smoke in GitHub. Current-pass
full compiler validation remains with GitHub under the authorized local compiler
memory exception. Dependency/security audit findings remain unresolved. D4 is
open pending live deployment/provider and launch evidence. This is an optional
stage wait budget, not a measured total response time or model-quality result.
