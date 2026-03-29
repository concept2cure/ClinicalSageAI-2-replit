# Next-Week AnA Experience + Abilities Lock PLUS — Non-Negotiable

**Date:** 2026-03-28  
**Branch:** `concept2cure-v2` only  
**Audience:** Claude Code  
**Supersedes in force with:** `docs/plans/NEXT_WEEK_ANA_EXPERIENCE_ABILITY_LOCK_2026-03-28.md`

## Mission
By next week, AnA must feel materially smarter, more grounded, more operationally useful, and more trustworthy in live Concept2Cure use.

This is not a paper improvement sprint.
This is not a hidden architecture sprint.
This is not a prompt poetry sprint.

This is a **felt product proof sprint**.

## Hard rule
You are not allowed to claim AnA improved because the architecture is elegant.
You may only claim AnA improved if the conversation output and user experience are visibly better in real benchmarked flows.

## What must be true when this is done
A real user chatting with AnA should feel all of these immediately:
1. AnA answers with the right project/artifact/section context more often
2. AnA gives fewer generic regulatory filler answers
3. AnA recommends more useful next actions
4. AnA executes real commands more reliably and explains what happened
5. AnA helps more inside document work and section-specific work
6. AnA shows clearer grounding, evidence, and confidence boundaries
7. AnA fails more honestly when context, evidence, or permissions are missing
8. AnA’s chat UX feels sharper, faster, and less confusing

If those are not obvious in transcripts and usage, the sprint is not done.

## Mandatory improvement tracks

### Track 1 — Grounding mode discipline
Every meaningful AnA response must internally resolve to one of these modes:
- **Grounded** — based on project/artifact/section/evidence/workflow context
- **Inferred** — reasoned from known context but not directly evidenced
- **Actioned** — completed a command, workflow step, or mutation
- **Blocked** — could not proceed because of missing context, permissions, or route support

At minimum this must exist in response metadata and be available for compact UI rendering.
Do not fake grounded certainty when the answer is merely inferred.

### Track 2 — No-generic-answer rule
If active project, artifact, section, workflow, or evidence context exists, AnA must prefer that over generic boilerplate.

This means:
- fewer broad textbook answers
- more project-specific and artifact-specific guidance
- section-aware and status-aware help
- obvious use of current submission context when available

### Track 3 — Next-move contract
Every substantial AnA answer must conclude with at least one concrete operational signal:
- next best action
- biggest blocker
- missing evidence/input
- recommended section/document to touch next
- recommended command or workflow action

Dead-end paragraphs are not acceptable for core regulated workflows.

### Track 4 — Action receipts
Whenever AnA executes or triggers a real action, the chat must produce a compact action receipt that makes the work legible.

Receipt must aim to show:
- what action ran
- whether it succeeded, partially succeeded, or was blocked
- what project/artifact/section was affected
- what changed
- what next action is available

No magician-smoke behavior.
Users must be able to see what actually happened.

### Track 5 — Stale-context and ambiguity handling
AnA must become more resistant to wrong-project, stale-memory, or ambiguous-intent answers.

Required outcomes:
- detect low-confidence or conflicting context
- prefer active project/workflow context when present
- explicitly say when the system is unsure which artifact/project/section the user means
- ask for precision only when necessary, otherwise make the best grounded resolution possible

### Track 6 — Document-state intelligence
AnA must change its behavior depending on document and workflow state.

At minimum, behavior must differ intelligently for:
- `draft`
- `review`
- `approved`
- `locked`

Examples:
- different suggestions
- different warnings
- different allowed actions
- different next-step guidance
- different mutation behavior where appropriate

### Track 7 — Failure honesty
AnA must fail more like a trusted operator and less like a guessing machine.

Required outcomes:
- clearly distinguish grounded vs inferred vs blocked situations
- explain when evidence is missing
- explain when command execution could not complete
- explain when permissions or route support are missing
- never present a hallucinated action result as if it happened

### Track 8 — Latency and UX sharpness
AnA must feel faster and cleaner in use.

You do not need to chase premature micro-optimizations, but you must improve felt responsiveness.

Required outcomes:
- reduce spinner purgatory
- show clearer working state during command execution / enrichment
- render action receipts and executed-command summaries cleanly
- reduce friction in suggested actions and slash command discovery
- make the UI feel less muddy during streaming and post-response actions

## Benchmark requirement — mandatory
You must not declare this sprint complete without a benchmark suite.

Create and use a benchmark set of 20–30 prompts covering:
1. project status
2. next best action
3. dossier/section-specific help
4. document-state-aware guidance
5. evidence-grounded Q&A
6. command execution
7. failure transparency
8. ambiguity/stale-context handling
9. review/verify/publish guidance
10. regulated drafting assistance

For each benchmark prompt, record:
- prompt text
- expected context
- before behavior summary
- after behavior summary
- response mode (Grounded / Inferred / Actioned / Blocked)
- whether next move was present
- whether action receipt was present when relevant
- whether grounded sources/context were shown when relevant

## Transcript proof requirement — mandatory
Before claiming success, provide saved transcript-style proof for at least:
- 2 grounding wins
- 2 next-best-action wins
- 2 command/action receipt wins
- 2 document-aware/help wins
- 2 honest-failure wins

The whole point is to prove the user would actually feel the difference.

## Priority files and seams
Focus on existing AnA seams, do not rebuild the system:
- `server/services/ana-ri/orchestrator.ts`
- `server/services/ana-ri/context-enrichment.ts`
- `server/services/ana-ri/persona.ts`
- `server/services/ana-ri/command-executor.ts`
- `server/services/ana-ri/workflow-orchestration.ts`
- `server/services/ana-ri/artifact-generator.ts`
- `server/services/memory-context-assembler.ts`
- `server/services/lumen-context-builder.ts`
- `server/services/working-memory.ts`
- `server/services/client-intelligence-memory.ts`
- `server/services/intelligence/next-best-action-engine.ts`
- `server/services/intelligence/recommendation-engine.ts`
- `server/services/intelligence/readiness-scoring-engine.ts`
- `server/routes/ana-ri.ts`
- `server/routes/chat.ts`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- `config/domain-prompts.ts`

## Non-goals
Do NOT:
- build a new AnA screen
- create a second assistant identity
- rebuild memory, RIM, AI gateway, or workflow systems from scratch
- hide the work in backend-only improvements nobody can feel
- claim improvement without transcript proof and benchmark evidence

## Mandatory repo-truth note before coding
Before implementation, provide a short note with:
1. current felt weaknesses in AnA
2. exact files you will edit
3. the benchmark categories you will use
4. the 5 most important user-visible improvements you will deliver

Then code.

## Mandatory deliverables
Before declaring done, provide all of the following:
1. exact files created/edited
2. benchmark suite file(s)
3. transcript proof file(s)
4. what each change improved in user experience
5. what still remains weak or deferred

## Definition of done
You may only claim this sprint succeeded when:
- benchmark prompts show materially better outcomes
- transcript proof makes the improvement obvious
- AnA is more grounded
- AnA gives a next move more often
- AnA uses project/artifact/section context better
- AnA executes actions more legibly with receipts
- AnA fails more honestly
- AnA chat UX feels cleaner and more useful

If those things are not obvious, it is not done.

## Tone and execution style
Be practical.
Be measurable.
Be impossible to bullshit.
Make AnA feel better fast.
