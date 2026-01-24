# Operational Qualification Protocol
## Cortex Prime AI System

---

**Document ID:** OQ-CORTEX-001  
**Version:** 1.0.0-DRAFT  
**Classification:** GxP Critical  
**Status:** ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE

---

## Document Control

| Version | Date | Author | Description | Approved By |
|---------|------|--------|-------------|-------------|
| 1.0.0-DRAFT | 2025-01-24 | Engineering | Initial draft | PENDING |

**Prerequisites:**
- IQ-CORTEX-001: Installation Qualification (APPROVED)

---

## 1. Purpose

This Operational Qualification (OQ) Protocol verifies that the Cortex Prime AI System operates correctly within its specified operational limits and in accordance with design specifications.

---

## 2. Scope

### 2.1 Functions Under Test

| Function Category | Risk Level | Coverage |
|------------------|------------|----------|
| Core CRUD Operations | HIGH | 100% |
| Semantic Search | HIGH | 100% |
| Graph Traversal | MEDIUM | 90% |
| Regulatory Intuition | CRITICAL | 100% |
| Epistemic Intelligence | HIGH | 100% |
| Causal Inference | HIGH | 100% |
| Self-Evolution | CRITICAL | 100% |
| Cross-Domain Transfer | HIGH | 90% |
| Audit Trail | CRITICAL | 100% |
| Electronic Signatures | CRITICAL | 100% |
| Access Controls | CRITICAL | 100% |

---

## 3. Test Environment

### 3.1 Environment Details

| Parameter | Specification | Actual | Verified |
|-----------|--------------|--------|----------|
| Environment Type | Validation | | ☐ |
| Database Server | PostgreSQL 15.x | | ☐ |
| Application Server | Node.js 20.x | | ☐ |
| Test Data Set | VAL-DATA-001 | | ☐ |

### 3.2 Test Data Requirements

- Minimum 1000 test atoms with embeddings
- 10 test organizations
- 50 test users with various roles
- Pre-loaded rejection patterns
- Sample regulatory signals

---

## 4. Operational Qualification Tests

### 4.1 Core CRUD Operations

#### OQ-001: Atom Creation with Audit Trail

**Objective:** Verify atoms can be created and audit trail is generated.

**Preconditions:**
- User authenticated with valid session
- Organization context set

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Create atom via API | Atom created with UUID | | ☐ |
| 2 | Verify atom in database | Record exists | | ☐ |
| 3 | Verify audit trail entry | CREATE event logged | | ☐ |
| 4 | Verify audit entry fields | All required fields populated | | ☐ |
| 5 | Verify hash chain | Chain hash calculated | | ☐ |

**Test Data:**
```json
{
  "atomType": "test_validation",
  "content": "OQ Test Atom - VAL-001",
  "metadata": {"test_id": "OQ-001"}
}
```

**Verification Query:**
```sql
-- Check atom created
SELECT id, atom_type, content, created_at 
FROM cortex.atoms 
WHERE metadata->>'test_id' = 'OQ-001';

-- Check audit trail
SELECT event_id, event_type, user_email, record_id, chain_hash
FROM compliance.audit_trail
WHERE record_table = 'atoms' 
  AND record_id = '[ATOM_ID]';
```

**Results:**
- Atom ID: _________________
- Audit Event ID: _________________
- Chain Hash: _________________

**Executed By:** _________________ **Date:** _________

---

#### OQ-002: Atom Update with Change Reason

**Objective:** Verify atom updates require change reason and are logged.

**Preconditions:**
- Atom from OQ-001 exists
- Change reason requirement enabled

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Attempt update without reason | Request rejected | | ☐ |
| 2 | Update with change reason | Update successful | | ☐ |
| 3 | Verify previous values logged | Original content stored | | ☐ |
| 4 | Verify new values logged | New content stored | | ☐ |
| 5 | Verify change reason logged | Reason recorded | | ☐ |

**Test Data:**
```json
{
  "content": "OQ Test Atom - UPDATED",
  "changeReason": "Validation test update",
  "changeReasonCode": "CORRECTION"
}
```

**Executed By:** _________________ **Date:** _________

---

#### OQ-003: Atom Soft Delete

**Objective:** Verify atoms are soft deleted (not physically removed).

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Delete atom | Success response | | ☐ |
| 2 | Verify is_active = false | Record marked inactive | | ☐ |
| 3 | Verify record still exists | Physical record present | | ☐ |
| 4 | Verify audit trail | DELETE event logged | | ☐ |

**Executed By:** _________________ **Date:** _________

---

### 4.2 Semantic Search

#### OQ-004: Unified Search Accuracy

**Objective:** Verify semantic search returns relevant results.

**Preconditions:**
- Test data set loaded with known embeddings

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Execute search query | Results returned | | ☐ |
| 2 | Verify result count | ≤ requested limit | | ☐ |
| 3 | Verify similarity scores | All ≥ threshold | | ☐ |
| 4 | Verify org isolation | Only org data returned | | ☐ |
| 5 | Calculate precision@10 | ≥ 95% | | ☐ |

**Test Query:**
```sql
SELECT * FROM cortex.unified_search(
    '[embedding_vector]'::vector(3072),
    'regulatory submission oncology',
    ARRAY['regulatory_insight', 'csr_section'],
    '[org_id]',
    'oncology',
    NULL,
    20,
    0.5
);
```

**Results:**
- Total results: _________________
- Min similarity: _________________
- Precision@10: _________________

**Executed By:** _________________ **Date:** _________

---

#### OQ-005: Fast Search Performance

**Objective:** Verify fast search completes within performance threshold.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Execute fast search | Results returned | | ☐ |
| 2 | Measure response time | < 100ms | | ☐ |
| 3 | Verify uses 1536-dim index | Explain shows index scan | | ☐ |

**Performance Results:**
- Response time (ms): _________________
- Index used: ☐ Yes ☐ No

**Executed By:** _________________ **Date:** _________

---

### 4.3 Graph Traversal

#### OQ-006: Reasoning Chain Traversal

**Objective:** Verify graph traversal returns connected atoms.

**Preconditions:**
- Connected atoms exist in test data

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Execute traversal | Results returned | | ☐ |
| 2 | Verify depth limiting | Max depth respected | | ☐ |
| 3 | Verify strength filtering | All strengths ≥ threshold | | ☐ |
| 4 | Verify no cycles | Paths have unique nodes | | ☐ |

**Executed By:** _________________ **Date:** _________

---

### 4.4 Audit Trail (21 CFR Part 11)

#### OQ-007: Audit Trail Completeness

**Objective:** Verify all required audit fields are captured.

| Field | Required | Captured | Pass/Fail |
|-------|----------|----------|-----------|
| event_timestamp | Yes | ☐ | ☐ |
| event_type | Yes | ☐ | ☐ |
| user_id | Yes | ☐ | ☐ |
| user_email | Yes | ☐ | ☐ |
| user_full_name | Yes | ☐ | ☐ |
| organization_id | Yes | ☐ | ☐ |
| record_schema | Yes | ☐ | ☐ |
| record_table | Yes | ☐ | ☐ |
| record_id | Yes | ☐ | ☐ |
| previous_values | If UPDATE | ☐ | ☐ |
| new_values | If CREATE/UPDATE | ☐ | ☐ |
| change_reason | If configured | ☐ | ☐ |
| record_hash | Yes | ☐ | ☐ |
| chain_hash | Yes | ☐ | ☐ |

**Executed By:** _________________ **Date:** _________

---

#### OQ-008: Audit Trail Immutability

**Objective:** Verify audit trail cannot be modified.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Attempt direct UPDATE | Error raised | | ☐ |
| 2 | Verify error message | Contains "21 CFR Part 11" | | ☐ |
| 3 | Attempt direct DELETE | Error raised | | ☐ |
| 4 | Verify error message | Contains "immutable" | | ☐ |
| 5 | Verify via superuser | Still fails | | ☐ |

**Error Messages Captured:**
- UPDATE attempt: _________________
- DELETE attempt: _________________

**Executed By:** _________________ **Date:** _________

---

#### OQ-009: Audit Chain Integrity Verification

**Objective:** Verify chain hash integrity can be validated.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Run verify_audit_chain() | Function executes | | ☐ |
| 2 | Check is_valid | TRUE | | ☐ |
| 3 | Check verified_records | Matches total | | ☐ |
| 4 | Introduce corruption | Manual test | | ☐ |
| 5 | Rerun verification | Detects corruption | | ☐ |

**Verification Query:**
```sql
SELECT * FROM compliance.verify_audit_chain(
    '[org_id]',
    NOW() - INTERVAL '1 day',
    NOW()
);
```

**Results:**
- is_valid: _________________
- total_records: _________________
- verified_records: _________________

**Executed By:** _________________ **Date:** _________

---

### 4.5 Electronic Signatures

#### OQ-010: Signature Creation

**Objective:** Verify electronic signatures meet 21 CFR 11.50 requirements.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Create signature | Signature recorded | | ☐ |
| 2 | Verify printed_name | Signer name captured | | ☐ |
| 3 | Verify signature_meaning | Meaning captured | | ☐ |
| 4 | Verify timestamp | Date/time captured | | ☐ |
| 5 | Verify authentication | Method recorded | | ☐ |
| 6 | Verify record_hash | Hash captured | | ☐ |

**Signature Manifestation Check (21 CFR 11.50(a)):**
- Printed name of signer: ☐ Present
- Date and time of signature: ☐ Present
- Meaning of signature: ☐ Present

**Executed By:** _________________ **Date:** _________

---

#### OQ-011: Signature Immutability

**Objective:** Verify signatures cannot be modified after creation.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Attempt UPDATE | Error raised | | ☐ |
| 2 | Attempt DELETE | Error raised | | ☐ |
| 3 | Invalidate signature | Invalidation allowed | | ☐ |
| 4 | Verify reason required | Reason captured | | ☐ |
| 5 | Verify invalidator recorded | User recorded | | ☐ |

**Executed By:** _________________ **Date:** _________

---

### 4.6 Access Controls

#### OQ-012: Multi-Tenant Data Isolation

**Objective:** Verify organizations cannot access each other's data.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Query as Org A | Only Org A data returned | | ☐ |
| 2 | Query as Org B | Only Org B data returned | | ☐ |
| 3 | Attempt cross-org access | Access denied | | ☐ |
| 4 | Verify via direct SQL | RLS enforced | | ☐ |

**Test Query:**
```sql
-- Set context to Org A
SET app.current_org_id = '[org_a_id]';
SELECT COUNT(*) FROM cortex.atoms;
-- Expected: Only Org A atoms

-- Set context to Org B
SET app.current_org_id = '[org_b_id]';
SELECT COUNT(*) FROM cortex.atoms;
-- Expected: Only Org B atoms
```

**Results:**
- Org A atom count: _________________
- Org B atom count: _________________
- Cross-org attempt result: _________________

**Executed By:** _________________ **Date:** _________

---

### 4.7 Regulatory Intuition

#### OQ-013: Regulatory Signal Extraction

**Objective:** Verify regulatory signals are correctly extracted from documents.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Process test CRL | Signals extracted | | ☐ |
| 2 | Verify signal types | Correct types assigned | | ☐ |
| 3 | Verify confidence scores | Within valid range | | ☐ |
| 4 | Verify agency codes | Correct agency | | ☐ |
| 5 | Verify no false negatives | Known patterns detected | | ☐ |

**Test Document:** Complete Response Letter (Test-CRL-001)

**Expected Signals:**
- [ ] Clinical deficiency
- [ ] CMC deficiency
- [ ] Labeling issue

**Executed By:** _________________ **Date:** _________

---

#### OQ-014: Prediction Confidence Calibration

**Objective:** Verify predictions are well-calibrated.

| Predicted Confidence | Expected Accuracy | Actual Accuracy | Pass/Fail |
|---------------------|-------------------|-----------------|-----------|
| 90% | 85-95% | | ☐ |
| 80% | 75-85% | | ☐ |
| 70% | 65-75% | | ☐ |
| 60% | 55-65% | | ☐ |

**Calibration Assessment:**
- Total predictions tested: _________________
- Calibration error: _________________
- Within 5% threshold: ☐ Yes ☐ No

**Executed By:** _________________ **Date:** _________

---

### 4.8 Epistemic Intelligence

#### OQ-015: Uncertainty Decomposition

**Objective:** Verify uncertainty is correctly decomposed into components.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Estimate uncertainty | Estimate returned | | ☐ |
| 2 | Verify total uncertainty | Sum of components | | ☐ |
| 3 | Verify aleatoric | Non-negative | | ☐ |
| 4 | Verify epistemic | Non-negative | | ☐ |
| 5 | Verify model uncertainty | Non-negative | | ☐ |
| 6 | Verify data uncertainty | Non-negative | | ☐ |

**Uncertainty Components:**
- Total: _________________
- Aleatoric: _________________
- Epistemic: _________________
- Model: _________________
- Data: _________________

**Executed By:** _________________ **Date:** _________

---

### 4.9 Self-Evolution (CRITICAL)

#### OQ-016: Learning Experience Recording

**Objective:** Verify learning experiences are correctly recorded.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Record experience | Experience created | | ☐ |
| 2 | Verify input captured | Input stored | | ☐ |
| 3 | Verify output captured | Output stored | | ☐ |
| 4 | Verify org_id | Correct org assigned | | ☐ |
| 5 | Verify is_distillable | Flag set appropriately | | ☐ |

**Executed By:** _________________ **Date:** _________

---

#### OQ-017: Federated Learning Privacy

**Objective:** Verify no raw client data is exposed through federated learning.

| Step | Action | Expected Result | Actual | Pass/Fail |
|------|--------|-----------------|--------|-----------|
| 1 | Run distillation | Insights created | | ☐ |
| 2 | Check distilled content | No raw data | | ☐ |
| 3 | Verify differential privacy | Epsilon tracked | | ☐ |
| 4 | Cross-org query | No org-specific data | | ☐ |
| 5 | Verify source masking | Sources anonymized | | ☐ |

**Privacy Verification:**
- Distilled insights contain raw data: ☐ No ☐ Yes (FAIL)
- Differential privacy epsilon: _________________
- Cross-org leakage detected: ☐ No ☐ Yes (FAIL)

**Executed By:** _________________ **Date:** _________

---

### 4.10 Error Handling

#### OQ-018: Invalid Input Handling

**Objective:** Verify system handles invalid inputs gracefully.

| Test Case | Input | Expected Result | Actual | Pass/Fail |
|-----------|-------|-----------------|--------|-----------|
| Null content | NULL | Validation error | | ☐ |
| Invalid UUID | "not-a-uuid" | Format error | | ☐ |
| Oversized content | >1MB | Size limit error | | ☐ |
| Invalid atom type | "!!!invalid" | Type error | | ☐ |
| SQL injection | "'; DROP TABLE" | Escaped/rejected | | ☐ |

**Executed By:** _________________ **Date:** _________

---

### 4.11 Performance Testing

#### OQ-019: Search Performance Under Load

**Objective:** Verify search performance meets requirements under load.

| Concurrent Users | Response Time (p95) | Threshold | Pass/Fail |
|-----------------|--------------------:|----------:|-----------|
| 10 | ms | <200ms | ☐ |
| 50 | ms | <500ms | ☐ |
| 100 | ms | <1000ms | ☐ |

**Test Configuration:**
- Test duration: 5 minutes per load level
- Query type: unified_search with 3072-dim embedding

**Executed By:** _________________ **Date:** _________

---

## 5. OQ Summary

### 5.1 Test Results Summary

| Category | Total Tests | Passed | Failed | N/A |
|----------|-------------|--------|--------|-----|
| Core CRUD | 3 | | | |
| Semantic Search | 2 | | | |
| Graph Traversal | 1 | | | |
| Audit Trail | 3 | | | |
| Electronic Signatures | 2 | | | |
| Access Controls | 1 | | | |
| Regulatory Intuition | 2 | | | |
| Epistemic Intelligence | 1 | | | |
| Self-Evolution | 2 | | | |
| Error Handling | 1 | | | |
| Performance | 1 | | | |
| **TOTAL** | 19 | | | |

### 5.2 Deviations

| Deviation # | Test ID | Description | Severity | Resolution |
|-------------|---------|-------------|----------|------------|
| | | | | |

### 5.3 OQ Conclusion

☐ **PASSED** - All tests passed  
☐ **PASSED WITH DEVIATIONS** - Deviations documented and resolved  
☐ **FAILED** - Critical failures require resolution before PQ

---

## 6. Approval Signatures

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Executed By | _________________ | _________________ | ________ |
| Reviewed By | _________________ | _________________ | ________ |
| QA Approved | _________________ | _________________ | ________ |

---

**⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE**
