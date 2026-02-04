# Lumen Cortex Phase 0: Reuse vs Net New Analysis

## Date: 2026-02-03

---

## Executive Summary

Based on the codebase and database archaeology, there's significant existing infrastructure to leverage. The key insight is that **document extraction, citation validation, and enterprise patterns already exist** — we're building the Shadow Reviewer logic on proven foundations.

---

## ✅ REUSE (Leverage Existing)

### Document Processing Libraries

| Component                         | Location                                   | Status            |
| --------------------------------- | ------------------------------------------ | ----------------- |
| `mammoth` (DOCX→HTML/text)        | Multiple services                          | ✅ Production use |
| `pdf-parse` (PDF→text)            | `server/openai-service.ts`, etc.           | ✅ Production use |
| `python-docx` (DOCX manipulation) | `server/services/python/requirements.txt`  | ✅ Available      |
| `pypdf` / `pdfplumber`            | `lumen_cortex/enterprise/requirements.txt` | ✅ Available      |

### Database Infrastructure

| Component                                  | Location           | Status                  |
| ------------------------------------------ | ------------------ | ----------------------- |
| `documents` table with `content_hash`      | `shared/schema.ts` | ✅ SHA256 ready         |
| `ectd_modules` / `ectd_granules`           | Neon DB            | ✅ ICH structure exists |
| `validation_findings` table                | Neon DB            | ✅ Schema exists        |
| `lumen_data_atoms` + embeddings            | Neon DB            | ✅ Vector storage ready |
| Multi-tenant isolation (`organization_id`) | All tables         | ✅ Pattern established  |

### Enterprise Patterns (lumen_cortex/enterprise/)

| Component                  | File                         | Status                      |
| -------------------------- | ---------------------------- | --------------------------- |
| Table extraction ensemble  | `extraction.py` (1052 lines) | ✅ Bayesian averaging       |
| Citation validation layers | `citation.py` (1065 lines)   | ✅ Entailment, KG, NLI      |
| Compliance/audit framework | `compliance.py`              | ✅ Merkle trees, signatures |
| Circuit breaker resilience | `core.py`                    | ✅ API call protection      |
| Event bus architecture     | `core.py`                    | ✅ Event-driven ready       |
| LLM routing                | `llm_router.py`              | ✅ Multi-model support      |
| Config management          | `config.py`                  | ✅ Pydantic validated       |

### AI/LLM Integration

| Component               | Location                                | Status              |
| ----------------------- | --------------------------------------- | ------------------- |
| OpenAI client singleton | `server/openai-service.ts`              | ✅ Production ready |
| Embedding generation    | `lumen_cortex/enterprise/embeddings.py` | ✅ Vector support   |
| API bridge to Node.js   | `lumen_cortex/enterprise/api_bridge.py` | ✅ IPC pattern      |

---

## 🗑️ DELETE (Do Not Use)

### Legacy/Deprecated Code

| Component                            | Location           | Reason                          |
| ------------------------------------ | ------------------ | ------------------------------- |
| ~~\_archive/~~                       | Deleted in PR #72  | Already removed                 |
| ~~\_deprecated_migrations/~~         | Deleted in PR #72  | Already removed                 |
| Multiple duplicate `new Pool()`      | Various services   | Replaced with `getPool()`       |
| `server/database/DatabaseManager.js` | `server/database/` | Unused, creates standalone pool |

### Avoid Patterns

- Direct `new Pool()` instantiation (use `getPool()`)
- Multiple database connection patterns (use canonical `server/db.ts`)
- Storing large blobs in Neon directly (use object storage)

---

## 🔨 BUILD (Net New)

### Phase 1: Determinism Harness & Canonical Foundation

| Component                          | Priority | Notes                                              |
| ---------------------------------- | -------- | -------------------------------------------------- |
| `EvidencePointer` Pydantic model   | P0       | **Spec Frozen v1.0** - deterministic coordinates   |
| `CanonicalDocument` Pydantic model | P0       | **Spec Frozen v1.0** - parser-agnostic structure   |
| `Finding` Pydantic model           | P0       | **Spec Frozen v1.0** - with fingerprint + versions |
| `document_blobs` table             | P1       | Separate metadata from raw bytes (S3/local)        |
| DOCX→Canonical extractor           | P1       | Build on mammoth, add structure preservation       |
| PDF→Canonical extractor            | P1       | Build on pdfplumber, add bbox coordinates          |
| Determinism test suite             | P0       | Snapshot tests, PYTHONHASHSEED=0                   |

### Phase 2: Document Identity & Cross-Reference Graph

| Component                | Priority | Notes                                      |
| ------------------------ | -------- | ------------------------------------------ |
| `anchors` table          | P1       | Bookmarks, headings, numbered paragraphs   |
| `cross_references` table | P1       | Source→target links with validation_status |
| Anchor extractor         | P1       | DOCX bookmarks + heading styles            |
| Cross-reference detector | P1       | Pattern matching "See Section X.Y.Z"       |
| Graph validator          | P1       | Detect broken/ambiguous references         |

### Phase 3: Shadow FDA Reviewer

| Component                   | Priority | Notes                                      |
| --------------------------- | -------- | ------------------------------------------ |
| Rule registry (R001-R003)   | P1       | Broken xref, duplicate anchor, missing CTD |
| Finding assembly            | P1       | Evidence pointer → context → remediation   |
| `/review/document` endpoint | P1       | FastAPI route for single doc review        |
| `/review/batch` endpoint    | P2       | Multi-document (Module 1-5) review         |

---

## Integration Points

### Reuse These Interfaces

1. **Database Connection**: `getPool()` from `server/db.ts`
2. **OpenAI Client**: `openai` export from `server/openai-service.ts`
3. **Event Bus**: `event_bus` from `lumen_cortex/enterprise/core.py`
4. **Audit Trail**: `MerkleAuditTrail` from `lumen_cortex/enterprise/compliance.py`
5. **Circuit Breaker**: `CircuitBreaker` from `lumen_cortex/enterprise/core.py`

### New Module Structure

```
/lumen_cortex
  /core                    # NEW - Phase 1 foundations
    /canonical             # Pydantic models (EvidencePointer, CanonicalDocument, Finding)
    /extractors            # DOCX/PDF → canonical converters
    /pointers              # Evidence pointer builders
    /storage               # Content-addressable adapters
    /determinism           # Snapshot tests
  /graph                   # NEW - Phase 2 document graph
    /anchors               # Bookmark/heading extraction
    /xrefs                 # Cross-reference detection
    /lineage               # UUID lifecycle
  /reviewer                # NEW - Phase 3 shadow reviewer
    /rules                 # CFR/ICH rule registry
    /findings              # Deficiency report assembly
    /evidence              # Evidence context building
  /api                     # NEW - FastAPI routes
  /enterprise              # EXISTING - leverage as-is
```

---

## Critical Path

```
Phase 0 ✅ Complete (this document)
    ↓
Phase 1 → EvidencePointer + CanonicalDocument + Finding schemas
    ↓     + Determinism tests passing
    ↓
Phase 2 → Anchor extraction + Cross-reference graph
    ↓     + Broken link detection
    ↓
Phase 3 → Rules R001-R003 + /review/document API
    ↓     + "Hello World" demo
    ↓
Phase 4 → Assisted generation (templates, auto-fix)
    ↓
Phase 5 → eCTD 4.0 HL7 packaging
```

---

## Validation Checklist

Before proceeding to Phase 1, confirm:

- [x] Database inventory complete (`reports/phase0/db_inventory.txt`)
- [x] Code inventory complete (`reports/phase0/code_inventory.txt`)
- [x] Reuse vs Net New analysis complete (this document)
- [ ] Review with stakeholder before Phase 1 implementation

---

## Decision Log

| Decision                        | Rationale                                                        |
| ------------------------------- | ---------------------------------------------------------------- |
| Use Pydantic for schemas        | Existing pattern in lumen_cortex/enterprise, validation built-in |
| Build on mammoth for DOCX       | Already production-proven, 10+ services using it                 |
| Separate document_blobs         | Don't store >10MB files in Neon JSONB                            |
| Leverage extraction.py ensemble | Bayesian model averaging already implemented                     |
| Build dedicated reviewer module | Citation.py is for hallucination prevention, not FDA review      |
