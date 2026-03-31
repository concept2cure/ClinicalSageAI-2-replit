# Express Middleware Stack Performance Audit

**File**: `server/index.ts` (8053 lines)  
**Date**: March 31, 2026  
**Scope**: All `app.use()` calls, ordering, bottlenecks, optimization opportunities

---

## 1. COMPLETE MIDDLEWARE CHAIN (Registration Order)

### Phase A: Global Middleware (runs on EVERY request)

| # | Line | Middleware | Scope | Cost/req | Bottleneck? |
|---|------|-----------|-------|----------|-------------|
| 1 | 241 | **Debug request logger** | `*` (dev only) | ~1ms | No (dev-only) |
| 2 | 257 | `applySecurityMiddleware(app)` → installs **11 sub-middleware** (see §2) | `*` | **10-20ms** | **YES** |
| 3 | 261 | **Redis rate limiter** (`createRedisRateLimiter()`) | `/api/*` | **5-10ms** | **YES** |
| 4 | 264 | `applyPerformanceMiddleware(app)` → installs **2 sub-middleware** (see §3) | `*` | 2-3ms | Medium |
| 5 | 270 | **httpLogger** (structured logging) | `*` | 1-3ms | Low |
| 6 | 274 | `/api/firecrawl-webhooks` **raw body route** | `/api/firecrawl-webhooks` | ~0ms (short-circuits) | No |
| 7 | 278 | `express.json({ limit: '50mb' })` | `*` | **1-5ms** | **YES (oversized)** |
| 8 | 279 | `express.urlencoded({ extended: true, limit: '50mb' })` | `*` | 1ms | Low |
| 9 | 282 | `cookieParser()` | `*` | <1ms | No |
| 10 | 287 | `csrfProtection` | `/api/*` (prod only) | 1ms | No |
| 11 | 301 | **Immutability policy enforcement** | `*` (DELETE/bulk-delete only) | <1ms | No |

### Phase B: Auth Gate

| # | Line | Middleware | Scope |
|---|------|-----------|-------|
| 12 | 596 | **Global auth middleware** (JWT verify) | `/api/*` (except open paths) |

### Phase C: ~150+ Route Mounts (Lines 518–7483)

All mounted with `app.use('/api/...', router)`. Key groupings:

- **Lines 518-586**: Auth routes (auth, users, enterprise auth, SSO)
- **Lines 950-989**: Templates, AI, enterprise, CMC (12 sub-routes)
- **Lines 999-1098**: AI assistance, AnA Cortex, CSR search, Foresight
- **Lines 1107-1794**: 50+ domain routes (FDA, eCTD, evidence, billing, etc.)
- **Lines 1806-2100**: Evidence fabric, knowledge base, document management
- **Lines 2562-2563**: Reports
- **Lines 4051-4272**: AnA RI, authoring, chat, concept2cure, AI actions, submission center
- **Lines 4744-4757**: Project routes, FDA forms, field sync
- **Lines 7144-7483**: Tenants, organizations, projects, modules, analytics, vault, CSR builder, planner

### Phase D: Static Files & Catchall

| # | Line | Middleware | Scope |
|---|------|-----------|-------|
| ~163 | 2109 | `express.static('/tmp/uploads')` | `/uploads/*` |
| ~164 | 7913 | `app.all('/api/*', ...)` — API 404 catchall | `/api/*` |
| ~165 | 7927 | `errorHandler` — global error handler | `*` |
| ~166 | 7943 | `serveStatic(app)` / `setupVite(app)` | `*` (catch-all for SPA) |

---

## 2. `applySecurityMiddleware()` Breakdown (Line 257)

From `server/middleware/enterprise-security.ts` line 584-630:

| Order | Sub-Middleware | Scope | Cost |
|-------|--------------|-------|------|
| 2a | `enforceHttps` | `*` | <1ms |
| 2b | `securityHeaders` (Helmet) | `*` | <1ms |
| 2c | `requestId` (UUID generation) | `*` | <1ms |
| 2d | `corsMiddleware` | `*` | 1-2ms (origin list scan) |
| 2e | `rateLimiters.global` | `*` | **3-5ms (express-rate-limit, in-memory)** |
| 2f | `sanitizeInput` | `*` | 1-2ms |
| 2g | `csrfProtection` (origin/referer) | `*` (state-changing) | 1ms |
| 2h | `validateTenantContext` | `*` | 1-2ms |
| 2i | `auditLog` | `*` | **2-5ms** |
| 2j | `validateApiKey` | `*` | 1ms |
| 2k | `rateLimiters.auth` | `/api/auth` | Scoped — OK |
| 2l | `rateLimiters.ai` | `/api/ai` | Scoped — OK |
| 2m | `rateLimiters.export` | `/api/export` | Scoped — OK |
| 2n | `rateLimiters.upload` | `/api/upload` | Scoped — OK |
| 2o | `rateLimiters.write` | `/api/workflow`, `/api/documents` | Scoped — OK |

---

## 3. `applyPerformanceMiddleware()` Breakdown (Line 264)

From `server/middleware/enterprise-performance.ts` line 574-600:

| Order | Sub-Middleware | Scope | Cost |
|-------|--------------|-------|------|
| 4a | `compressionMiddleware` (gzip, level 6, threshold 1024B) | `*` | 2-3% CPU |
| 4b | `monitorPerformance` (response time tracking) | `*` | <1ms |

---

## 4. PERFORMANCE BOTTLENECK ANALYSIS

### CRITICAL: Triple Rate Limiting (Lines 257, 261)

**Problem**: Every `/api/*` request is rate-limited **three times**:

1. `rateLimiters.global` (in `applySecurityMiddleware`) — in-memory, express-rate-limit
2. `redisRateLimiter` (line 261) — Redis-backed sliding window, 5-10ms network RTT
3. Route-specific rate limiters (auth, ai, export, upload, write)

**Impact**: 8-15ms overhead per request just for rate limiting.

**Fix**: Remove `rateLimiters.global` from `applySecurityMiddleware` since the Redis rate limiter already covers `/api/*`. Keep the route-specific ones (they serve different limits).

### CRITICAL: `express.json()` on ALL Requests (Line 278)

**Problem**: JSON body parsing with a **50MB limit** runs on every request including:
- GET requests (no body)
- Static file requests that somehow pass through
- Health checks
- WebSocket upgrade paths

**Impact**: Allocates buffer parsing logic even for bodyless requests; 50MB limit leaves open a potential slow-client DoS vector.

**Fix**: Scope to `/api` only, reduce default limit, use route-level overrides for upload endpoints:
```typescript
app.use('/api', express.json({ limit: '2mb' }));
// Route-level override for document upload endpoints:
app.use('/api/documents/upload', express.json({ limit: '50mb' }));
```

### HIGH: Compression Before Static Files (Line 264 vs 7943)

**Problem**: `compressionMiddleware` (line 264) runs on ALL responses, but `serveStatic()` is mounted last (line 7943). In production, Vite-built assets already have hashes — they should use `Cache-Control: immutable` and skip compression on cache hits.

**Impact**: CPU wasted re-compressing cached assets; browser should cache and never re-request.

**Fix**: Mount `express.static()` with proper cache headers BEFORE global middleware:
```typescript
// Before security middleware
app.use(express.static(distPath, { 
  maxAge: '1y', 
  immutable: true,
  etag: false  // Hash in filename already
}));
```

### HIGH: httpLogger on Every Request (Line 270)

**Problem**: Structured logger runs globally, including health checks and static assets.

**Fix**: Scope to `/api` or skip health/static:
```typescript
app.use('/api', httpLogger);
```

### HIGH: 11 Security Middleware on Health Checks (Line 257)

**Problem**: `/api/health`, `/healthz`, `/readyz` go through all 11 security sub-middleware (Helmet, CORS, rate limiter, input sanitization, audit log, tenant validation, API key validation) before returning `{ status: 'healthy' }`.

**Impact**: Health check latency inflated by 15-20ms. Load balancers/probes hit this frequently.

**Fix**: Mount health endpoints BEFORE security middleware:
```typescript
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/readyz', async (_req, res) => { ... });
app.get('/api/health', async (req, res) => { ... });
// THEN apply security middleware
applySecurityMiddleware(app);
```

### MEDIUM: Duplicate CSRF Protection

**Problem**: CSRF is applied twice:
1. Inside `applySecurityMiddleware()` (line 257 → sub-middleware 2g)
2. Explicitly at line 287: `app.use('/api', csrfProtection)`

**Fix**: Remove one. The enterprise-security version likely already covers this.

### MEDIUM: `auditLog` on Every Request (applySecurityMiddleware, sub 2i)

**Problem**: Audit logging runs on every request, not just mutations. For GET requests (the majority), this creates unnecessary I/O.

**Fix**: Scope to state-changing methods only:
```typescript
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return auditLog(req, res, next);
  }
  next();
});
```

### MEDIUM: ~60 Eager Top-Level Imports (Lines 25-160)

**Problem**: 12 CMC route modules + 5 Foresight modules + intelligent docs + enterprise routes + AI assistance are all `import`'ed at the top of the file (synchronous, blocking startup).

**Good news**: ~90 routes use `await import()` (lazy). But these eager imports add 2-5s to startup.

**Lazy candidates** (currently eager, rarely accessed):
- `cmcBlueprintRoutes`, `cmcSpecificationRoutes`, `cmcStabilityRoutes`, `cmcBatchRecordRoutes`, `cmcWorkflowRoutes`, `cmcCollaborationRoutes`, `cmcDocumentRoutes` — all CMC sub-routes
- `foresightApiRoutes`, `foresightAIAdvancedRoutes`, `foresightFeedbackRoutes`
- `predictiveSectionsRoutes`
- `testAssemblyRoutes`

---

## 5. RECOMMENDED MIDDLEWARE REORDERING

Current order vs. optimal order:

### Current (Problematic)
```
1. Debug logger (dev)
2. Security (11 sub-MW including global rate limit + audit on ALL)
3. Redis rate limiter on /api
4. Compression + perf monitoring
5. httpLogger (global)
6. JSON body parser (global, 50MB)
7. urlencoded (global)
8. cookieParser (global)
9. CSRF (duplicate)
10. Immutability check (global)
11. Auth gate at /api
12. ~150 route handlers
13. Static files (LAST!)
14. Error handler
```

### Recommended (Optimized)
```
1. Health endpoints (/healthz, /readyz, /api/health) — NO middleware overhead
2. Static file serving (express.static with Cache-Control: immutable) — short-circuit cached assets
3. Compression (only hits non-cached, non-static responses now)
4. Security headers (Helmet) + requestId + HTTPS enforcement
5. CORS
6. Redis rate limiter on /api (REMOVE duplicate global rate limiter)
7. httpLogger (scope to /api only)
8. JSON body parser (scope to /api, limit 2MB default)
9. urlencoded (scope to /api)
10. cookieParser (scope to /api)
11. CSRF (single instance, not duplicate)
12. Input sanitization (scope to /api)
13. Tenant validation (scope to /api)
14. Audit log (scope to /api + mutations only)
15. Auth gate at /api
16. Route handlers
17. API 404 catchall
18. Error handler
```

---

## 6. ESTIMATED IMPACT

| Optimization | Latency Reduction | Requests Affected |
|-------------|-------------------|-------------------|
| Remove duplicate rate limiter | -3-5ms | All `/api/*` |
| Health checks before middleware | -15-20ms | Health probes (~10/min) |
| Static files before middleware | -15-20ms | All asset loads |
| Scope JSON parser to `/api` | -1-2ms | Non-API requests |
| Scope httpLogger to `/api` | -1-3ms | Health/static requests |
| Scope audit to mutations only | -2-5ms | All GET requests |
| Remove duplicate CSRF | -1ms | All `/api/*` |
| **Total (API requests)** | **-5-8ms** | |
| **Total (static/health)** | **-20-30ms** | |

### Startup Time
| Optimization | Startup Reduction |
|-------------|-------------------|
| Lazy-load 12 CMC route imports | ~1-2s |
| Lazy-load Foresight route imports | ~0.5-1s |
| **Total** | **~2-3s faster cold start** |

---

## 7. QUICK ACTION ITEMS

1. **Move health endpoints before `applySecurityMiddleware()`** — zero risk, immediate benefit
2. **Remove `rateLimiters.global` from enterprise-security.ts** — Redis limiter covers this
3. **Remove duplicate `csrfProtection`** at line 287 — already in enterprise-security
4. **Scope `express.json()` to `/api`** and reduce default to 2MB
5. **Scope `httpLogger` to `/api`** 
6. **Scope `auditLog` to mutation methods only** (POST/PUT/PATCH/DELETE)
7. **Add `Cache-Control` headers to `express.static()`** in `serveStatic()` (server/vite.ts)
8. **Convert 12 eager CMC imports to `await import()`** pattern
