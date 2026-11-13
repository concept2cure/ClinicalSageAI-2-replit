# Codespaces demo and Copilot handoff

F1 / W1 / D1–D2. Baseline `2a667bf51`, 2026-11-13. This continuation verifies and
finishes the existing startup and operator handoff. Current measurements and
publication receipts will be added as they complete; this initial inventory is
not a passing test or demo-readiness claim.

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

The first `post-start.sh` launched the app at the measured baseline and
completed the Lumen seed. Its tool session then became unaddressable while
the Docker exec, startup shell and seed remained running. The Python receipt
supervisor was absent, so no native completion exit or complete startup output
was retained (`post-start-interrupted.json`). This attempt is not a passing
full-start receipt. The other demo packs continue through their normal API
path; a later ordinary start will be measured separately.

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
existing data/export/preview assertions still fail the run. The classified
browser rerun, merged-source checks, complete normal start and publication are
pending until their actual receipts are appended.

This local image/browser rehearsal does not exercise GitHub-hosted creation,
VS Code extension sign-in, a live AnA turn, model qualification, real scientific
approval, submission delivery or 10,000-page performance.
