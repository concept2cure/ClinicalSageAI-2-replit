# Next-Week AnA Experience + Abilities Lock — Non-Negotiable

**Date:** 2026-03-28  
**Branch:** `concept2cure-v2` only  
**Audience:** Claude Code  

## Mission
By next week, AnA must feel materially smarter, more useful, and more trustworthy inside the real product workflow.

This is not a generic AI improvement sprint.
This is not a model-shopping exercise.
This is not a prompt-tuning vanity project.

This is a **felt product value sprint** for AnA.

## Repo truth you must honor
AnA already has substantial architecture:
- layered system prompt assembly
- role overlays
- intent lenses
- authoring context
- section-specific guidance
- intelligence prefix
- 3-layer memory
- context enrichment
- workflow status injection
- 43 slash commands
- 39 operational commands
- submission workflows
- streaming chat infrastructure
- post-response persistence + RIM interception + command execution

Do NOT rebuild these from scratch.
Use them.
Strengthen them.
Make them feel excellent.

## What this sprint must improve
The user must feel these upgrades directly when chatting with AnA:
1. better answers
2. better grounding
3. better memory use
4. better next-step guidance
5. better execution of real actions
6. better document-aware help
7. better transparency when AnA is unsure or blocked
8. better speed/clarity in the conversation UX

If the user cannot feel the difference in the conversation, the sprint is not done.

## Priority order — do not drift

### 1. Grounding and context discipline
AnA must get better at using the right project, artifact, section, workflow, and evidence context automatically.

Required outcomes:
- stronger project-aware and artifact-aware answers
- section-aware guidance when user is working in a specific dossier/module/section
- better use of memory/context layers without bloating replies
- fewer generic answers when project data exists
- visible source/context references when grounded data is used

Likely files/seams:
- `server/services/ana-ri/orchestrator.ts`
- `server/services/ana-ri/context-enrichment.ts`
- `server/services/ana-ri/persona.ts`
- `server/services/memory-context-assembler.ts`
- `server/services/lumen-context-builder.ts`
- `server/services/client-intelligence-memory.ts`
- `server/services/working-memory.ts`

### 2. Next-best-action and workflow steering
AnA must stop being just informative and become more operationally useful.

Required outcomes:
- clearer next-step recommendations tied to actual project state
- smarter workflow steering by submission type and stage
- stronger detection of blockers, missing sections, readiness gaps, and likely next documents
- better “what should I do next?” behavior
- better use of readiness, recommendation, and workflow engines already in repo

Likely files/seams:
- `server/services/ana-ri/workflow-orchestration.ts`
- `server/services/ana-ri/context-enrichment.ts`
- `server/services/intelligence/next-best-action-engine.ts`
- `server/services/intelligence/recommendation-engine.ts`
- `server/services/intelligence/readiness-scoring-engine.ts`
- `server/services/intelligence/project-intelligence-service.ts`

### 3. Operational command reliability and usefulness
AnA must get better at actually doing useful things, not just describing them.

Required outcomes:
- improve command routing accuracy
- improve command/result explanation in chat
- reduce silent command weirdness and ambiguous execution outcomes
- make operational actions feel reliable and legible
- make command side effects explicit to the user

Likely files/seams:
- `server/services/ana-ri/command-executor.ts`
- `server/routes/ana-ri.ts`
- `server/routes/chat.ts`
- any command router/registry files already in use

### 4. Document-aware intelligence and drafting help
AnA must become more helpful inside the actual authoring loop.

Required outcomes:
- better section-specific drafting guidance
- stronger audit/review/risk/help responses while user is editing
- better artifact-aware conversation when a document is open
- tighter integration with authoring actions and governed artifact flow
- better handling of draft, review, approved, locked states in advice

Likely files/seams:
- `server/services/ana-ri/artifact-generator.ts`
- `server/routes/authoring-actions.ts`
- `server/services/lumen-context-builder.ts`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- relevant editor/artifact context providers already passed into chat

### 5. Chat UX quality in AnaPersistentPanel
The frontend chat experience must feel sharper and more useful without breaking chat-first rules.

Required outcomes:
- better suggested actions/prompts based on context
- better slash command discoverability
- better handling of streaming/working/error states
- cleaner presentation of action results, executed commands, and grounded sources
- reduced friction in using AnA as the primary interface

Likely files:
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- `config/domain-prompts.ts`
- relevant chat rendering/helpers/components already used by AnA

### 6. Failure transparency and trust
AnA must fail better.

Required outcomes:
- clearer acknowledgment when context is missing
- better distinction between grounded answer, inferred answer, and blocked action
- visible explanation when a command/action cannot complete
- no fake confidence when the system lacks evidence or permissions

Likely files/seams:
- `server/routes/ana-ri.ts`
- `server/services/ana-ri/orchestrator.ts`
- `server/services/ana-ri/command-executor.ts`
- `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`

## Non-goals
Do NOT:
- build a new AnA screen
- add dashboard-first surfaces
- introduce a second assistant identity
- rebuild memory, RIM, or AI gateway from scratch
- shop for another model unless absolutely required and repo truth proves it
- add hidden complexity that users cannot feel

## Mandatory repo-truth note before coding
Before implementation, produce a short note with:
1. what already exists for AnA abilities and UX
2. what the biggest felt weaknesses are right now
3. exact files you will edit
4. the 3–5 most important user-visible improvements you will deliver this sprint

Then code.

## Mandatory proof before claiming improvement
Before declaring this sprint done, provide:
1. exact files created/edited
2. what felt improvement each change targeted
3. example prompts / flows that now work better
4. any command or grounding improvements made
5. anything still honestly weak or deferred

## Definition of done
You may only claim success when a user would actually feel that:
- AnA is more grounded
- AnA is more context-aware
- AnA is more operationally useful
- AnA gives better next steps
- AnA is more helpful in document work
- AnA fails more honestly
- AnA’s conversation UX is smoother and more useful

If those things are not obvious in use, it is not done.

## Tone and execution style
Be practical.
Be ruthless about felt user value.
No architecture tourism.
Make AnA feel better fast.
