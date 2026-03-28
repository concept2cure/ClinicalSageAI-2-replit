# Skill: Chat-First Design — No New Screens

## Description

ALL new features MUST be accessible through the AnA chat interface. No new screens, no new panels, no new modals, no new pages. The chat IS the interface.

## Activation

This skill activates when:
- Adding any new user-facing feature or capability
- Wiring a backend service to the frontend
- Designing how users interact with intelligence, analytics, or tools
- Creating suggested actions, commands, or workflows
- Discussing how to expose a new capability to users

## Core Principle (NON-NEGOTIABLE)

**The chat is the product.** Every capability — predictions, comparisons, exports, analysis, navigation, document authoring, biostatistics, compliance scanning — is accessed by talking to AnA or selecting inline options within the conversation. Think Claude, not Salesforce.

### The Honest Lesson

The default instinct is to build dashboard-first, not conversation-first. Every surface will accumulate analytics widgets, scorecards, and control density that violate this principle. If data can surface through the conversation, it MUST NOT be plastered on a dashboard or toolbar. Intelligence informs the conversation — it does not replace it. Fight the dashboard instinct relentlessly.

### The Non-Negotiable Constraint: Zero Capability Loss

**We still need to achieve all the results of each dashboard, no matter what.** Removing chrome does NOT mean removing capability. Every metric, score, workflow step, readiness check, and action that a dashboard provided MUST still be achievable — through conversation, slash commands, inspector panels, or inline results. If you remove a permanent widget, you MUST verify the same outcome is reachable via chat (`/status`, `/readiness`, `/checklist`, `/workflow`, etc.) or an on-demand inspector. Deleting a scorecard without ensuring the user can still get that score on demand is a regression, not a simplification.

## Rules

### 1. No New UI Surfaces
- **FORBIDDEN**: New pages, new tabs, new modals, new sidebars, new panels for features
- **ALLOWED**: Inline content within chat messages (tables, cards, buttons, links)
- **ALLOWED**: Quick-select options in the input bar (intent lenses, mode selectors)
- **ALLOWED**: Action buttons that appear on hover over messages (copy, save, insert, export, regenerate)
- **ALLOWED**: Suggested action chips in the empty state
- **ALLOWED**: Slash command autocomplete dropdown
- **ALLOWED**: Conversation health bar (warning banner, not a panel)
- **ALLOWED**: Attached file pills in the input area

### 2. Features as Chat Commands
Every new capability should be invocable by:
1. **Typing naturally** — "What's our submission risk?" triggers Foresight
2. **Slash commands** — `/risk`, `/readiness`, `/sap`, etc.
3. **Suggested actions** — Context-aware chips that appear based on workflow stage
4. **Inline results** — Response renders as rich markdown directly in the conversation

### 3. Slash Commands Are the Power User Interface
When adding a new capability:
1. Add a slash command to `context-enrichment.ts` (detectSlashCommand regex + enrichMap + commandDescriptions)
2. Add natural language triggers (TRIGGER_PATTERNS array)
3. Add to frontend autocomplete in `AnaPersistentPanel.tsx`
4. The command enriches the system prompt — AnA handles the rest

**Current slash commands (43):**
`/risk` `/readiness` `/precedent` `/claims` `/recommend` `/next` `/simulate` `/signals` `/assess` `/twin` `/consistency` `/deficiencies` `/knowledge` `/decisions` `/sap` `/power` `/dose` `/defensibility` `/design` `/safety` `/cmc` `/csr` `/device` `/ectd` `/audit` `/amend` `/review` `/memo` `/brief` `/strategy` `/draft` `/scan` `/checklist` `/freeze` `/sign` `/submit` `/preflight` `/workflow` `/status` `/help` `/export` `/decisions`

### 4. Operational Commands Are the Execution Layer
AnA executes real operations through command blocks in her responses:
- `\`\`\`command {"command": "create_project", "params": {...}} \`\`\``
- Backend `processCommandsInResponse()` parses and executes
- 39 operational commands: create/update projects, artifacts, tasks, submissions, reviews, compliance scans, exports, milestones, SAPs, dose escalation, defensibility assessments, trial designs, document freezing, e-signatures, submissions

### 5. Rich Responses, Not Rich UI
Instead of building dashboards, render data as structured messages:
- Tables for comparisons and scores
- Markdown for analysis and narrative
- Inline action buttons within responses (save, insert, export)
- Links that surface as clickable pills (link extraction)
- Evidence tags ([KNOWN], [INFERRED], [MISSING])

### 6. Minimum Chrome, Maximum Content
- Every pixel of UI should earn its place
- The input bar + conversation area + suggested actions = the entire product surface
- Settings, mode selectors, and context indicators live in the input bar
- Action buttons appear on hover — invisible until needed
- Conversation health bar appears only when context is heavy (>8K tokens)

### 7. Intelligence Should Feel Ambient
- Project intelligence profile injected automatically — AnA "knows" the project
- Workflow status injected automatically — AnA knows what phase you're in
- Foresight/readiness/RIM data injected when the user's question matches triggers
- Memory (3-layer) injected on every message — working + project + client
- Evidence confidence, deficiency patterns, precedent data — all auto-enriched
- User never manages intelligence — it just works

### 8. Context Enrichment Architecture
When adding intelligence to AnA:
1. **Add trigger patterns** in `context-enrichment.ts` — regex patterns that detect user intent
2. **Add enrichment function** — queries DB or calls live services, returns markdown block
3. **Inject into system prompt** — block appended before LLM sees the conversation
4. **AnA references naturally** — no special UI needed, she just "knows"

**Current enrichment layers:**
- Project intelligence profile (always)
- Workflow status (when submission type known)
- Foresight/risk signals (on risk triggers)
- Precedent data (on precedent triggers)
- CRL/RTF deficiency patterns (on deficiency triggers)
- Readiness scoring (live engine, on readiness triggers)
- Recommendations/next-best-actions (live engine, on recommendation triggers)
- Evidence chains (on claims triggers)
- RIM signals (on signal triggers)
- Biostatistics context (on biostat triggers)
- Safety/CMC/CSR/Device/eCTD domain data (on domain triggers)
- Section-specific ICH M4 guidance (when authoring context has section code)

### 9. Document Authoring Through Chat
Documents are authored, audited, amended, and delivered through conversation:
- `/draft` generates submission-ready CTD sections
- `/audit` reviews as a hostile reviewer with severity-rated findings
- `/amend` tracks changes with cross-section impact analysis
- Auto-artifact creation via `ana-action` blocks in responses
- Insert into editor via action button on messages
- Save to project vault via action button
- Full lifecycle: draft → scan → audit → checklist → preflight → freeze → sign → submit

### 10. Workflow Guidance Through Chat
Complete submission workflows accessible via `/workflow`:
- 8 submission types: IND, NDA, BLA, MAA, 510(k), PMA, De Novo, CER
- Phase-by-phase progress tracking
- Role-specific task assignments
- Critical path identification
- Next step recommendation with suggested commands

## Anti-Patterns

| Anti-Pattern | What to Do Instead |
|---|---|
| "Build a Foresight dashboard" | `/risk` enriches context, AnA responds with data |
| "Create a precedent comparison modal" | `/precedent` renders table in chat |
| "Add a memory browser panel" | AnA references memory naturally |
| "Build a document lifecycle UI" | `/workflow` shows progress, `/draft`/`/audit`/`/freeze` execute steps |
| "Create a biostatistics form" | AnA gathers parameters conversationally, computes, delivers |
| "Add a readiness dashboard page" | `/status` gives a 5-line briefing |
| "Build a compliance checklist UI" | `/checklist` generates it, inline in chat |
| "Create an export dialog" | Action button on messages: Export as markdown |
| "Add a settings page for AnA" | Mode/lens selectors in the input bar |

## Reference Files

| Purpose | Path |
|---------|------|
| AnA chat component | `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` |
| System prompt | `server/services/ana-ri/persona.ts` |
| Context enrichment | `server/services/ana-ri/context-enrichment.ts` |
| Command executor | `server/services/ana-ri/command-executor.ts` |
| Workflow orchestration | `server/services/ana-ri/workflow-orchestration.ts` |
| Orchestrator | `server/services/ana-ri/orchestrator.ts` |
| Artifact generator | `server/services/ana-ri/artifact-generator.ts` |
| Streaming endpoint | `server/routes/ana-ri.ts` (POST /api/ana-ri/stream) |
| Ana response CSS | `client/src/index.css` (.ana-response class) |
