# Phase 2: Document Identity + Cross-Reference Graph

**Date:** 2026-02-03
**Status:** ✅ COMPLETE

---

## Overview

Phase 2 implements deterministic anchor extraction and cross-reference detection for the Shadow FDA Reviewer system.

## Components Built

### 1. Database Schema (`vault.anchors` + `vault.cross_references`)

Migration: `db/migrations/20260203_phase2_anchors_xrefs.sql`

```sql
-- Apply migration
psql "$DB_URL" -f db/migrations/20260203_phase2_anchors_xrefs.sql
```

### 2. Python Graph Layer

```
lumen_cortex/graph/
├── __init__.py
├── anchors/
│   ├── __init__.py
│   ├── models.py          # Anchor Pydantic model
│   └── extractor.py       # AnchorExtractor class
├── xrefs/
│   ├── __init__.py
│   ├── models.py          # CrossRef Pydantic model
│   └── detector.py        # CrossRefDetector class
├── validate/
│   ├── __init__.py
│   └── validator.py       # GraphValidator + ValidationResult
└── storage/
    ├── __init__.py
    └── neon_adapter.py    # NeonGraphStorage persistence
```

---

## How to Run Graph Validation

### Python API

```python
from lumen_cortex.core.canonical import CanonicalDocument
from lumen_cortex.graph import GraphValidator, validate_document_graph

# Load your canonical document
doc: CanonicalDocument = ...

# Validate
result = validate_document_graph(doc)

# Output options
print(result.to_markdown())  # Human-readable report
print(result.to_dict())      # JSON-serializable dict
```

### Sample Output

```markdown
# Graph Validation Report

**Document ID:** `12345678-1234-5678-1234-567812345678`
**Content Hash:** `8d430eb73472bd01...`

## Summary

| Metric            | Count |
| ----------------- | ----- |
| Anchors           | 7     |
| Cross-References  | 5     |
| Valid             | 2     |
| **Broken**        | **2** |
| Ambiguous         | 0     |
| External          | 1     |
| Duplicate Anchors | 0     |

## Broken References (2)

- **section-99-99** at paragraph 6: "See Section 99.99 which does not exist..."
- **section-2-1** at paragraph 4: "As described in Section 2.1, the study..."
```

---

## Database Queries

### Check Table Existence

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'vault'
AND tablename IN ('anchors', 'cross_references');
```

### Validation Status Summary

```sql
SELECT validation_status, COUNT(*)
FROM vault.cross_references
WHERE content_hash = '<sha256_hash>'
GROUP BY validation_status
ORDER BY validation_status;
```

### Find Broken References

```sql
SELECT
    xr.target_anchor_key,
    xr.evidence_pointer->>'paragraph_index' as paragraph,
    xr.confidence
FROM vault.cross_references xr
WHERE xr.content_hash = '<sha256_hash>'
AND xr.validation_status = 'broken'
ORDER BY (xr.evidence_pointer->>'paragraph_index')::int;
```

### Find Duplicate Anchors

```sql
SELECT
    anchor_key,
    COUNT(*) as occurrences,
    array_agg(anchor_ordinal ORDER BY anchor_ordinal) as ordinals
FROM vault.anchors
WHERE content_hash = '<sha256_hash>'
GROUP BY anchor_key
HAVING COUNT(*) > 1;
```

---

## Test Results

```
PYTHONHASHSEED=0 pytest lumen_cortex/tests -q
..........................................     [100%]
42 passed in 0.35s
```

### Test Coverage

| Category                    | Tests | Status  |
| --------------------------- | ----- | ------- |
| Phase 1 Determinism         | 20    | ✅ PASS |
| Phase 2 Anchor Extraction   | 5     | ✅ PASS |
| Phase 2 Cross-Ref Detection | 5     | ✅ PASS |
| Phase 2 Graph Validation    | 6     | ✅ PASS |
| Phase 2 Integration         | 2     | ✅ PASS |
| Anchor Key Normalization    | 4     | ✅ PASS |

---

## Files Created

| File                                              | Purpose             |
| ------------------------------------------------- | ------------------- |
| `db/migrations/20260203_phase2_anchors_xrefs.sql` | Migration SQL       |
| `lumen_cortex/graph/__init__.py`                  | Package exports     |
| `lumen_cortex/graph/anchors/*.py`                 | Anchor extraction   |
| `lumen_cortex/graph/xrefs/*.py`                   | Cross-ref detection |
| `lumen_cortex/graph/validate/*.py`                | Graph validation    |
| `lumen_cortex/graph/storage/*.py`                 | Neon persistence    |
| `lumen_cortex/tests/test_graph_phase2.py`         | Phase 2 tests       |

---

## Next Steps (Phase 3)

1. Implement Rule Registry (R001-R003)
2. Build Finding assembly from broken xrefs
3. Create `/review/document` FastAPI endpoint
4. Wire to existing API infrastructure
