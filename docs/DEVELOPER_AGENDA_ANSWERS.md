# Developer Agenda: Answers to Items 1-4

## Item 1: How to start the full stack locally

### Service Order
```
1. PostgreSQL  →  (Docker or Neon cloud)
2. Shadow Service  →  uvicorn on :8001
3. BFF + Vite  →  Express on :5000  (serves UI + proxies API)
```

### Quick Start
```bash
# Option A: One command (recommended)
scripts/dev-all.sh

# Option B: Manual
# Terminal 1 — Shadow Service
cd shadow_service
echo "DATABASE_URL=postgresql://..." > .env
echo "REVIEW_ADMIN_TOKEN=dev-review-token-change-me" >> .env
python3 -m uvicorn shadow_service.main:app --host 0.0.0.0 --port 8001 --reload

# Terminal 2 — BFF + Vite
export SHADOW_SERVICE_URL=http://localhost:8001
export REVIEW_ADMIN_TOKEN=dev-review-token-change-me
npm run dev
```

### Ports
| Service | Port | Protocol |
|---------|------|----------|
| PostgreSQL | 5432 | TCP |
| Shadow Service (FastAPI) | 8001 | HTTP |
| BFF + Vite (Express) | 5000 | HTTP |

### Required Environment Variables
| Variable | Where | Purpose |
|----------|-------|---------|
| `DATABASE_URL` | Both | PostgreSQL connection string |
| `REVIEW_ADMIN_TOKEN` | Both | Shared secret: BFF→Shadow auth |
| `SHADOW_SERVICE_URL` | BFF only | Where BFF finds Shadow (default: `http://localhost:8001`) |
| `JWT_SECRET` | BFF only | JWT signing key (default exists for dev) |

---

## Item 2: Shadow URL wiring — how BFF talks to Shadow

The BFF uses a helper function in each route file:

```typescript
// server/routes/defense-packet.ts (and similar)
function getShadowUrl() {
  return process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
}

function getAdminToken() {
  return process.env.REVIEW_ADMIN_TOKEN || '';
}
```

Every BFF → Shadow request sends:
```
Authorization: Bearer <REVIEW_ADMIN_TOKEN>
Content-Type: application/json
```

The Shadow Service validates this in `router_render.py`:
```python
settings = get_settings()
if not settings.review_admin_token:
    raise HTTPException(503, "Render service is not configured")
if req_token != f"Bearer {settings.review_admin_token}":
    raise HTTPException(401, "Unauthorized")
```

**To wire a new BFF route to Shadow:** Copy `getShadowUrl()` + `getAdminToken()` pattern, hit `http://localhost:8001/<endpoint>`.

---

## Item 3: Minimum seed data to run the render pipeline

### What you need in the database

1. **A proof_pack_exports row** — this is what the renderer reads:
   ```sql
   INSERT INTO proof_pack_exports (
     id, proof_pack_id, manifest_hash, risk_vocab_hash,
     risk_code_lock_hash, schema_hash, generator_version,
     subject_hash, se_payload, contract_snapshot, metadata,
     program_id, created_at
   ) VALUES (
     gen_random_uuid(),
     'test-proof-pack-001',
     'sha256-manifest-test',
     'sha256-risk-vocab-test',
     'sha256-risk-code-lock-test',
     'sha256-schema-test',
     '7.0F',
     'sha256-subject-test',
     '{"version": "2.0", "rows": [{"risk_code": "RC001", "dimension": "Biocompatibility", "score": 85, "discussion": "Material is substantially equivalent"}]}',
     '{"risk_vocab_locked": true, "schema_locked": true, "manifest_sealed": true}',
     '{}',
     'test-program-001',
     NOW()
   );
   ```

2. **A user** — in dev mode, the BFF auto-injects an admin user:
   ```typescript
   // server/routes.ts (dev mode)
   req.user = { id: 1, username: 'admin', role: 'admin' }
   ```
   No separate user seed needed for local dev.

3. **A regulatory program** — only needed if using `requireProgramAccess` middleware:
   ```sql
   INSERT INTO regulatory_programs (id, name, organization_id)
   VALUES ('test-program-001', 'Test Program', 1);
   ```

### What you DON'T need
- No CSR documents needed (renderer reads from proof_pack_exports)
- No file uploads needed
- No external API keys needed

---

## Item 4: How migrations work

### Two migration systems

1. **Drizzle (BFF/TypeScript side)**
   - Schema defined in `shared/schema.ts`
   - Push with: `npm run db:push` (runs `drizzle-kit push`)
   - Ensure core tables: `npm run db:ensure` (runs `ensureCoreTables.ts`)

2. **Raw SQL (Shadow Service / Phase 7+)**
   - Migration files in `db/migrations/` (97+ files)
   - **No automated migration runner** — apply manually:
     ```bash
     psql "$DATABASE_URL" -f db/migrations/20260212_phase7_0c_render_tenant_safety.sql
     ```
   - Each migration is idempotent (uses `IF NOT EXISTS`, `DO $$ ... $$`)

### Migration for Phase 7.0C-F
The single migration file handles everything:
```bash
psql "$DATABASE_URL" -f db/migrations/20260212_phase7_0c_render_tenant_safety.sql
```

This:
- Adds `program_id` column to `render_jobs`
- Adds `idempotency_key` column with unique index
- Expands `artifact_type` CHECK to include new types
- Adds composite index for program-scoped queries
- Adds TTL cleanup index for expired jobs

### Future: Automated runner
There is no migration runner yet. If you want to run all pending migrations:
```bash
for f in db/migrations/*.sql; do
  echo "Running $f..."
  psql "$DATABASE_URL" -f "$f"
done
```
