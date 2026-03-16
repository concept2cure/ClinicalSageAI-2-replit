# Task H — IND Draft → Governed Document E2E Proof

**Date**: 2026-03-11
**Branch**: `concept2cure-v2`
**Test project**: `proj_30` — RetinAI DX-1 — De Novo Classification Request
**Test user**: `jm.smith@concept2cure.pro` (userId=3, orgId=2)

---

## Bug Found & Fixed

**Problem**: `ctdSection` sent as a top-level field by `EditorPanel` was **silently stripped** by the Zod `createArtifactSchema` because the schema only accepted `metadata.ctdSection`. The column existed in the DB but was never populated.

**Fix** (commit in this session):

1. Added `ctdSection: z.string().max(50).optional()` to `createArtifactSchema`
2. Updated insert to read `data.ctdSection || data.metadata?.ctdSection` (backward-compatible)
3. Updated provenance emission to use resolved `ctdSection` variable instead of re-reading from `data.metadata`

**Files changed**: `server/routes/concept2cure.ts`

---

## E2E Proof Steps

### Step 1 — Create artifact via POST (simulates IND workspace → EditorPanel flow)

```
POST /api/concept2cure/projects/proj_30/artifacts
Authorization: Bearer <JWT>
Body:
  title: "Clinical Overview — RetinAI DX-1 (Final E2E Proof)"
  content: "# 2.5 Clinical Overview..."
  type: "regulatory_document"
  category: "document"
  ctdSection: "2.5"
  metadata: { generationMethod: "ai", sourceModule: "ind-workspace" }
```

**Response**: `201 Created`

```
artifact_id: artifact_1773270583387_61e38245f2f5
version: 1
```

### Step 2 — Verify ctd_section stored in DB

```sql
SELECT id, artifact_id, ctd_section, status, version
FROM concept2cure_artifacts
WHERE artifact_id = 'artifact_1773270583387_61e38245f2f5';
```

**Result**:

```
id=76 | ctd_section=2.5 | status=draft | version=1
```

✅ `ctd_section` correctly stored

### Step 3 — Verify provenance event

```sql
SELECT event_type, event_action, actor_email, details::text
FROM concept2cure_provenance_events
WHERE artifact_id = 76;
```

**Result**:

```
event_type=generation | event_action=ai_generate | actor=jm.smith@concept2cure.pro
details: { ctdSection: "2.5", contentHash: "573ab7...", title: "Clinical Overview..." }
```

✅ Provenance event emitted with `ctdSection` in details

### Step 4 — Verify version record

```sql
SELECT id, artifact_id, version, content_hash
FROM concept2cure_artifact_versions
WHERE artifact_id = 76;
```

**Result**:

```
id=92 | version=1 | content_hash=573ab7573ac54bd702d20917cfedb772e30b9559755d2c2f0a4b1a48d973313c
```

✅ Version 1 recorded with matching content hash

### Step 5 — Verify artifact appears in project listing

```
GET /api/concept2cure/projects/proj_30/artifacts
```

**Result**:

```
artifact_1773270583387_61e38245f2f5  ctd=2.5  Clinical Overview — RetinAI DX-1 (Final E2E Proof)
artifact_1773270516097_8f9ebe3106a4  ctd=2.4  Nonclinical Overview — RetinAI DX-1 (E2E Proof)
artifact_1773270090862_bbd8e42dbca9  ctd=None Nonclinical Overview — RetinAI DX-1 (pre-fix)
artifact_1773244097155_fe14d16359fa  ctd=denovo.1 De Novo Risk-Benefit Analysis
```

✅ All artifacts visible, ctdSection values correct

---

## Verdict

| Check                              | Result                         |
| ---------------------------------- | ------------------------------ |
| Artifact created via API           | ✅ 201 Created                 |
| `ctd_section` stored in DB         | ✅ `2.5`                       |
| Provenance event emitted           | ✅ `generation / ai_generate`  |
| `ctdSection` in provenance details | ✅ `"2.5"`                     |
| Version record created             | ✅ v1, hash matches            |
| Content hash integrity             | ✅ Matches across all tables   |
| Artifact in project listing        | ✅ Visible with ctdSection     |
| Actor attribution                  | ✅ `jm.smith@concept2cure.pro` |

**PASS** — IND Draft → Governed Document flow is proven end-to-end with live API and database verification.
