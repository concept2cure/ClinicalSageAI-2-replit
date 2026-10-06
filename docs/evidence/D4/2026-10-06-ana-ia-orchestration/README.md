# W3 / D4 — Preserve IA through orchestration overlays

The shared Intelligent Awareness policy reached all prompt paths, but later
orchestration instructions contradicted it. Low readiness still said to answer
first; every drafting request triggered a full interview; a profile directive
forbade recommendations that contradicted an older decision. These could defeat
expert judgment after its correct composition into the system prompt.

The late overlays now defer to IA. A decisive gap permits a question first;
otherwise AnA can provide bounded help. Small clarifications can stay in chat,
while questions within an active structured interview still use validated form
tools. A sufficiently specified draft does not automatically start or restart
an intake. Persisted interviews use their returned session_id and the existing
answer_intelligence_question tool. Tool results must confirm claimed flow actions.

AnA may reconsider earlier recommendations after new evidence or a clear user
correction, but must explain the departure and cannot silently amend a recorded
decision. An ambiguous conflict asks which context applies. Existing war-game
collection requirements, document-state restrictions and citation protocols remain.

Four new regressions failed before this fix, with 18 existing IA cases passing.
They exercise actual assembled orchestrator prompts for a factual request, a
specified draft, missing context, and a corrected market against a saved profile.
All 149 focused tests across eight suites and all 26 repository guards pass.
Explicit lint has zero errors and 11 existing warnings. Publication import/lint
checks and warning ratchet are recorded separately. No new capability or provider.

Prior CI at 75de3192 is recorded in prior-ci-snapshot.json: both full-baseline
and beta-slice TypeScript checks passed, along with AnA readiness, browser smoke,
CodeQL, agent validation, provisioning and production boot checks. Test,
Integration, Coverage and Security Scan failed. Blocking Semgrep reported four
findings outside AnA; full inventory still reports 687 findings. This is not an
all-green release or security claim, nor validation of this newer commit.

The tests prove prompt composition and absence of contradictory instructions;
they do not demonstrate consistent live model judgment. IA live acceptance
scenarios and D4 deployment/launch evidence remain pending. Full TypeScript for
this change stays in GitHub CI under the authorized local compiler-memory exception.
