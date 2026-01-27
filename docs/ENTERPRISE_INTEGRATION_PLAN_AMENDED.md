# Enterprise Backend-to-Frontend Integration Plan (AMENDED)

## Cortex Prime AI → Client Portal V2

**Date:** January 26, 2026
**Status:** AMENDED Based on Codebase Analysis
**Branch:** concept2cure-v2

---

## 🔴 CRITICAL FINDING: Integration Gap Discovered

After deep analysis of the codebase, I've discovered a **critical integration gap**:

### What EXISTS (Built but Disconnected)

| Component                        | Status   | Lines    | Location                                  |
| -------------------------------- | -------- | -------- | ----------------------------------------- |
| CortexPrimeService               | ✅ Built | 1,144    | `server/services/cortexPrimeService.ts`   |
| Cortex Routes                    | ✅ Built | 678      | `server/routes/cortexRoutes.ts`           |
| Cortex Advisory Routes           | ✅ Built | 720      | `server/routes/cortexAdvisoryRoutes.ts`   |
| Cortex Management Routes         | ✅ Built | 703      | `server/routes/cortexManagementRoutes.ts` |
| Cortex Query Routes              | ✅ Built | 538      | `server/routes/cortexQueryRoutes.ts`      |
| Client Portal V2                 | ✅ Built | 55 files | `client/src/portal-v2/`                   |
| Lumen Cortex Enterprise (Python) | ✅ Built | 9,900+   | `lumen_cortex/enterprise/`                |

**Total Backend Code: ~3,782 lines of Cortex API endpoints**

### What's MISSING (The Gap)

| Gap                                            | Impact                      | Priority    |
| ---------------------------------------------- | --------------------------- | ----------- |
| Cortex routes NOT mounted in `server/index.ts` | API endpoints inaccessible  | 🔴 CRITICAL |
| No client-side Cortex service                  | Frontend can't call backend | 🔴 CRITICAL |
| No database migrations deployed                | Tables don't exist          | 🔴 CRITICAL |
| Portal V2 has no Cortex hooks                  | No AI intelligence in UI    | 🟡 HIGH     |
| No WebSocket for real-time                     | Missing live updates        | 🟡 MEDIUM   |

---

## 📊 Architecture Analysis

### Current State

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CURRENT STATE                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐         ❌ NOT CONNECTED         ┌───────────┐│
│  │  Client Portal  │ ─────────────────────────────────│  Cortex   ││
│  │      V2         │                                  │  Backend  ││
│  │                 │                                  │           ││
│  │  - Dashboard    │         Missing:                 │  - 68 API ││
│  │  - Vault        │         • Route mounting         │    routes ││
│  │  - AI Assistant │         • Client service         │  - 1,144  ││
│  │  - Workflows    │         • DB migrations          │    lines  ││
│  │                 │         • React hooks            │           ││
│  └─────────────────┘                                  └───────────┘│
│                                                                     │
│  Current Services Used:                                             │
│  - lumenService.js (basic chat, no Cortex)                         │
│  - KnowledgeGraphClient.ts (neuro-symbolic, partial)               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Target State (Cortex Mesh)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TARGET STATE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐                              ┌───────────────┐│
│  │  Client Portal  │                              │ Cortex Prime  ││
│  │      V2         │◄────── REST API ────────────►│   Backend     ││
│  │                 │◄────── WebSocket ───────────►│               ││
│  │  ┌───────────┐  │                              │ ┌───────────┐ ││
│  │  │useCortex  │  │  /api/cortex/*               │ │  Service  │ ││
│  │  │   Hook    │──┼──────────────────────────────┼─│  Layer    │ ││
│  │  └───────────┘  │                              │ └───────────┘ ││
│  │                 │                              │       │       ││
│  │  ┌───────────┐  │                              │       ▼       ││
│  │  │CortexMesh │  │                              │ ┌───────────┐ ││
│  │  │ Provider  │  │                              │ │ PostgreSQL│ ││
│  │  └───────────┘  │                              │ │  cortex.* │ ││
│  └─────────────────┘                              │ └───────────┘ ││
│                                                   └───────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 AMENDED Implementation Plan

### Phase 0: Foundation (IMMEDIATE - Day 1)

**Time Estimate: 2-4 hours**

#### 0.1 Mount Cortex Routes in Server

**File:** `server/index.ts`

```typescript
// ADD after line ~500 (after other route mounts)
import cortexRoutes from './routes/cortexRoutes.js';
import cortexAdvisoryRoutes from './routes/cortexAdvisoryRoutes.js';
import cortexManagementRoutes from './routes/cortexManagementRoutes.js';
import cortexQueryRoutes from './routes/cortexQueryRoutes.js';

app.use('/api/cortex', cortexRoutes);
app.use('/api/cortex/advisory', cortexAdvisoryRoutes);
app.use('/api/cortex/management', cortexManagementRoutes);
app.use('/api/cortex/query', cortexQueryRoutes);
console.log('✅ Cortex Prime API routes mounted');
```

#### 0.2 Run Database Migrations

**Location:** `sql/migrations/` or create new

Required tables (from cortexPrimeService.ts):

- `cortex.atoms` - Knowledge atoms
- `cortex.edges` - Relationships
- `cortex.agents` - AI agents
- `cortex.traces` - Memory/interaction history
- `cortex.threads` - Conversation context
- `cortex.regulatory_signals` - Regulatory intelligence
- `cortex.intuition_predictions` - AI predictions

---

### Phase 1: Client Cortex Service (Week 1)

**Time Estimate: 8-12 hours**

#### 1.1 Create CortexClient Service

**File:** `client/src/portal-v2/services/cortexClient.ts`

```typescript
// New file - Cortex API client for portal-v2
import { apiRequest } from '@/lib/queryClient';

export interface CortexAtom {
  id: string;
  atomType: string;
  content: string;
  structuredData?: Record<string, any>;
  qualityScore?: number;
  metadata?: Record<string, any>;
}

export interface CortexSearchResult {
  atomId: string;
  content: string;
  similarityScore: number;
  relevanceScore: number;
}

export class CortexClient {
  private baseUrl = '/api/cortex';

  async search(query: string, options?: SearchOptions): Promise<CortexSearchResult[]> {
    const response = await apiRequest('POST', `${this.baseUrl}/search`, { query, ...options });
    return response.json();
  }

  async getAdvisory(projectId: string): Promise<AdvisoryResult> {
    const response = await apiRequest('GET', `${this.baseUrl}/advisory/${projectId}`);
    return response.json();
  }

  async getPrediction(submissionId: string): Promise<PredictionResult> {
    const response = await apiRequest('POST', `${this.baseUrl}/predict`, { submissionId });
    return response.json();
  }

  async createThread(options: CreateThreadOptions): Promise<CortexThread> {
    const response = await apiRequest('POST', `${this.baseUrl}/threads`, options);
    return response.json();
  }
}

export const cortexClient = new CortexClient();
```

#### 1.2 Create useCortex Hook

**File:** `client/src/portal-v2/hooks/useCortex.ts`

```typescript
// New file - React hook for Cortex integration
import { useQuery, useMutation } from '@tanstack/react-query';
import { cortexClient } from '../services/cortexClient';

export function useCortexSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ['cortex', 'search', query],
    queryFn: () => cortexClient.search(query),
    enabled: enabled && query.length > 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useCortexAdvisory(projectId: string) {
  return useQuery({
    queryKey: ['cortex', 'advisory', projectId],
    queryFn: () => cortexClient.getAdvisory(projectId),
    enabled: !!projectId,
  });
}

export function useCortexPrediction() {
  return useMutation({
    mutationFn: (submissionId: string) => cortexClient.getPrediction(submissionId),
  });
}
```

---

### Phase 2: CortexMesh Provider (Week 2)

**Time Estimate: 12-16 hours**

#### 2.1 Create CortexMesh Context

**File:** `client/src/portal-v2/core/cortexMeshContext.tsx`

```typescript
// New file - Global Cortex state management
import React, { createContext, useContext, useState, useCallback } from 'react';
import { cortexClient, CortexThread, CortexAtom } from '../services/cortexClient';

interface CortexMeshState {
  activeThread: CortexThread | null;
  recentAtoms: CortexAtom[];
  isConnected: boolean;
  predictions: Map<string, PredictionResult>;
}

interface CortexMeshContextValue extends CortexMeshState {
  search: (query: string) => Promise<CortexAtom[]>;
  getAdvisory: (projectId: string) => Promise<AdvisoryResult>;
  predict: (submissionId: string) => Promise<PredictionResult>;
  startThread: (context: ThreadContext) => Promise<CortexThread>;
}

const CortexMeshContext = createContext<CortexMeshContextValue | null>(null);

export const CortexMeshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CortexMeshState>({
    activeThread: null,
    recentAtoms: [],
    isConnected: false,
    predictions: new Map(),
  });

  // Implementation...
  return (
    <CortexMeshContext.Provider value={value}>
      {children}
    </CortexMeshContext.Provider>
  );
};

export const useCortexMesh = () => {
  const context = useContext(CortexMeshContext);
  if (!context) throw new Error('useCortexMesh must be used within CortexMeshProvider');
  return context;
};
```

#### 2.2 Integrate into PortalProvider

**File:** `client/src/portal-v2/core/portalContext.tsx`

```typescript
// MODIFY - Wrap with CortexMeshProvider
import { CortexMeshProvider } from './cortexMeshContext';

export const PortalProvider = ({ children, initialModule = 'dashboard' }: PortalProviderProps) => {
  // ... existing code ...

  return (
    <CortexMeshProvider>
      {/* existing PortalContext.Provider */}
    </CortexMeshProvider>
  );
};
```

---

### Phase 3: AI Assistant Integration (Week 3)

**Time Estimate: 16-20 hours**

#### 3.1 Enhance AIAssistant Component

**File:** `client/src/portal-v2/components/ai-assistant/AIAssistant.tsx`

Integration points:

- Replace `lumenService.js` calls with `useCortexMesh`
- Add regulatory intuition display
- Add prediction confidence indicators
- Add citation enforcement (from lumen_cortex/enterprise)

#### 3.2 Add Cortex Intelligence Widgets

**Files to create:**

- `components/dashboards/CortexInsightsWidget.tsx`
- `components/dashboards/PredictionPanel.tsx`
- `components/dashboards/RegulatorySignalsWidget.tsx`

---

### Phase 4: Real-time & WebSocket (Week 4)

**Time Estimate: 12-16 hours**

#### 4.1 WebSocket Integration

**File:** `client/src/portal-v2/services/cortexWebSocket.ts`

```typescript
// New file - Real-time Cortex updates
export class CortexWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;

  connect(threadId: string) {
    this.ws = new WebSocket(`${WS_URL}/cortex/stream/${threadId}`);
    // Event handlers...
  }

  onAtomUpdate(callback: (atom: CortexAtom) => void) {
    /* ... */
  }
  onPredictionUpdate(callback: (prediction: PredictionResult) => void) {
    /* ... */
  }
}
```

---

## 📁 File-by-File Implementation Checklist

### Server Side (Must Do First)

| File                                    | Action                | Priority    | Effort |
| --------------------------------------- | --------------------- | ----------- | ------ |
| `server/index.ts`                       | Mount Cortex routes   | 🔴 CRITICAL | 30 min |
| `sql/migrations/073_cortex_core.sql`    | Create/verify tables  | 🔴 CRITICAL | 1 hour |
| `server/routes/cortexRoutes.ts`         | Verify endpoints work | 🟡 HIGH     | 30 min |
| `server/services/cortexPrimeService.ts` | Add error handling    | 🟡 HIGH     | 1 hour |

### Client Side (After Server)

| File                                                   | Action              | Priority    | Effort  |
| ------------------------------------------------------ | ------------------- | ----------- | ------- |
| `portal-v2/services/cortexClient.ts`                   | Create new          | 🔴 CRITICAL | 4 hours |
| `portal-v2/hooks/useCortex.ts`                         | Create new          | 🔴 CRITICAL | 2 hours |
| `portal-v2/core/cortexMeshContext.tsx`                 | Create new          | 🟡 HIGH     | 4 hours |
| `portal-v2/core/portalContext.tsx`                     | Add Cortex provider | 🟡 HIGH     | 1 hour  |
| `portal-v2/components/ai-assistant/AIAssistant.tsx`    | Integrate Cortex    | 🟡 HIGH     | 6 hours |
| `portal-v2/components/dashboards/UnifiedDashboard.tsx` | Add widgets         | 🟢 MEDIUM   | 4 hours |

---

## ⚠️ Risk Assessment Matrix

| Risk               | Likelihood | Impact | Mitigation                            |
| ------------------ | ---------- | ------ | ------------------------------------- |
| DB migrations fail | Medium     | High   | Test on staging first                 |
| Route conflicts    | Low        | High   | Namespace under `/api/cortex/*`       |
| Performance issues | Medium     | Medium | Add caching layer                     |
| Type mismatches    | High       | Low    | Generate types from backend           |
| Auth integration   | Low        | High   | Use existing `requireAuth` middleware |

---

## 🎯 Quick Wins (Start Here)

### Immediate Actions (< 2 hours each)

1. **Mount Cortex Routes** - Single file edit in `server/index.ts`
2. **Test API Endpoints** - Verify `/api/cortex/health` works
3. **Create Basic Client** - Minimal `cortexClient.ts`
4. **Add useCortex Hook** - Simple React Query wrapper

### This Week's Goals

- [ ] Cortex routes accessible at `/api/cortex/*`
- [ ] Database schema deployed
- [ ] Basic client service working
- [ ] One dashboard widget showing Cortex data

---

## 📈 Timeline (Amended)

| Week | Focus         | Deliverables                             |
| ---- | ------------- | ---------------------------------------- |
| 1    | Foundation    | Routes mounted, DB ready, basic client   |
| 2    | Integration   | CortexMesh provider, hooks complete      |
| 3    | UI Components | AI Assistant enhanced, dashboard widgets |
| 4    | Real-time     | WebSocket, live predictions              |
| 5-8  | Polish        | Performance, testing, documentation      |

**Original estimate:** 16 weeks
**Amended estimate:** 8 weeks (existing code is substantial)

---

## 🔧 Start Command

```bash
# Step 1: Mount the routes (edit server/index.ts)
# Step 2: Verify database
psql $DATABASE_URL -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'cortex';"

# Step 3: Test endpoint
curl http://localhost:5000/api/cortex/health

# Step 4: Create client service
touch client/src/portal-v2/services/cortexClient.ts
```

---

## Next Action

**Recommended starting point:** Mount Cortex routes in `server/index.ts`

This single change will expose 68 API endpoints that are already built and tested. Then create the client service to consume them.
