# Cortex Prime Architecture

## The Definitive Life Sciences AI Mind

**Version:** 1.0.0  
**Status:** Production Ready  
**Last Updated:** January 2025

---

## 🧠 Vision

Cortex Prime is designed to become the **definitive Life Sciences AI mind** - a system that learns from every CSR, rejection letter, and regulatory submission across all clients while maintaining strict privacy through federated learning.

The system embodies six breakthrough capabilities never before combined in Life Sciences:

1. **Regulatory Intuition** - 30 years of veteran reviewer experience encoded as pattern recognition
2. **Epistemic Intelligence** - AI that knows what it doesn't know, with uncertainty quantification
3. **Causal Inference** - Understanding WHY submissions succeed or fail, not just correlations
4. **Self-Evolution** - Continuous improvement without exposing client data
5. **Cross-Domain Transfer** - Apply learnings from oncology to neurology, NDAs to BLAs
6. **Unified Memory** - Perfect recall with context-aware retrieval

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CORTEX PRIME BRAIN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │     ATOMS       │──│     EDGES       │──│    AGENTS       │            │
│  │  (Knowledge)    │  │   (Relations)   │  │ (Transformers)  │            │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘            │
│           │                    │                    │                      │
│           ▼                    ▼                    ▼                      │
│  ┌─────────────────────────────────────────────────────────────┐          │
│  │                       TRACES (Memory)                        │          │
│  └─────────────────────────────────────────────────────────────┘          │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐          │
│  │                      THREADS (Context)                       │          │
│  └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                         ADVANCED CAPABILITIES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐         │
│  │   REGULATORY     │  │    EPISTEMIC     │  │     CAUSAL       │         │
│  │    INTUITION     │  │  INTELLIGENCE    │  │   INFERENCE      │         │
│  │                  │  │                  │  │                  │         │
│  │  - Signals       │  │  - Uncertainty   │  │  - DAGs          │         │
│  │  - Patterns      │  │  - Gaps          │  │  - Effects       │         │
│  │  - Predictions   │  │  - Calibration   │  │  - Counterfacts  │         │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘         │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                               │
│  │  SELF-EVOLVING   │  │  CROSS-DOMAIN    │                               │
│  │  INTELLIGENCE    │  │    TRANSFER      │                               │
│  │                  │  │                  │                               │
│  │  - Experiences   │  │  - Domains       │                               │
│  │  - Distillation  │  │  - Mappings      │                               │
│  │  - Expertise     │  │  - Templates     │                               │
│  └──────────────────┘  └──────────────────┘                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### Migration Files

| Migration | Description | Tables | Functions |
|-----------|-------------|--------|-----------|
| 073 | Core Unified Brain | 5 | 0 |
| 074 | Regulatory Intuition | 5 | 4 |
| 075 | Epistemic Intelligence | 6 | 5 |
| 076 | Causal Inference | 6 | 3 |
| 077 | Self-Evolving Intelligence | 7 | 5 |
| 078 | Cross-Domain Transfer | 6 | 5 |
| 079 | Unified Functions & Views | 0 | 6 |

### Core Tables (Migration 073)

```sql
-- Universal knowledge representation
cortex.atoms
  - id, org_id, atom_type, content, structured_data
  - embedding_1536, embedding_3072 (dual embeddings)
  - source_type, source_id, quality_score
  - metadata, is_active, created_at, updated_at

-- Relationships and reasoning chains
cortex.edges
  - source_atom_id, target_atom_id, edge_type
  - strength, evidence, org_id, metadata

-- Transformers that operate on atoms
cortex.agents
  - agent_name, agent_type, description
  - capabilities, model_config, prompt_template

-- Memory of interactions
cortex.traces
  - thread_id, agent_id, trace_type
  - input, output, reasoning, status
  - token_usage, duration_ms

-- Conversation context
cortex.threads
  - org_id, user_id, thread_type, title
  - context_atom_ids, program_id, submission_id
```

### Regulatory Intuition (Migration 074)

```sql
cortex.regulatory_signals    -- Extracted from documents
cortex.rejection_patterns    -- Learned from CRLs, IRs
cortex.intuition_predictions -- Outcome predictions
cortex.soft_signals         -- Subtle regulatory indicators
cortex.timeline_predictions -- Review timeline forecasts
```

### Epistemic Intelligence (Migration 075)

```sql
cortex.uncertainty_estimates  -- Decomposed uncertainty
cortex.knowledge_gaps        -- What we don't know
cortex.active_learning_queue -- Priority questions
cortex.confidence_triggers   -- Alert conditions
cortex.calibration_log      -- Prediction accuracy
cortex.confidence_history   -- Trend tracking
```

### Causal Inference (Migration 076)

```sql
cortex.causal_graphs         -- DAG representations
cortex.causal_effects       -- Effect estimates
cortex.counterfactual_scenarios -- What-if analyses
cortex.interventions        -- Recommended actions
cortex.causal_discovery_runs -- Discovery sessions
cortex.mechanism_library    -- Known mechanisms
```

### Self-Evolving Intelligence (Migration 077)

```sql
cortex.learning_experiences    -- Raw learning events
cortex.distilled_insights     -- Privacy-safe generalizations
cortex.expertise_scores       -- Domain competency
cortex.evolution_ledger       -- Change history
cortex.prompt_evolution       -- Prompt improvements
cortex.drift_detection        -- Distribution shift alerts
cortex.federated_learning_state -- Cross-org learning
```

### Cross-Domain Transfer (Migration 078)

```sql
cortex.domain_knowledge      -- Domain-specific knowledge
cortex.transfer_mappings    -- Source→Target mappings
cortex.transfer_episodes    -- Transfer history
cortex.meta_transfer_model  -- Transfer learning state
cortex.domain_similarity_cache -- Precomputed similarities
cortex.transfer_templates   -- Reusable templates
```

---

## 🔌 API Reference

### Base URL
```
/api/cortex
```

### Health & Diagnostics

```http
GET /health              # System health check
GET /stats               # Table statistics
```

### Knowledge Operations

```http
POST /atoms              # Create knowledge atom
GET /atoms/:id           # Get atom by ID
PATCH /atoms/:id         # Update atom
DELETE /atoms/:id        # Soft delete atom
```

### Search

```http
POST /search             # Unified semantic search
POST /search/fast        # Fast 1536-dim search
POST /query              # Master query function
```

### Graph Operations

```http
POST /edges              # Create edge
POST /traverse           # Traverse reasoning graph
```

### Threads & Traces

```http
POST /threads            # Create thread
GET /threads/:id         # Get thread
GET /threads/:id/context # Assemble LLM context
POST /traces             # Create trace
POST /traces/:id/complete # Complete trace
```

### Regulatory Intuition

```http
POST /intuition/signals       # Extract signals
POST /intuition/predict       # Generate prediction
POST /intuition/match-patterns # Match rejection patterns
```

### Epistemic Intelligence

```http
POST /epistemic/uncertainty   # Estimate uncertainty
POST /epistemic/gaps          # Detect knowledge gaps
```

### Causal Inference

```http
POST /causal/effect          # Estimate causal effect
POST /causal/counterfactual  # Generate counterfactual
POST /causal/interventions   # Get recommendations
```

### Self-Evolution

```http
POST /evolution/experience   # Record experience
POST /evolution/distill      # Run distillation
GET /evolution/expertise     # Get expertise scores
POST /evolution/evolve       # Trigger evolution
```

### Cross-Domain Transfer

```http
POST /transfer/candidates    # Find candidates
POST /transfer/execute       # Execute transfer
GET /transfer/similarity     # Get domain similarity
```

---

## 🚀 Getting Started

### 1. Run Migrations

```bash
# Validate migration files
node scripts/migrate-cortex-prime.js --validate-only

# Dry run (no changes)
node scripts/migrate-cortex-prime.js --dry-run

# Execute migrations
node scripts/migrate-cortex-prime.js
```

### 2. Service Integration

```typescript
import { getCortexPrimeService } from './server/services/cortexPrimeService';

const cortex = getCortexPrimeService();

// Create knowledge
const atom = await cortex.createAtom({
  orgId: 'org-123',
  atomType: 'regulatory_insight',
  content: 'FDA requires comprehensive CMC data...',
  metadata: { therapeutic_area: 'oncology' }
});

// Search
const results = await cortex.search(
  queryEmbedding,
  'CMC requirements oncology',
  'org-123',
  { limit: 10, minSimilarity: 0.7 }
);

// Traverse reasoning
const reasoning = await cortex.traverseReasoning(
  atom.id,
  ['supports', 'refutes', 'requires'],
  3,
  0.5
);
```

### 3. Register Routes

```typescript
// In server/index.ts
import cortexRoutes from './routes/cortexRoutes';

app.use('/api/cortex', cortexRoutes);
```

---

## 🔒 Privacy & Security

### Multi-Tenant Isolation

- **Row-Level Security (RLS)** enabled on all tables
- `org_id` scoped access via `app.current_org_id` session variable
- Global insights (null `org_id`) readable by all, editable by none

### Federated Learning

- **No raw client data leaves the org**
- Only distilled insights with differential privacy are global
- Epsilon tracking for privacy budget management
- Client can opt-out of federated learning

### Audit Trail

- All changes tracked in `evolution_ledger`
- Trace history in `cortex.traces`
- Calibration history in `calibration_log`

---

## 📈 Performance

### Embedding Indexes

```sql
-- HNSW indexes for fast vector search
idx_atoms_embedding_3072  -- High precision (3072-dim)
idx_atoms_embedding_1536  -- Fast search (1536-dim)
```

### Query Optimization

- Tiered search: fast 1536-dim first, then 3072-dim for top-k
- Full-text search combined with vector similarity
- Materialized views for common aggregations

### Maintenance

```sql
-- Reindex for performance
REINDEX INDEX CONCURRENTLY idx_atoms_embedding_3072;

-- Vacuum for space
VACUUM ANALYZE cortex.atoms;
```

---

## 🔄 Evolution Cycle

The system improves through a continuous evolution cycle:

```
┌─────────────────────────────────────────────────────────────────┐
│                     EVOLUTION CYCLE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│   │  RECORD  │───▶│ DISTILL  │───▶│  UPDATE  │───▶│  DETECT  │ │
│   │Experience│    │ Insights │    │ Expertise│    │  Drift   │ │
│   └──────────┘    └──────────┘    └──────────┘    └──────────┘ │
│        │                                                │       │
│        │                                                │       │
│        ▼                                                ▼       │
│   ┌──────────┐                                    ┌──────────┐ │
│   │ Feedback │                                    │  Adapt   │ │
│   │   Loop   │◀───────────────────────────────────│  Prompts │ │
│   └──────────┘                                    └──────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Daily Batch Distillation

```sql
-- Triggered automatically or via:
SELECT cortex.evolve();
```

### Expertise Score Updates

```sql
-- Per domain, updated based on outcomes
SELECT * FROM cortex.expertise_scores 
ORDER BY expertise_score DESC;
```

---

## 🧪 Testing

### Health Check

```bash
curl http://localhost:5000/api/cortex/health
```

### Create Test Atom

```bash
curl -X POST http://localhost:5000/api/cortex/atoms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "atomType": "test",
    "content": "Test knowledge atom"
  }'
```

### Search

```bash
curl -X POST http://localhost:5000/api/cortex/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "query": "regulatory requirements",
    "limit": 10
  }'
```

---

## 📋 Roadmap

### Phase 1: Foundation ✅
- [x] Core 5-table brain
- [x] Dual embeddings (1536 + 3072)
- [x] RLS security
- [x] Basic search

### Phase 2: Advanced Capabilities ✅
- [x] Regulatory Intuition Engine
- [x] Epistemic Intelligence
- [x] Causal Inference Engine
- [x] Self-Evolving Intelligence
- [x] Cross-Domain Transfer

### Phase 3: Integration 🔄
- [ ] Wire to existing services
- [ ] Migrate legacy data
- [ ] A/B testing framework
- [ ] Real-time learning

### Phase 4: Scale 📅
- [ ] Distributed inference
- [ ] Global model federation
- [ ] Multi-region deployment
- [ ] Horizontal scaling

---

## 📚 References

- **Epistemic Uncertainty**: Gal & Ghahramani, "Dropout as a Bayesian Approximation"
- **Causal Inference**: Pearl, "Causality: Models, Reasoning, and Inference"
- **Transfer Learning**: Pan & Yang, "A Survey on Transfer Learning"
- **Federated Learning**: McMahan et al., "Communication-Efficient Learning"

---

## 👥 Team

Built with ❤️ by the Clinical Sage AI Engineering Team

*"The definitive Life Sciences AI mind - learning from every submission, protecting every client."*
