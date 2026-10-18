# Real local runtime qualification

W1 / D2, 2026-10-14 (America/Los_Angeles). This is automated evidence from the
local managed workspace, using the actual application and a newly provisioned
PostgreSQL database. It is not a completed human session in the founder's
Codespace, a deployed environment, or a substitute for the human-testing
worksheet in `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`.

The post-sync replay passed the recorded **local manual API scope** after the
initial run exposed a current-role authorization defect and that defect was
fixed. AnA remains unavailable without an approved provider. The initial
observations below remain historical proof rather than a claim that the
defective version was ready.

## Post-sync Node 22 qualification

[post-sync-node22/summary.json](post-sync-node22/summary.json) is the current
integration qualification, run from canonical base
`4997d35ebd6a17bfb33df7860195d832bc094921`, including incoming
`1bd3af0bc5abaff99f9eea0a0c139617842a32a2` and the exact current-role fix bytes
recorded in [post-sync-source-pins.json](post-sync-source-pins.json). None of
the prior 20 runtime source files changed during synchronization, but imported
coauthor, submission and embedding dependencies did; the replay therefore
used a new database and a new application process. The pin file adds those
dependencies (26 files total) and the unchanged reproduction runner.

The frozen runner exited **0** with **Node 22.23.3** for both schema commands
and the application. Its **115 recorded real HTTP requests**, **11 template
starts / 714 seeded sections**, saved paragraph/guidance/history/audit checks,
project-scoped recovery reads, old/fresh viewer denials, foreign-tenant denial
and observed `app_service` runtime identity all passed again. The real QOS
Word working draft filed with 201 and downloaded with 200: **9,151 bytes**,
SHA-256 `7eeb2ac57bad24282c8ebeee37cbe497828ff98ffaa9feac012cd17fe5289a3f`,
exact saved paragraph, draft marking and no approval carryover. Only this run's
server, container, anonymous volume, wrapper and project bytes were removed.

The post-sync readiness response remained **503**, failed only on AnA as
`no_provider`; database, schema and storage were `ok`. No provider calls or
human-session outcome are claimed. [final-verification.json](final-verification.json)
now identifies this post-sync result, the 26 unchanged source pins, runner
identity, installer-log hashes, credential-shape scan and cleanup receipt.
The earlier verification receipt is retained as
[preintegration-final-verification.json](preintegration-final-verification.json).

## Preintegration Node 22 replay

[final-node22/summary.json](final-node22/summary.json) records the actual exit-0
replay with Node **22.23.3** for the installer parent, its Drizzle child and
the application. Both canonical schema commands exited 0 against another new
isolated PostgreSQL instance. [final-source-pins.json](final-source-pins.json)
records the exact post-fix source, including the four authorization files;
the pin verification confirms those bytes were unchanged through completion.

The replay made **115 recorded HTTP requests** and listed all **305 built-ins**.
It created the six regional/component documents above and one IND template
from each of M1–M5: **11 documents / 714 empty seeded sections**. Every one
served guidance, explicitly saved and reopened its exact labelled paragraph,
served revision history, retained its reason in audit, preserved template context and appeared
in the scoped recovery read. This samples the real runtime; the separate
published 305-template database evaluation covers the complete inventory.

With the document creator's durable `OWNER`/`AUTHOR` grants still present,
downgrading that account's current organisation membership to `viewer` now
refused section PATCH and document creation with **403** under both its old
administrator JWT and a fresh viewer JWT. Existing document reads stayed 200,
the document count did not increase, and the original membership was restored.
A foreign-tenant document was hidden with 404. An unknown program filter
returned the existing 200/empty read contract without exposing another scope.

The replay independently observed a real HTTP connection as `app_service`
(`NOSUPERUSER`, `NOBYPASSRLS`). The QOS Word working draft filed with 201 and
downloaded with 200: its **9,149 bytes** matched SHA-256
`bc6e0a9ae2edc4ace93835b054ccbbff7ac656761ccded258236194ca71c7536`, contained
the exact saved paragraph and retained the draft marking. Approval carryover
remained false. Only the runner's own server, container, anonymous volume,
temporary psql wrapper and project test bytes were removed.

The final replay still observed `/readyz` **503**, with only AnA failed as
`no_provider`; database, schema and storage were `ok`. That unavailable lane
was neither bypassed nor counted as passing. All human and environment
boundaries described below continue to apply.

## Initial run and observed defect

[source-pins.json](source-pins.json) identifies the canonical starting commit
and the exact runtime/installer files. The initial canonical `install-fresh`
and `deploy-migrate` commands both exited 0 against a new `pgvector/pgvector:pg16`
container, published only on `127.0.0.1:6543`. The repository was mounted read-only
inside that container so its real PostgreSQL `psql` could apply the canonical
governed-content files through a task-local wrapper. No existing database or
volume was reset, and no dependency or shared configuration was installed.

The actual installation reported 808 public tables, 1,011 RLS policies,
42/42 governed-content files, 382/382 migration files and a 1,299/1,299 relation
runtime grant audit. The first installer parent used the inherited Node
24.19.0; its Drizzle child and the actual application used the explicitly
selected Node 22.23.3. Do not cite that initial installer as a Node 22 parent
qualification. The application used `APP_DATABASE_URL` as `app_service`,
`RLS_ENFORCE=on` and `EXPORT_REVIEW_GATE=enforce` with generated local secrets.

The initial real HTTP smoke exercised development login, `/api/auth/me`,
canonical `/api/c2c/projects` creation, and these six saved document starts:
`registry:US_NDA`, `registry:CA_CTA`, `registry:EU_CTA`, `registry:JP_CTN`,
`component:quality_overall_summary` and `component:pil`. Every start returned
201, retained its exact template and filing context, seeded empty sections,
served guidance, explicitly saved one labelled paragraph with a reason and
concurrency token, reopened the exact text, and retained history/audit evidence.
The project's recovery GET returned the existing document under the requested
program filter. Five additional IND starts, M1 through M5, returned 201 and
reopened with the correct module and template. Those additional initial module
starts did not individually repeat the paragraph-save check.

The QOS document's real Word working draft was filed into its project Vault
with 201. The recorded Vault version downloaded with 200; its 9,147 bytes
matched the returned SHA-256, contained the exact test paragraph and had the
working-draft marking. The response was `sealed:false` and explicitly refused
approval carryover because Authoring status was `draft`. These are
platform-generated bytes, using the canonical origin policy; this does not
qualify an untrusted upload's antivirus scan. No scanner was configured.

[runtime-role.json](runtime-role.json) independently observes an active real
HTTP read using `app_service` while it waits on a short owner-held lock in the
isolated database. The lock was rolled back and the read completed with 200.
The role was `NOSUPERUSER` and `NOBYPASSRLS`. A foreign-tenant document inserted
as an explicit owner fixture was hidden with 404. An unknown program filter
returned the existing API's 200 with an empty `documents` array.

The blocking defect is recorded in
[current-viewer-reproduction-before.json](current-viewer-reproduction-before.json):
the document creator retained durable `OWNER` and `AUTHOR` object grants after
the owner's test setup downgraded that account's current organisation
membership from `admin` to `viewer`. The application immediately displayed
the current viewer role, but both the old administrator JWT and a freshly
minted viewer JWT could PATCH the section with 200 and create a new document
with 201. Both JWTs still PATCHed with 200 after 70,049 ms, beyond the documented
60,000 ms membership cache. The original membership was restored in `finally`.
This was not treated as an acceptable cache delay. No real customer or shared
database was involved.

## Honest environment boundaries

`/healthz` returned 200. `/readyz` returned 503 with only `ana` failed:
database/schema/storage were `ok`, Redis/worker were skipped, and AnA was
`no_provider`. No provider credential was provisioned or used, and no
deterministic/model substitute was enabled. The provider-backed AnA review,
remedy and embedding lane remains blocked here.

No human browser session, independent colleague's review, signing ceremony,
untrusted file extraction/scanning, source citation walk, private Codespaces
forwarded URL or deployment was qualified by these HTTP checks. The regional
documents were working documents in a labelled local FDA IND project; their
recorded regional preparation contexts do not widen the project's supported
CMC, assembly, validation, approval or transmission scope.

Initial harness corrections are explicit in
[initial-local-run.json](initial-local-run.json): an incorrect runtime-only
`DATABASE_URL` prevented the owner-only development seed until the documented
owner/runtime split was restored; an initial statistics probe needed
`pg_stat_clear_snapshot()` inside its transaction; and an incorrect unknown
program 404 expectation was corrected to the actual 200/empty contract.
Those corrections changed the test harness, not production behavior.

[initial-cleanup.json](initial-cleanup.json) records that only this task's server,
PostgreSQL container, its anonymous volume and its own local project test bytes
were removed. Generated credentials and JWTs were never committed. The initial
evidence was checked for the actual generated values and JWT-shaped strings;
there were no matches. The image may remain as a normal Docker cache.
Only trailing horizontal whitespace at line ends was removed from server
captures after recording. The three stored `install-fresh.txt` copies also
had extra final LF bytes removed so each ends with exactly one newline;
[installer-log-eof-normalization.json](installer-log-eof-normalization.json)
records every before/after byte count and SHA-256. The operation receipts in
the two Node 22 `summary.json` files retain their **original captured-log
hashes**. Those hashes were verified against the files before normalization
and must not be mistaken for the normalized stored-copy hashes. Runtime
outcomes, operation receipts and HTTP records are unchanged.
[preintegration-final-verification.json](preintegration-final-verification.json)
retains the first two normalized server-log hashes, and
[final-verification.json](final-verification.json) records the additional
post-sync capture, current source-pin check and credential-shape scan.

## Reproduction

[reproduce-local.mjs](reproduce-local.mjs) is a standalone Node 22 runner for a
fresh, isolated local replay. It requires installed repository dependencies
and access to the local Docker Unix socket, uses the current canonical source,
preserves Docker proxy/registry settings and TLS verification, and refuses an
existing output directory or occupied ports. It does not use `npm run dev`,
which could rewrite an ignored env file. Run from the canonical repository:

```bash
node --version # must be 22
node docs/evidence/D2-EDITOR-INTEGRATION/2026-10-14/create-recovery/local-runtime/reproduce-local.mjs
```

Optional command-specific environment variables are `C2C_SMOKE_DATABASE_PORT`,
`C2C_SMOKE_APP_PORT` and `C2C_SMOKE_OUTPUT`. The default ports are 6543 and 5000;
the output defaults to a new `replay/` beside the runner. The runner generates
all local passwords/session secrets in memory, applies both canonical schema
commands using Node 22, launches the one existing application, checks all six
regional/component and five IND module starts through save/reopen, observes
the runtime role, checks foreign/current-viewer denials using both old and
fresh JWTs, and verifies a Word working draft through Vault download. It keeps
normal governance gates enabled and expects AnA's unavailable state honestly.

The runner restores its temporary membership change in `finally`, stops its
own server process group, removes only its named container and anonymous
volume, and removes only the project bytes it created. Its exit status and
`summary.json` must be inspected: a liveness response alone never means pass.
The initial diagnostic files are not silently replaced by a later replay.
