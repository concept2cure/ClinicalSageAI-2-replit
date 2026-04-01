# In-Memory ID Generation & Data Store Audit

**Date**: 2026-04-01
**Scope**: `server/` and `shared/` directories (excluding `node_modules`, `.git`, test files)

---

## CATEGORY A: In-Memory `nextId` Counters (PRIMARY ID GENERATION — DATA LOSS ON RESTART)

### A1. `server/storage/supplyChainStorage.ts` — Line 300

- **Variable**: `private nextId = 1`
- **Usage**: **Primary ID generation** for suppliers, materials, batches
- **Severity**: 🔴 HIGH — data store IDs reset to 1 on restart, causing collisions
- **Context**:

  ```ts
  // Line 297–304
  private suppliers: Map<number, Supplier> = new Map();
  private materials: Map<number, Material> = new Map();
  private batches: Map<number, Batch> = new Map();
  private nextId = 1;

  private generateId(): number {
    return this.nextId++;
  }
  ```

### A2. `server/routes/snowglobe.ts` — Line 49

- **Variable**: `nextId: 1` (inside `store` object)
- **Usage**: **Primary ID generation** for programs, scenarios, results, scores, remediation plans, findings, runs, composites
- **Severity**: 🔴 HIGH — entire snowglobe data store is in-memory with sequential IDs
- **Context**:

  ```ts
  // Line 44–53
  results: new Map<number, any>(),
  findings: new Map<number, any>(),
  scores: new Map<number, any>(),
  remediationPlans: new Map<number, any>(),
  provenance: [] as any[],
  nextId: 1,
  };

  function nextId(): number {
    return store.nextId++;
  }
  ```

### A3. `server/routes/mission-control.ts` — Line 67

- **Variable**: `nextId: 1` (inside `store` object)
- **Usage**: **Primary ID generation** for programs, destinations, route plans, artifacts, evidence nodes, dependency links, decision records, review cycles, risk signals, collaboration, approval requests, authority interactions
- **Severity**: 🔴 HIGH — comment says "In-memory store for Phase 1 (will migrate to DB with Drizzle push)" but never migrated
- **Context**:
  ```ts
  // Line 51–71
  // In-memory store for Phase 1 (will migrate to DB with Drizzle push)
  const store = {
    programs: new Map<number, any>(),
    destinations: new Map<number, any>(),
    routePlans: new Map<number, any>(),
    artifacts: new Map<number, any>(),
    evidenceNodes: new Map<number, any>(),
    ...12 more Maps...
    nextId: 1,
  };
  function nextId(): number {
    return store.nextId++;
  }
  ```

### A4. `server/routes/client-branding.ts` — Line 60

- **Variable**: `let nextTemplateId = 100`
- **Usage**: **Primary ID generation** for client branding templates
- **Severity**: 🔴 HIGH — templates created via API get IDs starting at 100, reset on restart
- **Context**:
  ```ts
  // Line 59–60
  const brandingStore = new Map<number, BrandingSettings>();
  const templateStore = new Map<number, ClientTemplate[]>();
  let nextTemplateId = 100;
  ```

### A5. `server/routes/inline-annotations.ts` — Lines 56–57

- **Variable**: `let nextAnnotationId = 100`, `let nextReplyId = 1000`
- **Usage**: **Primary ID generation** for document annotations and annotation replies
- **Severity**: 🔴 HIGH — annotation/reply IDs reset on restart
- **Context**:
  ```ts
  // Line 55–57
  const annotationStore = new Map<number, InlineAnnotation[]>();
  let nextAnnotationId = 100;
  let nextReplyId = 1000;
  ```

### A6. `server/api/cmc/routes.ts` — Line 539

- **Variable**: `let csNextId = 1`
- **Usage**: **Primary ID generation** for CMC comparability studies
- **Severity**: 🔴 HIGH — creates IDs like `CS-001`, `CS-002`; resets on restart
- **Context**:
  ```ts
  // Line 538–557
  const comparabilityStudiesStore: ComparabilityStudy[] = [];
  let csNextId = 1;
  ...
  id: `CS-${String(csNextId++).padStart(3, '0')}`,
  ```

### A7. `server/routes/ana-features.ts` — Line 48

- **Variable**: `let memoryIdCounter = 1000`
- **Usage**: **Primary ID generation** for project memory entries in AnA features
- **Severity**: 🔴 HIGH — memory store entries get IDs starting at 1000, reset on restart
- **Context**:
  ```ts
  // Line 47–48
  const memoryStore: Record<string, ProjectMemoryStore> = {};
  let memoryIdCounter = 1000;
  ```

### A8. `server/api/cmc/workflowRoutes.ts` — Line 364

- **Variable**: `let commandCounter = 1`
- **Usage**: **Primary ID generation** for CMC workflow command results (IDs like `cmd-1`, `cmd-2`)
- **Severity**: 🟡 MEDIUM — transient AI output cache, but IDs are returned to clients
- **Context**:
  ```ts
  // Line 362–364
  // Command results kept in-memory (transient AI output cache)
  let commandResults = new Map();
  let commandCounter = 1;
  ```

---

## CATEGORY B: In-Memory Counters for Run/Job Tracking (EPHEMERAL IDs — LOWER RISK)

### B1. `server/services/intelligence/rim.ts` — Line 128

- **Variable**: `let runCounter = 0`
- **Usage**: **Ephemeral** — generates RIM run IDs like `rim_<timestamp>_<counter>`
- **Severity**: 🟢 LOW — counter combined with `Date.now()` makes collisions unlikely; IDs are ephemeral run tracking
- **Context**:
  ```ts
  let runCounter = 0;
  function generateRunId(): string {
    runCounter++;
    return `rim_${Date.now()}_${runCounter}`;
  }
  ```

### B2. `server/services/intelligence/signal-capture.ts` — Line 125

- **Variable**: `let signalCounter = 0`
- **Usage**: **Ephemeral** — generates signal IDs like `sig_<timestamp>_<counter>`
- **Severity**: 🟢 LOW — same pattern as B1, combined with timestamp
- **Context**:
  ```ts
  let signalCounter = 0;
  function generateSignalId(): string {
    signalCounter++;
    return `sig_${Date.now()}_${signalCounter}`;
  }
  ```

### B3. `server/services/intelligence/rim-integration.ts` — Line 66

- **Variable**: `let integrationCounter = 0`
- **Usage**: **Ephemeral** — generates provenance run IDs like `rim_<timestamp>_<counter>`
- **Severity**: 🟢 LOW — provenance tagging, combined with timestamp
- **Context**:
  ```ts
  let integrationCounter = 0;
  export function buildProvenance(runType: RIMRunType): SignalProvenance {
    integrationCounter++;
    return { ...runId: `rim_${Date.now()}_${integrationCounter}` };
  }
  ```

### B4. `server/services/automation/rewrite-dispatcher.ts` — Line 162

- **Variable**: `let jobCounter = 0`
- **Usage**: **Ephemeral** — generates rewrite job IDs like `rw-<timestamp>-<counter>`
- **Severity**: 🟢 LOW — job tracking, combined with timestamp
- **Context**:
  ```ts
  let jobCounter = 0;
  function generateJobId(): string {
    return `rw-${Date.now()}-${++jobCounter}`;
  }
  ```

### B5. `server/services/ai-actions/concurrency-limiter.ts` — Line 27

- **Variable**: `let globalCounter = 0`
- **Usage**: **Ephemeral** — tracks global concurrency slot count (Redis fallback)
- **Severity**: 🟢 LOW — counter is a gauge (incremented/decremented), not an ID generator. Resets correctly on restart since slots are released.
- **Context**:
  ```ts
  const memoryCounters = new Map<string, number>();
  let globalCounter = 0;
  // Used to track active concurrency slots, released on completion
  ```

### B6. `shared/types/decision-architecture.ts` — Line 437

- **Variable**: `let _decisionCounter = 0`
- **Usage**: **Ephemeral** — generates decision IDs like `dec_<timestamp>_<counter>_<random>`
- **Severity**: 🟢 LOW — combined with timestamp AND random string, collision-resistant
- **Context**:
  ```ts
  let _decisionCounter = 0;
  export function createDecisionId(): string {
    _decisionCounter++;
    return `dec_${Date.now()}_${_decisionCounter}_${Math.random().toString(36).slice(2, 8)}`;
  }
  ```

---

## CATEGORY C: Function-Scoped Counters (SAFE — Reset Per Call)

### C1. `server/services/ectd/ectd4-validator.ts` — Line 214

- **Variable**: `let findingId = 0`
- **Usage**: **Function-scoped** — generates finding IDs (`V1`, `V2`, ...) within a single validation run
- **Severity**: ⚪ NONE — scoped to function invocation, not persisted

### C2. `server/services/harmonize-engine.ts` — Line ~125

- **Variable**: `let issueIdx = 0` (inferred from `++issueIdx` usage)
- **Usage**: **Function-scoped** — generates issue IDs (`TERM-1`, `NUM-2`, ...) within a single harmonization run
- **Severity**: ⚪ NONE — scoped to function invocation

### C3. `server/statistics-service.ts` — Line 2985

- **Variable**: `let patientId = 1`
- **Usage**: **Function-scoped** — generates synthetic patient IDs for simulation
- **Severity**: ⚪ NONE — simulation data, not persisted

### C4. `server/services/intelligence/rim-cross-artifact.ts` — Line 70

- **Variable**: `let issueCounter = 0`
- **Usage**: **Function-scoped** — generates issue sequence numbers within one analysis call
- **Severity**: ⚪ NONE — scoped to function invocation

### C5. `server/services/versionDiffService.ts` — Line 85

- **Variable**: `let lineCounter = 1`
- **Usage**: **Function-scoped** — line numbering for diff display
- **Severity**: ⚪ NONE — display logic only

### C6. `server/workers/ivdr-pack-worker.ts` — Line 652

- **Variable**: `let idleLogCounter = 0`
- **Usage**: **Function-scoped** — throttles idle logging output
- **Severity**: ⚪ NONE — logging control only

---

## CATEGORY D: `new Map()` as PRIMARY Data Stores (DATA LOSS ON RESTART)

### D1. `server/routes/mission-control.ts` — Lines 53–65

- **Maps**: 13 Maps (programs, destinations, routePlans, artifacts, evidenceNodes, artifactEvidence, dependencyLinks, decisionRecords, reviewCycles, riskSignals, collaboration, approvalRequests, authorityInteractions)
- **Usage**: **Primary data store** — all mission control data
- **Severity**: 🔴 HIGH

### D2. `server/routes/snowglobe.ts` — Lines 44–48

- **Maps**: 6 Maps (results, findings, scores, remediationPlans + provenance array)
- **Usage**: **Primary data store** — entire snowglobe regulatory data
- **Severity**: 🔴 HIGH

### D3. `server/storage/supplyChainStorage.ts` — Lines 297–299

- **Maps**: `suppliers`, `materials`, `batches`
- **Usage**: **Primary data store** — CMC supply chain entities
- **Severity**: 🔴 HIGH

### D4. `server/routes/client-branding.ts` — Lines 59–60

- **Maps**: `brandingStore`, `templateStore`
- **Usage**: **Primary data store** — client branding settings and templates
- **Severity**: 🔴 HIGH

### D5. `server/routes/inline-annotations.ts` — Line 55

- **Map**: `annotationStore`
- **Usage**: **Primary data store** — document inline annotations
- **Severity**: 🔴 HIGH

### D6. `server/routes/medical-device-documents.mjs` — Line 16

- **Map**: `documentStore`
- **Usage**: **Primary data store** — medical device documents (comment: "in production, use database")
- **Severity**: 🔴 HIGH

### D7. `server/routes/510kRoutes.ts` — Line 33

- **Map**: `deviceProfiles`
- **Usage**: **Primary data store** — 510(k) device profiles (deprecated route, but still mounted)
- **Severity**: 🟡 MEDIUM (deprecated)

### D8. `server/routes/510k-api-routes.ts` — Line 298

- **Map**: `deviceProfiles`
- **Usage**: **Primary data store** — 510(k) device profiles (comment: "replaced with database storage in production")
- **Severity**: 🔴 HIGH

### D9. `server/routes/enterprise-integrations.ts` — Lines 92–94

- **Maps**: `integrationStore`, `syncRunStore`, `idempotencyStore`
- **Usage**: **Primary data store** — enterprise integration configs, sync history, idempotency cache
- **Severity**: 🔴 HIGH — labeled "Fallback in-memory stores used only when DB unavailable" but no DB implementation found

### D10. `server/api/cmc/collaborationRoutes.ts` — Lines 30–33

- **Maps**: `comments`, `notifications`, `activeUsers`, `realtimeConnections`
- **Usage**: **Primary data store** — CMC collaboration data (comment: "replace with database/Redis in production")
- **Severity**: 🔴 HIGH

### D11. `server/routes/sso.ts` — Lines 34, 41

- **Maps**: `samlConfigs`, `pendingRequests`
- **Usage**: **Primary data store** — SAML SSO configs and pending auth requests (comment: "loaded from database in production")
- **Severity**: 🔴 HIGH — security-sensitive; pending requests lost on restart breaks auth flows

### D12. `server/routes/realtime-collab.ts` — Lines 129–130, 255

- **Maps**: `rooms`, `userColors`, `locks` (in YjsRoomManager and DocumentLockManager)
- **Usage**: **Ephemeral session state** — real-time collaboration rooms and locks
- **Severity**: 🟡 MEDIUM — expected to be in-memory for real-time collab, but locks are lost on restart

### D13. `server/routes/agent-swarm.ts` — Line 369

- **Map**: `swarms`
- **Usage**: **Primary data store** — active agent swarm executions
- **Severity**: 🟡 MEDIUM — running swarm state, inherently ephemeral but long-running swarms lost on restart

### D14. `server/routes/ana-cortex-ft.ts` — Lines 272–275

- **Maps**: `models`, `deploymentEvents`, `quantizationBenchmarks`
- **Usage**: **Primary data store** — AnA Cortex model registry (comment: "In-memory + DB persistence" but Map is the in-memory layer)
- **Severity**: 🟡 MEDIUM — if DB persistence exists, the Map is a cache

### D15. `server/services/academic-document-processor.ts` — Lines 52–54

- **Maps**: `academicKnowledgeBase`, `documentEmbeddings`, `documentMetadata`
- **Usage**: **Primary data store** — academic document processed content and embeddings
- **Severity**: 🔴 HIGH — loads from filesystem but all runtime additions lost

### D16. `server/services/autoExtractionPipeline.ts` — Line 153

- **Map**: `extractionQueue`
- **Usage**: **Primary data store** — extraction job queue (comment: "in-memory for now, upgradeable to Redis/BullMQ")
- **Severity**: 🟡 MEDIUM — queued extraction jobs lost on restart

### D17. `server/services/regulatory-intelligence-service.ts` — Line 47

- **Map**: `regulatoryKnowledgeBase`
- **Usage**: **Primary data store** — regulatory knowledge base entries
- **Severity**: 🟡 MEDIUM — loaded at init but runtime additions lost

### D18. `server/services/unifiedDocumentIngestion.js` — Lines 359–360

- **Maps**: `processingQueue`, `knowledgeBase`
- **Usage**: **Primary data store** — document processing queue and extracted knowledge
- **Severity**: 🟡 MEDIUM — processing state lost on restart

### D19. `server/services/document-processor.js` — Line 37

- **Map**: `processingResults`
- **Usage**: **Primary data store** — document processing results
- **Severity**: 🟡 MEDIUM — results for downstream consumers lost on restart

### D20. `server/services/documentLocking.js` — Line 14

- **Map**: `activeLocks`
- **Usage**: **Primary data store** — document component-level locks
- **Severity**: 🟡 MEDIUM — locks are inherently ephemeral but stale locks could leave documents locked after restart (lock timeout handles this)

### D21. `server/services/cmcEvents.js` — Lines 31–32

- **Maps**: `global.leavesStorage`, `global.patchesStorage`
- **Usage**: **Primary data store** — CMC document leaf patches and content (stored on `global`)
- **Severity**: 🔴 HIGH — document content stored only in memory

### D22. `server/services/fdaIntegrationService.ts` — Line 54

- **Map**: `submissionQueue`
- **Usage**: **Primary data store** — FDA submission tracking queue
- **Severity**: 🔴 HIGH — submission status lost on restart

---

## CATEGORY E: `new Map()` as Caches/Runtime State (ACCEPTABLE)

| File                                                        | Map(s)                                               | Purpose                                    |
| ----------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `server/src/cache.ts:2`                                     | `cache`                                              | General-purpose cache — expected in-memory |
| `server/lib/rate-limiting.ts:57`                            | `store`                                              | Rate limit entries — expected in-memory    |
| `server/lib/graceful-degradation.ts:102`                    | `circuitBreakers`                                    | Circuit breaker state — expected in-memory |
| `server/lib/multi-provider-llm.ts:146–147`                  | `clients`, `circuitBreakers`                         | Provider client instances — expected       |
| `server/services/ai-gateway/gateway.ts:252`                 | `providerHealth`                                     | Health check state — expected              |
| `server/services/ai-gateway/policy.ts:34,37`                | `rateBuckets`, `dailyCost`                           | Rate limiting — expected                   |
| `server/services/redactionService.js:33`                    | `patternCache`                                       | Regex pattern compilation cache — expected |
| `server/services/endpoint-recommender-service.ts:60`        | `regulatoryGuidanceCache`                            | Guidance lookup cache — expected           |
| `server/services/enhancedEmbeddingService.ts:111`           | `embeddingCache`                                     | Embedding vector cache — expected          |
| `server/services/ectd/ECTDScaffoldingService.ts:73–74`      | `moduleCache`, `cacheExpiry`                         | Module scaffold cache — expected           |
| `server/middleware/enterprise-performance.ts:59`            | `cache`                                              | Performance middleware cache — expected    |
| `server/services/indCopilot.js:24`                          | `guidelinesCache`                                    | Guidelines lookup cache — expected         |
| `server/services/regulatory-database.js:14–16`              | `regulationCache`, `guidanceCache`, `standardsCache` | Regulatory data caches — expected          |
| `server/services/cognitive-ecosystem/*.ts`                  | `graphs`, `handlers`, `ruleCache`                    | Workflow runtime state — expected          |
| `server/services/connectors/connector-registry.ts:66`       | `connectors`                                         | Singleton connector instances — expected   |
| `server/services/clinical-intelligence-service.ts:611–612`  | `semanticVariableCache`, `semanticConnectionCache`   | Analysis caches — expected                 |
| `server/services/DynamicContentAssembly.ts:43`              | `conditionalRules`                                   | Content rules cache — expected             |
| `server/services/SmartFieldLinking.ts:33–34`                | `fieldLinks`, `fieldSubscriptions`                   | Field linking runtime — expected           |
| `server/services/aiProviderRouter.ts:271`                   | `providerHealth`                                     | Provider health tracking — expected        |
| `server/services/biotechRagService.js:25–26,90`             | `vocabulary`, `idf`, `embedCache`                    | TF-IDF + embedding caches — expected       |
| `server/services/huggingface-service.js:28`                 | `embeddingCache`                                     | ML embedding cache — expected              |
| `server/routes/rate-limiter.js:12`                          | `requestCounts`                                      | Rate limiter — expected                    |
| `server/routes/leaves.js:39`                                | `sseConnections`                                     | SSE connection tracking — expected         |
| `server/services/eventBus.js:45`                            | `wsConnections`                                      | WebSocket connections — expected           |
| `server/utils/event_bus.js:15,18`                           | `subscribers`, `latestEvents`                        | Pub-sub runtime — expected                 |
| `server/utils/monitoring.js:63`                             | `timers`                                             | Performance timers — expected              |
| `server/services/compliance/globalComplianceEngine.ts:1362` | `frameworksByRegion`                                 | Lookup index — expected                    |

---

## SUMMARY

| Severity   | Count   | Description                                                                               |
| ---------- | ------- | ----------------------------------------------------------------------------------------- |
| 🔴 HIGH    | **16**  | Primary data stores using `new Map()` + `nextId` counters — complete data loss on restart |
| 🟡 MEDIUM  | **8**   | Queue/transient state in Maps — partial data loss, some acceptable for ephemeral use      |
| 🟢 LOW     | **6**   | Ephemeral run/job IDs combined with timestamps — low collision risk                       |
| ⚪ NONE    | **6**   | Function-scoped counters — safe, reset per call                                           |
| Acceptable | **27+** | Caches, rate limiters, circuit breakers — expected to be in-memory                        |

### Highest Priority Fixes (🔴 — data lost every restart):

1. **`mission-control.ts`** — 13 entity Maps + nextId (entire feature is in-memory)
2. **`snowglobe.ts`** — 6 entity Maps + nextId (entire feature is in-memory)
3. **`supplyChainStorage.ts`** — 3 entity Maps + nextId (supply chain data)
4. **`enterprise-integrations.ts`** — 3 Maps (integration configs & sync runs)
5. **`collaborationRoutes.ts`** — 4 Maps (CMC collaboration)
6. **`client-branding.ts`** — 2 Maps + nextTemplateId (branding & templates)
7. **`inline-annotations.ts`** — 1 Map + 2 counters (document annotations)
8. **`510k-api-routes.ts`** — 1 Map (device profiles)
9. **`medical-device-documents.mjs`** — 1 Map (medical device docs)
10. **`cmcEvents.js`** — 2 global Maps (document leaf patches)
11. **`ana-features.ts`** — memory store object + counter (project memory)
12. **`cmc/routes.ts`** — array + counter (comparability studies)
13. **`sso.ts`** — 2 Maps (SAML configs — security-sensitive)
14. **`fdaIntegrationService.ts`** — 1 Map (FDA submission queue)
15. **`academic-document-processor.ts`** — 3 Maps (knowledge base + embeddings)
