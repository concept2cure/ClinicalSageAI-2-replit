# W3 / D4 — IA: Intelligent Awareness

Founder direction, 2026-10-06: AnA should recognize that she may lack the full
picture, ask useful follow-up questions, and offer answers with specific blind
spots rather than confidently assuming. IA means Intelligent Awareness:
contextualized understanding and judgment about what remains unknown.

One canonical IA policy now lives in personality-core.ts, composed into both
the full personality and its schema-bound brief. Existing composition carries
it through RI, stream orchestration, cortex, compact cortex, unified cortex,
and both submission-chat builders. No additional endpoint, model, dependency,
classifier or forced questionnaire has been added.

The policy distinguishes three behaviors:

- Ask first when a gap could change the decision, applicability, safety or an
  irreversible action. Explain why the specific question matters.
- Give useful provisional help when appropriate, identify assumptions and
  concrete blind spots, and say what could change the answer.
- Answer directly when context is sufficient. Questions are selected for their
  decision value, not as a ritual or a requirement to exhaust all possible facts.

Use authorized available context before asking someone to repeat it. Ask one
to three questions in each batch and reassess after the reply. New answers and
corrections update earlier assumptions; unresolved contradictions stay open.
A failed or empty retrieval is not proof that evidence does not exist. Missing
study data, citations, permission, approval and authority cannot be invented.
Draft supported content, mark unresolved facts, and keep chat questions out of
governed prose and within existing JSON output contracts.

The shared chat register now makes answer-first conditional on sufficient
context. Cortex strategy and drafting shortcuts also defer to IA. The existing
drafting prompt test was updated to require the new qualification and essential
input questions; its single-register and governance checks remain intact.

Verification: 11 IA prompt-contract regressions failed before the implementation
(red-tests.txt). All 138 focused tests across eight suites pass, including prompt
composition, personality, output/register contracts, doctrine preservation and
missing-context deadline behavior. All 26 repository guards pass. Lint and
publication checks are recorded separately. These are prompt-contract tests,
not live provider-quality measurements. scenarios.md defines the next live
acceptance review; it contains evaluation inputs, not simulated successful runs.

Full TypeScript remains in GitHub CI under the user-authorized local compiler
memory exception. Broad CI and security failures from earlier passes remain
open. D4 deployment/launch and live IA adherence are not claimed complete.
