# Skill: AnA 1.0 RI — Operating System Reference

## Description

Master reference for AnA's complete capabilities, architecture, and operational rules. Use when modifying AnA's behavior, adding capabilities, or auditing her systems.

## Activation

This skill activates when:
- Modifying any file in `server/services/ana-ri/`
- Modifying `server/routes/ana-ri.ts`
- Modifying `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
- Adding new slash commands or operational commands
- Modifying the system prompt or enrichment logic
- Wiring new backend services into AnA
- Discussing AnA's capabilities or architecture

## Architecture

### System Prompt Assembly (what AnA "sees")

The system prompt is assembled in layers, from innermost to outermost:

1. **Core persona** (`persona.ts`) — identity, communication style, expertise, document authoring rules, biostatistics capabilities, subspecialty knowledge
2. **Role overlay** — CEO/RA Lead/Medical Writer/Clinical Lead/CMC Lead/Investor adapt tone
3. **Intent lens overlay** — audit/improve/risk/strategy/compare sharpen focus
4. **Operational commands** (`command-executor.ts → buildCommandContextForPrompt()`) — 39 commands AnA can execute
5. **Authoring context** — section code, artifact status, workflow stage, readiness blockers
6. **Section-specific ICH M4 guidance** (`lumen-context-builder.ts → buildSectionSpecificPrompt()`) — detailed requirements per CTD section
7. **Intelligence prefix** (`lumen-context-builder.ts → getIntelligencePrefix()`) — client + project knowledge
8. **3-layer memory** (`memory-context-assembler.ts`) — working + project + client memory
9. **Context enrichment** (`context-enrichment.ts`) — auto-injected Foresight/Precedent/RIM/domain data based on triggers
10. **Project intelligence profile** — strategy, risks, decisions, insights
11. **Workflow status** — submission phase, progress, blockers, next step
12. **Conversation history** — server-side thread history (preferred) or client-provided

### Request Flow (streaming)

```
User types message
  → Frontend sends to POST /api/ana-ri/stream
  → Server resolves thread, persists user message
  → Orchestrator detects intent, submission type, role
  → Section-specific guidance injected if section code present
  → Intelligence prefix + 3-layer memory loaded
  → Context enrichment: triggers detected, live services called, data injected
  → Full system prompt assembled
  → AI Gateway routes to Claude (primary) or OpenAI (fallback)
  → Tokens stream via SSE to frontend
  → Frontend renders tokens in real-time with cursor
  → On complete: persist assistant message, RIM interception, guidance execution, command execution
  → Done event sent with metadata (executed actions, commands, enrichment sources)
```

### Post-Response Processing

After every streaming response completes:
1. **Persist** assistant message to thread
2. **RIM interception** — captures regulatory patterns and signals (non-blocking)
3. **Guidance executor** — detects `ana-action` blocks, auto-creates artifacts (confidence-gated)
4. **Command executor** — detects `command` blocks, executes operational commands
5. **Results** sent to frontend in the 'done' SSE event

## Slash Commands (43)

### Intelligence
| Command | Enrichment | Description |
|---------|-----------|-------------|
| `/assess` | readiness + recommendations + signals + foresight | Full project assessment |
| `/readiness` | Live readiness scoring engine | Score + dimensions + gaps + predictions |
| `/risk` | foresight + CRL/RTF | Risk profile with predictions |
| `/recommend` | Live next-best-action engine | Prioritized action list |
| `/next` | Same as /recommend | "What should I do next?" |
| `/signals` | Live RIM signals | Accumulated intelligence signals |
| `/status` | readiness + workflow + recommendations | Quick 5-line briefing |

### Analysis
| Command | Enrichment | Description |
|---------|-----------|-------------|
| `/twin` | claims + CRL/RTF + readiness | Submission twin analysis |
| `/consistency` | Live cross-module analysis | Stale refs, gaps, orphaned docs |
| `/claims` | Evidence confidence model | Evidence chain strength + confidence |
| `/deficiencies` | Deficiency taxonomy (65+ patterns) | Known patterns for submission type |
| `/simulate` | CRL/RTF patterns | Simulate reviewer challenges |
| `/precedent` | Precedent data from project memory | Similar products, predicates |

### Biostatistics
| Command | Enrichment | Description |
|---------|-----------|-------------|
| `/sap` | Biostat context | Generate Statistical Analysis Plan |
| `/power` | Biostat context | Sample size and power calculation |
| `/dose` | Biostat context | Dose escalation design (3+3, BOIN, CRM) |
| `/defensibility` | Biostat context | 7-dimension statistical defensibility |
| `/design` | Biostat context | Clinical trial design |

### Subspecialties
| Command | Enrichment | Description |
|---------|-----------|-------------|
| `/safety` | Safety intelligence | TEAE, SAE, benefit-risk, DSUR narratives |
| `/cmc` | CMC intelligence | Manufacturing, comparability, Module 3 |
| `/csr` | CSR intelligence | Clinical study report analysis |
| `/device` | Device intelligence | 510(k), PMA, De Novo, EU MDR |
| `/ectd` | eCTD intelligence | Module structure, artifact placement |

### Document Authoring
| Command | Enrichment | Description |
|---------|-----------|-------------|
| `/draft` | Section-specific ICH M4 | Draft submission-ready CTD section |
| `/audit` | readiness + claims | Hostile reviewer audit with findings |
| `/amend` | Amendment history | Change tracking with impact analysis |
| `/review` | claims + CRL/RTF | Regulatory review from reviewer perspective |
| `/scan` | claims + CRL/RTF | Deficiency scanning |
| `/memo` | foresight | Risk assessment memo (go/no-go) |
| `/brief` | CRL/RTF | Reviewer question anticipation brief |
| `/strategy` | precedent + foresight | Regulatory strategy note |

### Document Lifecycle
| Command | Enrichment | Description |
|---------|-----------|-------------|
| `/checklist` | readiness | Compliance checklist generation |
| `/freeze` | eCTD | Freeze document (immutable snapshot) |
| `/sign` | eCTD | Electronic signature (21 CFR Part 11) |
| `/submit` | readiness + eCTD | Submit to regulatory workflow |
| `/preflight` | (uses authoring actions API) | Section/module/dossier preflight |

### Navigation & Meta
| Command | Enrichment | Description |
|---------|-----------|-------------|
| `/workflow` | Workflow status | Full submission workflow progress |
| `/knowledge` | Project memory search | Search knowledge base |
| `/decisions` | (client-side API call) | Decision audit trail |
| `/help` | readiness + recommendations | Show capabilities with project data |
| `/export` | (client-side) | Download conversation as markdown |

## Operational Commands (41)

### Projects & Artifacts
`create_project` `list_projects` `update_project` `create_artifact` `update_artifact` `update_artifact_status` `list_artifacts` `place_in_dossier` `search_artifacts` `list_artifact_versions` `export_artifact` `compare_versions` `review_version_impact` `revert_to_version`

### Tasks & Submissions
`create_task` `update_task` `list_tasks` `check_dossier_readiness` `create_submission_package` `create_milestone` `update_milestone` `list_milestones`

### Review & Compliance
`create_review_thread` `add_review_comment` `run_compliance_scan` `list_team_members` `load_user_context` `load_conversation_history`

### Biostatistics
`generate_sap` `compute_sample_size` `compute_dose_escalation` `assess_defensibility` `design_trial`

### Market Access & Diagnostics
`analyze_cms_strategy` `assess_diagnostic_validation`

### Document Lifecycle
`draft_section` `scan_deficiencies` `freeze_document` `sign_document` `export_document` `generate_checklist` `submit_document`

## Submission Workflows (8)

| Type | Steps | Phases | Agency |
|------|-------|--------|--------|
| IND | 20 | Pre-IND → M1 → M2 → M3 → M5 → Review | FDA |
| NDA | 17 | Planning → M2 → M3 → M5 → Labeling → Filing | FDA |
| BLA | 8 | Strategy → M2 → M3 (Biologics) → Filing | FDA |
| MAA | 9 | Pre-sub → M1 (EU) → M2-5 → Filing | EMA |
| 510(k) | 11 | Strategy → Drafting → Review | FDA |
| PMA | 8 | Strategy → Content → Review | FDA |
| De Novo | 6 | Classification → Content → Filing | FDA |
| CER | 7 | Planning → Content → Filing | EMA/NB |

## Natural Language Triggers (13 domains)

Each trigger auto-enriches the system prompt when matched:

| Domain | Example phrases |
|--------|----------------|
| Foresight | "predict", "probability", "risk score", "approval rate" |
| Precedent | "similar product", "predicate", "benchmark" |
| CRL/RTF | "rejection", "deficiency", "refuse to file" |
| Readiness | "are we ready", "readiness score", "completeness" |
| Recommendations | "what should", "recommend", "next step" |
| Claims | "evidence", "claim", "substantiate" |
| Simulation | "simulate", "reviewer question", "what-if" |
| Biostatistics | "sample size", "power", "dose escalation", "SAP" |
| Safety | "adverse event", "TEAE", "benefit-risk" |
| CMC | "manufacturing", "comparability", "CQA" |
| CSR | "clinical study report", "ICH E3" |
| Device | "510(k)", "predicate", "medical device" |
| eCTD | "module structure", "CTD", "dossier" |

## User Roles (7)

| Role | AnA adapts for |
|------|---------------|
| CEO | Risk exposure, timeline, investor signals, board language |
| RA Lead | Regulatory citations, pathway logic, procedural rigor |
| Medical Writer | Narrative clarity, prose quality, section architecture |
| Clinical Lead | Endpoint rationale, protocol defensibility, safety narrative |
| CMC Lead | Control strategy, manufacturing, Module 3 defensibility |
| Investor | Regulatory risk profile, approval probability, de-risking |
| General | Adaptive, comprehensive |

## Key Files

| File | Purpose | Size |
|------|---------|------|
| `server/services/ana-ri/persona.ts` | System prompt + role overlays | Core identity |
| `server/services/ana-ri/context-enrichment.ts` | All triggers + enrichment functions | Intelligence injection |
| `server/services/ana-ri/command-executor.ts` | 41 operational commands + parser | Execution layer |
| `server/services/ana-ri/workflow-orchestration.ts` | 8 submission workflows | Workflow guidance |
| `server/services/ana-ri/orchestrator.ts` | Intent detection, prompt assembly | Orchestration |
| `server/services/ana-ri/artifact-generator.ts` | 8 document type templates | Document generation |
| `server/routes/ana-ri.ts` | Streaming + non-streaming endpoints | API layer |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | Chat UI | Frontend |
| `client/src/index.css` | `.ana-response` CSS | Typography |

## Adding New Capabilities

When adding a new capability to AnA:

1. **Define the trigger** — Add regex patterns to `context-enrichment.ts`
2. **Add enrichment function** — Query DB or call live service, return markdown block
3. **Add slash command** — Update `detectSlashCommand()` regex, enrichMap, commandDescriptions
4. **Add to frontend** — Add to slash command autocomplete array in AnaPersistentPanel
5. **If operational** — Add command handler to `command-executor.ts`, register in COMMAND_REGISTRY, add to command router
6. **If workflow step** — Add to appropriate workflow in `workflow-orchestration.ts`
7. **Update system prompt** — Add capability description to `persona.ts` if needed
8. **Test** — Verify TypeScript compiles, no empty catches without comments, all error paths have feedback
9. **Audit** — Run against ui-standards.md and chat-first-design.md checklists

## Audit Checklist (AnA-Specific)

Before shipping any AnA change:

- [ ] New slash commands added to detection regex + enrichMap + descriptions + frontend autocomplete
- [ ] New operational commands added to CommandName type + COMMAND_REGISTRY + commandMap router
- [ ] Enrichment functions return empty string on failure (never throw)
- [ ] SSE events follow the protocol: thread_id → orchestration → text chunks → done
- [ ] Post-response processing: persist → RIM intercept → guidance exec → command exec
- [ ] Server-side thread history loads before building messages (use `thread_id` not `threadId`)
- [ ] File IDs passed through to context if attached
- [ ] Response envelope: `sendSuccess()`/`sendError()` for non-SSE, SSE data events for streaming
- [ ] All catch blocks commented
- [ ] Toast notifications for errors in frontend
- [ ] New capabilities follow chat-first design — no new UI surfaces
- [ ] Zero capability loss — every result a removed dashboard/widget delivered is achievable via AnA conversation, slash commands, or on-demand inspector panels
