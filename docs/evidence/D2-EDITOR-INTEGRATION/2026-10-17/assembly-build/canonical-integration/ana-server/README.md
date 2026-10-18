# Canonical AnA source and saved-base integration

W1 / D2. This qualification integrates the assembly increment with canonical
`accf8c6ba` during the direct-branch rebase. It supersedes the earlier AnA
server receipt's atom-search seam; no second retrieval implementation remains.

The existing draft route uses canonical program Vault passage retrieval on the
request executor, parks exact Vault version receipts, and revalidates them in
the accept transaction. The assembly increment additionally captures the exact
saved section base, checks it under parent/candidate/section locks before
candidate deletion, and checks current project admission before retrieval or
generation. Both generator fields survive the parser, including malformed
recorded Vault receipts so acceptance can refuse them rather than dropping a
control. Both refusal codes remain available: `SECTION_BASE_CHANGED` and
`DRAFT_SOURCES_UNAVAILABLE`. Source refusal rolls consumption back; neither
refusal overwrites text. Existing single-use and expiry behavior remains.

The first combined run recorded three fixture failures and eleven passes in
`initial-integration.txt`: the old assembly test expected the removed atom
search, and the upstream program-source unit had no fresh admission seam.
Fixtures now retain the real saved-base helper exports; source-wiring units
explicitly isolate project admission, while the assembly safety suite exercises
it through actual HTTP and SQL. The real draft-record fixture combines both
current project prerequisites and canonical Vault/program/catalog migrations.

The final receipt records the exact command, per-file case counts, source pins
captured during test startup and checked after completion, and lint comparison
against `accf8c6ba`. The additional real SQL case stores a malformed Vault
receipt beside a valid saved base: acceptance returns the source refusal,
issues no section update, rolls back candidate consumption and retains the
candidate. This specifically proves both controls survive the merge.

The HTTP, candidate, revision, audit and lineage SQL run against PGlite. Model
generation and passage search are synthetic; the source helper/resolver suites
add their own scoped unit and SQL coverage. This does not qualify a live model,
live corpus, native PostgreSQL scheduling, RLS enforcement, deployment, human
review or regulatory readiness. Earlier evidence remains as the history of
the already qualified assembly increment.
