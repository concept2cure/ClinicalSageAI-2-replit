# Concept2Cure.RI Agent Architecture

## Document Control
| Attribute | Value |
|-----------|-------|
| Document ID | ARCH-AGENT-001 |
| Version | 1.0.0 |
| Date | 2025-01-14 |
| Classification | Technical Architecture |
| Compliance | 21 CFR Part 11, ISO 14971 |

---

## 1. Executive Summary

Concept2Cure.RI implements a sophisticated multi-agent AI architecture designed for regulatory affairs in life sciences. This document describes the two agent systems present in the codebase:

1. **Multi-Agent Council** (`server/services/multi-agent-council.ts`) - Production-ready, Part 11 compliant
2. **Cognitive Ecosystem** (`server/services/cognitive-ecosystem/`) - Next-generation LangGraph implementation

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Concept2Cure.RI Agent Layer                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────────┐│
│  │   PRODUCTION (Current)      │    │   NEXT-GEN (Cognitive Ecosystem)   ││
│  │                             │    │                                     ││
│  │  multi-agent-council.ts     │    │  cognitive-ecosystem/               ││
│  │  ├─ Part 11 Compliant       │    │  ├─ langgraph-orchestrator.service ││
│  │  ├─ Audit Trail             │───▶│  ├─ agent-runtime.service          ││
│  │  ├─ E-Signatures            │    │  ├─ LangGraph State Machines       ││
│  │  └─ Specialized Agents      │    │  └─ Human-in-the-Loop Breakpoints  ││
│  │                             │    │                                     ││
│  └─────────────────────────────┘    └─────────────────────────────────────┘│
│           │                                        │                        │
│           ▼                                        ▼                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Cortex Prime Unified Brain                           ││
│  │                    (cortexPrimeService.ts)                              ││
│  │  ┌───────────┬───────────┬───────────┬───────────┬───────────────────┐ ││
│  │  │  Atoms    │  Threads  │  Agents   │  Memory   │  Knowledge Graph  │ ││
│  │  │  (Facts)  │  (Conv)   │  (AI)     │  (Long)   │  (Semantic)       │ ││
│  │  └───────────┴───────────┴───────────┴───────────┴───────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    21 CFR Part 11 Compliance Layer                      ││
│  │                    (cortexComplianceService.ts)                         ││
│  │  ┌───────────────┬─────────────────┬──────────────────────────────────┐ ││
│  │  │  Audit Trail  │  E-Signatures   │  Access Control (RBAC)           │ ││
│  │  │  (Immutable)  │  (SHA-256)      │  (RLS + Policies)                │ ││
│  │  └───────────────┴─────────────────┴──────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Production System: Multi-Agent Council

### 3.1 Location
```
server/services/multi-agent-council.ts
```

### 3.2 Purpose
The Multi-Agent Council implements a council-based decision-making system where specialized AI agents collaborate on regulatory tasks. It is production-ready and fully compliant with 21 CFR Part 11.

### 3.3 Agent Types

| Agent | Role | Domain Expertise |
|-------|------|------------------|
| `regulatory-strategist` | Submission strategy | FDA, EMA, PMDA pathways |
| `clinical-analyst` | Clinical evidence | CER, CSR, literature |
| `quality-expert` | Quality systems | CMC, GMP, validation |
| `compliance-auditor` | Regulatory compliance | Part 11, Annex 11 |
| `risk-assessor` | Risk analysis | ISO 14971, FMEA |
| `document-specialist` | Document authoring | eCTD, CTD, IMDRF |

### 3.4 Council Decision Flow

```
User Request
     │
     ▼
┌─────────────┐
│  Dispatch   │  Route to appropriate agent(s)
└─────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Agent Processing                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Agent A    │  │   Agent B    │  │   Agent C    │   ...    │
│  │  (parallel)  │  │  (parallel)  │  │  (parallel)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────┐
│  Synthesis  │  Combine agent outputs
└─────────────┘
     │
     ▼
┌─────────────┐
│  Consensus  │  Vote on recommendations
└─────────────┘
     │
     ▼
┌─────────────┐
│ Audit Trail │  Part 11 compliant logging
└─────────────┘
     │
     ▼
  Response
```

### 3.5 Part 11 Compliance Features

- **Audit Trail**: All agent decisions logged with timestamp, user, reason
- **E-Signatures**: Agent recommendations can require electronic signatures
- **Access Control**: Role-based access to agent capabilities
- **Data Integrity**: SHA-256 hash chains for decision records
- **Version Control**: Full versioning of agent configurations

---

## 4. Next-Generation: Cognitive Ecosystem

### 4.1 Location
```
server/services/cognitive-ecosystem/
├── langgraph-orchestrator.service.ts
├── agent-runtime.service.ts
└── (additional modules)
```

### 4.2 Purpose
The Cognitive Ecosystem is a next-generation implementation using LangGraph for complex, stateful agent workflows with human-in-the-loop capabilities.

### 4.3 Key Features

| Feature | Description |
|---------|-------------|
| **LangGraph State Machines** | Complex multi-step workflows |
| **Human-in-the-Loop** | Breakpoints for human review |
| **Checkpointing** | Resume interrupted workflows |
| **Parallel Execution** | Multi-agent parallel processing |
| **Streaming** | Real-time response streaming |

### 4.4 Workflow Architecture

```
                    ┌──────────────────┐
                    │  LangGraph State │
                    │     Machine      │
                    └────────┬─────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Regulatory  │  │  Analysis    │  │  Document    │
    │    Node      │  │    Node      │  │    Node      │
    └──────────────┘  └──────────────┘  └──────────────┘
           │                 │                 │
           │    ┌────────────┴────────────┐    │
           │    │     Breakpoint?          │    │
           │    │   (Human Review)         │    │
           │    └────────────┬────────────┘    │
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                    ┌────────▼─────────┐
                    │   Synthesis      │
                    │     Node         │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   Output         │
                    └──────────────────┘
```

### 4.5 Integration Status

| Component | Status | Notes |
|-----------|--------|-------|
| Schema (Migration 063) | ✅ Deployed | `cortex_agent_sessions`, `cortex_workflow_checkpoints` |
| LangGraph Orchestrator | ✅ Implemented | Ready for integration |
| Agent Runtime | ✅ Implemented | Event-driven architecture |
| Route Wiring | ⏳ Pending | Not connected to Express routes |
| Part 11 Compliance | ✅ Implemented | Via cortexComplianceService |

---

## 5. Database Schema

### 5.1 Cortex Prime Tables (Migration 073)

```sql
-- Core knowledge storage
cortex_atoms           -- Atomic facts and knowledge units
cortex_atom_history    -- Immutable history of changes
cortex_atom_embeddings -- Dual vector embeddings (1536 + 3072)

-- Conversation threads
cortex_threads         -- Thread metadata
cortex_thread_messages -- Individual messages

-- Agent system
cortex_agents          -- Agent configurations
cortex_agent_memories  -- Long-term agent memory
```

### 5.2 Cognitive Agent Tables (Migration 063)

```sql
-- Agent sessions
cortex_agent_sessions      -- Active agent sessions
cortex_agent_events        -- Event log
cortex_workflow_checkpoints -- LangGraph checkpoints
cortex_workflow_breakpoints -- Human-in-the-loop breakpoints
```

### 5.3 Part 11 Compliance Tables (Migration 080)

```sql
-- Audit trail
compliance_audit_trail     -- Immutable audit events
compliance_audit_trail_hash_chain -- SHA-256 hash verification

-- E-Signatures
compliance_electronic_signatures -- Electronic signature records

-- Access control
compliance_access_logs     -- Access event logging
compliance_access_policies -- RBAC policies
```

---

## 6. AI Provider Integration

### 6.1 Provider Router

The `aiProviderRouter.js` provides a unified interface for AI providers:

```javascript
// Current Implementation
import aiProviderRouter from './services/aiProviderRouter.js';

// Available Providers
- kimi (Moonshot AI) - ACTIVE, Chinese AI provider
- openai (future)    - Planned
- anthropic (future) - Planned  
- azure (future)     - Planned
```

### 6.2 Provider Selection

```javascript
// Automatic selection based on availability and capability
const provider = aiProviderRouter.selectProvider('regulatory-analysis');

// Manual provider selection
const result = await aiProviderRouter.analyzeRegulatoryDocument(text, 'CER', {
  provider: 'kimi'
});
```

---

## 7. Migration Path

### 7.1 Current State (January 2025)

```
Production Traffic → Multi-Agent Council → Cortex Prime → Compliance Layer
```

### 7.2 Target State (Q2 2025)

```
Production Traffic → Cognitive Ecosystem → Cortex Prime → Compliance Layer
                          │
                          └─── LangGraph State Machines
                               Human-in-the-Loop
                               Advanced Workflows
```

### 7.3 Migration Steps

1. **Phase 1** (Complete): Deploy Cortex Prime unified brain
2. **Phase 2** (Complete): Deploy Part 11 compliance layer
3. **Phase 3** (In Progress): Wire cognitive ecosystem to routes
4. **Phase 4** (Planned): Gradual traffic shift with feature flags
5. **Phase 5** (Planned): Deprecate multi-agent-council

---

## 8. API Routes

### 8.1 Current Routes (Multi-Agent Council)

```
POST /api/cortex/council/query     - Query the agent council
POST /api/cortex/council/task      - Submit task to council
GET  /api/cortex/council/status    - Get council status
```

### 8.2 Planned Routes (Cognitive Ecosystem)

```
POST /api/cognitive/workflows      - Start new workflow
GET  /api/cognitive/workflows/:id  - Get workflow status
POST /api/cognitive/workflows/:id/breakpoints/:bid/resume - Resume at breakpoint
POST /api/cognitive/threads        - Create agent thread
POST /api/cognitive/threads/:id/messages - Add message to thread
```

---

## 9. Compliance Considerations

### 9.1 21 CFR Part 11 Requirements

| Requirement | Multi-Agent Council | Cognitive Ecosystem |
|-------------|---------------------|---------------------|
| Audit Trails | ✅ Complete | ✅ Via compliance layer |
| E-Signatures | ✅ Complete | ✅ Via compliance layer |
| Access Control | ✅ Complete | ✅ Via compliance layer |
| Data Integrity | ✅ Hash chains | ✅ Hash chains |
| Version Control | ✅ Complete | ✅ Complete |

### 9.2 ISO 14971 Risk Controls

All agent outputs that affect regulatory decisions are:
- Logged with full traceability
- Subject to human review (breakpoints)
- Validated against reference data
- Versioned for reproducibility

---

## 10. File Reference

### 10.1 Core Services

| File | Lines | Purpose |
|------|-------|---------|
| `server/services/cortexPrimeService.ts` | 1,144 | Unified AI brain |
| `server/services/cortexComplianceService.ts` | 1,038 | Part 11 compliance |
| `server/services/multi-agent-council.ts` | ~800 | Production agents |
| `server/services/cognitive-ecosystem/langgraph-orchestrator.service.ts` | ~600 | LangGraph workflows |
| `server/services/cognitive-ecosystem/agent-runtime.service.ts` | ~400 | Agent runtime |
| `server/services/aiProviderRouter.js` | ~250 | AI provider abstraction |
| `server/services/kimiAIService.js` | ~200 | Kimi AI (Moonshot) client |

### 10.2 Database Migrations

| Migration | Purpose |
|-----------|---------|
| 073_cortex_prime_unified_brain.sql | Core Cortex Prime schema |
| 063_gcc_cognitive_agent_runtime.sql | Cognitive ecosystem schema |
| 080_gcc_21cfr_part11_compliance.sql | Part 11 compliance schema |

---

## 11. Appendix: Glossary

| Term | Definition |
|------|------------|
| **Atom** | Atomic knowledge unit in Cortex Prime |
| **Thread** | Conversation thread with message history |
| **Agent** | AI agent with specialized capabilities |
| **Breakpoint** | Human-in-the-loop pause point |
| **Checkpoint** | Saved workflow state for resumption |
| **Council** | Collection of agents for collaborative decisions |
| **Part 11** | 21 CFR Part 11 FDA regulation |
| **LangGraph** | State machine framework for LLM workflows |

---

*Document End*
