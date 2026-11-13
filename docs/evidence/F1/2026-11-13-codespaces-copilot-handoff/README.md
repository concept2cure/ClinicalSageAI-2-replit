# Codespaces demo and Copilot handoff

F1 / W1 / D1–D2, 2026-11-13. Fresh setup at `2a667bf51` passes; focused checks
at merged `2973e971b` and the existing synthetic CSR editor rehearsal pass.
Source and handoff publication is confirmed at `50019d14e`. Normal and cached
startup pass after the managed-network recovery below. The app serves that
published revision; live AnA remains unavailable without a provider. Failed
attempts and limits are retained.

## What already exists

The existing `.devcontainer/devcontainer.json`, `post-create.sh` and
`post-start.sh` provide the Node 22/bookworm, PostgreSQL 16/pgvector,
`app_service`/RLS, port-5000 and fictional-demo path. Recent repairs are already
published on the canonical branch. `scripts/ops/codespaces-doctor.mjs` and its
existing tests diagnose the running state. `scripts/demo/launch-demo/seed.mjs`
provides the existing API-based demo packs and reviewable synthetic CSRs.

The existing Codespaces operator guide is
`docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`.
`.github/copilot-instructions.md`, `AGENTS.md` and `CLAUDE.md` already direct
Copilot to the same canonical product. The protected Copilot instruction file
is not amended here; the existing `.devcontainer/AGENT_RULES.md` can link the
operator procedure. The current roadmap and file holds stay binding.

Inventory/deletion searches and exact intended scope are recorded in
`.design/claude-convergence/F1-CODESPACES-COPILOT-HANDOFF-2026-11-13.md`.
No second app/editor, new service, credential in Git, deployment, fabricated
provider response or weakened release gate is part of this work.

## Current constraints

This refreshed task environment has no OpenAI or Anthropic key. The user
explicitly requested a new OpenAI key for Codespaces; secure setup is waiting
for its organization/project selection. OpenAI search and live qualified AnA
drafting are separate from a successful local manual workflow. No live-provider
or scientific/submission qualification is claimed by boot or browser evidence.

The GitHub connection can fetch/push the canonical repository, but the repository
Codespaces-secret public-key endpoint returned HTTP 403, `Resource not accessible
by integration` (`github-secret-preflight.json`). No OpenAI key has been created
or installed. Creation awaits the secure organization/project selection, and
installation needs an authorized Codespaces-secret connection. No plaintext key
is requested in chat or committed.

## Measured fresh setup

The declared Microsoft Node 22/bookworm image was downloaded and verified at
digest `sha256:7c2e711a4f7b02f32d2da16192d5e05aa7c95279be4ce889cff5df316f251c1d`.
Its multi-layer VFS storage consumed almost the verifier host's 32 GB. Only that
owned temporary image was removed. The existing documented one-layer transport
was reused: official `crane` v0.22.1, matched release checksum, identical exported
filesystem, and preserved public runtime configuration. `image-transport.json`
and `image-tool-verification.json` retain the exact identities. No product
devcontainer or Docker storage-driver change was made.

Current `.devcontainer/post-create.sh` completed in that image with exit 0 in
239.3 seconds. All **81 startup tests pass**, PostgreSQL 16/pgvector provisioned
and verified as the non-owner `app_service`, and the document tooling and demo
sign-in accounts were installed. `post-create.json` and its redacted output bind
the run to 12,720 named source/package/migration inputs with no drift. This is a
fresh local image rehearsal; it is not an observed hosted GitHub Codespace.

Two verification-harness preconditions were corrected without product edits:
an early exec attempted setup before container creation completed, and root npm
preparation changed the bind-mounted Git config's host ownership. The current
config bytes and `.husky/_` setting were preserved when restoring host ownership
(`git-bind-ownership.json`). No hook was disabled. The successful setup above is
the later actual script execution, not either precondition failure.

## Initial startup and editor rehearsal

The first `post-start.sh` launched the app at the measured baseline. Its tool
session became unaddressable while the Docker exec, startup shell and seed
remained running. The Python receipt
supervisor was absent, so no native completion exit or complete startup output
was retained (`post-start-interrupted.json`). This attempt is not a passing
full-start receipt. The orphaned startup continued, and all three actual
Lumen/general/portfolio seed markers later completed through the normal API
path. Later ordinary starts are measured separately.

`runtime-role.json` queries with `APP_DATABASE_URL` taken privately from the
actual running server process: role `app_service`, row security `on`, no
superuser or RLS bypass, zero owned public tables and no owner aliases in that
process. The first verifier incorrectly read `DATABASE_URL` and tried a default
connection; its `28000` failure is retained as a verifier precondition error,
not an application connection failure (`runtime-role-precondition.json`).

The first real browser rehearsal completed Projects → LMN-301 → Author → the
existing CSR editor → efficacy and adverse-event sections → working-copy
downloads → scientific-review preview. Both header and whole-document section
reads returned 200 with the same document identity and **119/119 nonempty saved
bodies**. Word (37,621 bytes) and PDF (167,538 bytes, 34 pages) downloaded through
the editor's own menu. Their delivered-byte SHA-256 values match response
headers; Word XML and parsed PDF text contain the DRAFT/uncontrolled notices.
Controlled Word, PDF and XML remained disabled on the draft. Scientific preview
returned 200; no review decision, document freeze, signature or filing was
submitted. These are synthetic documents, not live model generation.

The first browser process nevertheless exited **1**: its observer counted
`net::ERR_ABORTED` cancellations as transport errors. It recorded no HTTP API
errors, page errors or functional measurement failures. Its observer did not
capture methods, so those methods are not retrospectively inferred. The native
failed receipt and compressed output remain `reviewer-browser.*`; the exact
helper, JSON and screenshots are retained by `attempt-1-archive.json`.

Source review found the existing read hooks abort requests when leaving their
scope. The bounded observer now records every failure's method and
classification. Only exact GET/`net::ERR_ABORTED` outside required document and
section reads is classified as a client cancellation. Required-read aborts,
all write aborts, other transport errors, HTTP errors, page errors and the
existing data/export/preview assertions still fail the run.

## Integrated verification

Canonical changes through `422110a41` were merged at `2973e971b`. The two
coordination entries were preserved, and the guide's repeated update commands
now point to one detailed procedure. It checks local work, published HEAD,
the running `/api/version` and `/readyz` separately. The existing playbook and
devcontainer open-file discovery are retained.

`source-bridge.json` and the named input manifests bind this integration: all
client, server, shared, migration, demo, package and lifecycle-script objects
are unchanged from the fresh-setup baseline. The devcontainer runtime settings
are unchanged; only its open-file list adds the existing playbook. The changed
diagnostic/verifier scripts pass the existing five Node suites: **173/173**,
zero failed/cancelled/skipped, native exit 0 (`merged-checks.json`). Scoped lint
of those six scripts and the browser helper exits 0 (`merged-lint.json`). Both
runs retain 12,722 named input hashes and report no source or execution drift.
No live provider request was made by these fixture-based checks.

The bounded browser rerun exits **0** in 22.8 seconds
(`reviewer-browser-confirmed.json`). All functional checks still pass, with
119/119 saved bodies, downloaded Word and PDF (167,567 bytes, 34 pages), matching
delivered-byte hashes and draft notices, and a 200 scientific preview. Downloaded
working-copy binaries stay in private scratch; the packet retains metadata and
inspection results. It
retains **52 client-cancelled GETs**, zero transport failures, zero API HTTP
errors and zero page errors (`reviewer-current-walk.json`). Required document
reads were not cancelled. Screenshots include the existing editor at 1440px
and review dialog at 390px. The current helper and receipt harness are hashed
separately in the execution-input receipt. No approval was submitted.

The app served baseline `2a667bf51` during this content-identical editor
rehearsal. The later normal start and runtime check below verify published
`50019d14e`; the bridge does not relabel the older process stamp.

## Canonical publication

The direct normal push to `concept2cure-v2` completed at
`50019d14e50304d023b6e9e7c945456c74175979`. All push gates pass, including
**89 Lint-job gates, zero red**. The normal typecheck gate explicitly skipped
the 50 changed files because none can change a type; this is not a new compiler
pass. A fresh authenticated fetch confirmed the same remote SHA, and the
working tree was clean before retaining `publication.json`.

The two operator-document holds are released. The existing canonical guide,
devcontainer agent rules, playbook and tracked source/redacted evidence are
available to Codespaces Copilot after its checkout refresh. Account sign-in
and the later runtime stamp remain separate from a successful repository push.

## Normal restart and managed-network recovery

`post-start-confirmed.json` retains the first fully supervised normal restart:
native exit 0 in 41.5 seconds, no source drift, and the old process correctly
restarted for published `50019d14e`. This is **not** a passing complete study
preparation: its output explicitly reports the CDISC download failure and
`csr-study.done` was absent. All three demo seed stamps were already complete.

`managed-network-probe.*` records direct Node fetch failing with `ECONNREFUSED`
and the same public HEAD request returning 200 through the existing `undici`
environment-proxy agent. Image Node 22.16.0 did not use this verifier's proxy
automatically. The probe was first run through stdin; its diagnostic body is
retained in `managed-network-probe.cjs`. No secret value is printed.

The unchanged `scripts/cre/fetch-cdisc-pilot-adam.mjs` was then run with the
explicit packet preload for that download process only
(`cdisc-proxy-fetch.json`): native exit 0 in 8.0 seconds, **all 10 pinned file
SHA-256 checks pass**, no named source/execution drift. Attribution and terms
are retained in its log; licensed data remain outside Git. TLS and the trusted
CA are retained. The preload is not installed in the product or normal startup.
Both small diagnostic helpers pass scoped lint (`recovery-lint.json`).

The next unmodified `post-start.sh` completes with native exit **0** in
285.4 seconds (`post-start-recovered.json`), with no source/execution drift or
failed preparation phase. Its native browser passes all **seven preparation
steps**, zero API errors: New project, fictional IND context, Vault uploads,
three-person review/approval of seven required files, the single CSR picker
entry, the created document's study-data build controls, and clinical-table
preview/freeze. It stops before model generation. `native-prepare-summary.json`
retains only step names, timings, outcomes and marker matches; licensed data
and raw browser details remain private/ignored.

All three stamps match their actual current formats, and `csr-study.done`
exists. The first verifier assumed all three stamps were bare tree hashes;
the retained `native-prepare-marker-precondition.json` records that verifier
error. The corrected check uses the existing tree/roster/email formats, with
all matches true. No marker was changed by a verifier.

`runtime-after-recovery.json` confirms `/api/version` returns published
`50019d14e`. Database, schema and storage are `ok`; `/readyz` remains **503**
with only `ana` failed, `anaState: no_provider`. This is a successful local
manual-workflow rehearsal, not a passing live-provider readiness check.

A subsequent unchanged cached start exits **0** in **5.9 seconds**
(`post-start-cached.json`), retaining the already-running app and all prepared
records with no source/execution drift. It repeats no demo seed or CDISC
preparation. The operator can now follow the published-HEAD update procedure
for the final documentation publication.

## Later canonical checkout repair

Canonical `1cddec661` then added a licensing checkout-response/free-activation
repair, its existing test updates and evidence. `final-source-bridge.json`
checks all prior measured inputs: only the licensing surface and its test
change; the other **12,720** measured inputs, including editor, backend,
exports, lifecycle scripts and demos, remain byte-identical. The prior CSR and
CDISC observations retain their original source/runtime stamps.

The three existing licensing suites pass **31/31**, and scoped lint exits 0
with only the three existing surface warnings (`final-licensing-checks.json`,
`final-licensing-lint.json`). Their eight focused inputs and actual executable
files are pinned separately; no source/execution drift is reported. These
component tests simulate billing responses and establish no live payment
acceptance. The incoming owner's broader checks remain in
`../2026-11-13-self-service-checkout/README.md`.

Final publication follows the normal hooks. Afterwards the existing startup
will update the app to that published documentation revision, and the
operator's version/readiness procedure will be checked again.

## Concurrent AnA integration and publication retry

The attempted push of `4d181db1e` passed all 89 normal lint gates, then Git
rejected the update because canonical work advanced. This rejected attempt
is not a publication receipt. Canonical `c36ec97e9` was merged normally at
`a10861e8c`; no incoming source or baseline was rewritten. Its changes cover
current-account activity/ETA reads and trusted actor/credential attribution.
The prior editor, export, bootstrap and demo files remain unchanged. The
incoming owner's detailed checks stay in
`../../ANA-AGENTS/2026-09-27/README.md`; they are not relabelled as this run.

`concurrent-source-bridge.json` names the incoming paths and changed measured
inputs. The 58 delta/test/compiler/package inputs are pinned separately, with
the earlier full manifest and bridge retaining the other measured source
identities. The first focused-test launch stopped before any test because
installed Vitest rejects `--minWorkers` (`concurrent-checks.json`, exit 1).
The corrected command retains `--maxWorkers=1` and passes **444/444 tests in
17 suites**, zero failed (`concurrent-checks-corrected.json`). These tests
exercise component, mocked transport and synthetic database boundaries; no
live provider or customer credential acceptance is claimed.

The unchanged startup exits 0 in 32.9 seconds at `a10861e8c`
(`concurrent-start.json`), retaining the prepared records. The CSR browser
rehearsal was repeated against that app: native exit 0 in 48.1 seconds,
119/119 saved bodies, real Word/PDF downloads (34-page PDF), matching hashes
and draft notices, and scientific preview. Zero HTTP, page, transport or
functional failures are recorded (`concurrent-browser.json`).
`merged-reviewer-*` outputs preserve all previous successful files. The helper
adds only an optional sanitized filename prefix; all assertions and request
classification remain in place, and scoped lint passes. This walk does not
exercise live worker countdowns, model drafting or scientific approval.

The full Node 22 compiler check passes at `a10861e8c`: **zero errors against
the unchanged zero baseline**, native exit 0 in 484.4 seconds
(`concurrent-typecheck.json`). Source and execution inputs did not drift.
No compiler baseline or gate was changed.

## Later billing response-ownership repair

While that compiler ran, canonical `917486637` added the existing licensing
surface's delayed account/session response guard. The normal merge at
`a5c92a646` preserves both coordination histories. The only additional runtime
change is in Licensing; shared session helpers, editor, backend, exports,
dependencies and startup are unchanged (`postbilling-source-bridge.json`).
No further CSR browser replay is attributed to this isolated delta.

The same three billing suites now pass **50/50**, and scoped lint has zero
errors with the same three existing surface warnings (`postbilling-checks.json`,
`postbilling-lint.json`). Their source/config inputs are pinned in
`postbilling-inputs.json`; no source/execution drift occurred. Billing responses
are fixtures, not a live Stripe settlement. The further full-program
incremental compiler check passes at `a5c92a646`: **zero errors against the
unchanged zero baseline**, native exit 0 in 407.8 seconds, no source/execution
drift (`postbilling-typecheck.json`). The normal publication retry and
exact-stamp check follow these completed checks.

## Published collaboration-context integration

Canonical `532cf4145` carried the existing collaboration-context repair and
source-owned tests/evidence. It was merged normally at `75247cc6d`.
`collab-source-bridge.json` confirms the actual production TypeScript,
compiler config and package delta against that published canonical tree is
empty. The local changes are this packet's documentation and nonproduct
rehearsal code. The two earlier full-compiler results remain attached to
`a10861e8c` and `a5c92a646`; the incoming owner's compiler and ordinary-push
proof stay in its own packet. They are not relabelled as another compiler run.

The documented seven collaboration suites pass **66/66**, and scoped lint
exits 0 with the owner's existing warning boundary
(`collab-integration-checks.json`, `collab-integration-lint.json`). These unit
cases use controlled responses; the incoming owner's intercepted lock/account
browser fixtures do not establish real holder displacement or cross-sponsor
authorization. No message or notification is sent by this manual rehearsal.

Normal startup exits 0 in 33.8 seconds, and `/api/version` matches
`75247cc6d` (`collab-integration-start.json`, `collab-runtime.json`). The real
CSR browser walk then exits **0** in 34.1 seconds
(`collab-integration-browser.json`): 119/119 saved bodies, downloaded Word/PDF
with matching hashes and draft notices, and scientific preview. It records
56 client-cancelled GETs, zero transport/HTTP/page/functional failures.
`collab-reviewer-*` outputs preserve all earlier attempts. The same no-provider
and scientific/hosted/large-document limitations below remain in force.

## Published native Quality catalogue integration

The `b83a09804` attempt passed all 89 normal lint gates, then lost a second
canonical ref race; it is not an accepted publication. Canonical `841c41466`
was preserved by normal merge at `f774de54a`. Its two runtime files enforce
current native Quality titles and project/facet admission. No local production
TypeScript/config/package delta exists against that published tree
(`quality-source-bridge.json`). The incoming owner's final compiler and
adjacent tests stay in `../2026-11-13-native-quality-currentness/README.md`.

Both changed suites pass **40/40**, and scoped lint has zero errors/warnings
(`quality-integration-checks.json`, `quality-integration-lint.json`). The
fixtures run actual catalogue/admission SQL through PGlite while mocking the
native producer and capture-audit seams. These cases do not establish browser
Quality catalogue acceptance, a database-wide atomic snapshot or large-catalogue
performance.

Normal startup exits 0 in 32.1 seconds and serves `f774de54a`. The real CSR
walk passes again in 36.2 seconds: 119/119 saved sections, delivered-byte-checked
draft Word/PDF and scientific preview, with zero HTTP/page/transport/functional
failures and 56 retained client-cancelled GETs (`quality-integration-browser.json`).
`quality-reviewer-*` and `quality-runtime.json` retain this separate observation.
No provider turn or scientific approval is initiated.

This local image/browser rehearsal does not exercise GitHub-hosted creation,
VS Code extension sign-in, a live AnA turn, model qualification, real scientific
approval, submission delivery or 10,000-page performance.
