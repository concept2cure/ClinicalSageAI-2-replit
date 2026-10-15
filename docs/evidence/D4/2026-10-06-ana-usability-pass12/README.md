# W3 / D4 — Overlap independent intelligence recall with route prefetch

Both chat entry points waited for route prefetch before starting the independent
org/project intelligence prefix. Their three-second optional wait budgets could
be paid sequentially even though the prefix needs only resolved org/project IDs.
recall-red.txt reproduces two caller-order failures against the published builder.

The existing prefix promise now starts before route prefetch in both the shared
chat-context builder and the actual stream route. It is joined at the existing
context composition point. Its failure handler attaches immediately, so a
rejection while prefetch is pending is handled. Exactly one prefix load occurs;
healthy text still reaches the model and rejection still retains the other
context. Project identity, tenant parameters, prefix caching and deadlines are
unchanged. Conversation-memory sequencing remains unchanged pending a separate
thread-access review. Policy/authorization/approval and model-selection waits
remain outside this optional optimization.

recall-green.txt records 42 passing tests across seven suites: the actual shared
builder and stream route starting scoped recall while prefetch is held, retained
prefix text and early failure handling, existing prefix deadlines/cache/project
UUID identity, route-prefetch availability/tenant scope, stream grounding and
turn input records. All 26 repository guards passed (repository-gates.json).
Changed-file lint has no errors; existing 24 stream and four builder warnings
remain, with no warnings in tests. Final import and lint ratchet checks are in
publication-checks.json.

This verifies scheduling and retention, not measured live latency or response
quality. Later memory/enrichment/history/policy/provider stages still contribute
to total response time. Context-phase duration now includes the join of a prefix
read already running; it is not the prefix's total read duration. Existing reads
are not cancelled. The preceding b4b98326 pass cleared full/beta TypeScript, lint,
AnA readiness and production boot checks in GitHub. Current full compiler checks
remain with GitHub under the authorized local compiler-memory exception.
Dependency/security findings remain open, as does D4's live deployment/provider
and launch evidence requirement.
