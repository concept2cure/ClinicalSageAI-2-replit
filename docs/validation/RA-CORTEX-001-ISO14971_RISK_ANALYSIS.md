# Risk Analysis per ISO 14971:2019
## Cortex Prime AI System

---

**Document ID:** RA-CORTEX-001  
**Version:** 1.0.0-DRAFT  
**Classification:** GxP Critical  
**Status:** ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE

---

## Document Control

| Version | Date | Author | Description | Approved By |
|---------|------|--------|-------------|-------------|
| 1.0.0-DRAFT | 2025-01-24 | Engineering | Initial draft | PENDING |

**Regulatory Standards:**
- ISO 14971:2019 - Medical Devices - Application of Risk Management
- IEC 62304 - Medical Device Software Lifecycle Processes
- FDA Guidance on Medical Device Cybersecurity
- 21 CFR Part 820 - Quality System Regulation

---

## 1. Scope and Context

### 1.1 System Description

The Cortex Prime AI System is a software platform that:
- Provides AI-assisted analysis of regulatory submissions
- Extracts and analyzes regulatory signals
- Predicts regulatory outcomes
- Supports decision-making for clinical trial submissions

### 1.2 Intended Use

- **Users:** Regulatory affairs professionals, clinical operations teams
- **Environment:** Enterprise cloud-hosted platform
- **Function:** Decision support for regulatory submission strategy

### 1.3 Risk Management Framework

```
┌─────────────────────────────────────────────────────────────────┐
│                     ISO 14971 RISK PROCESS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ IDENTIFY │──▶│ ANALYZE  │──▶│ EVALUATE │──▶│ CONTROL  │    │
│  │  Hazards │   │   Risk   │   │   Risk   │   │   Risk   │    │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘    │
│        │                                              │         │
│        │           ┌──────────┐                       │         │
│        └───────────│ MONITOR  │◀──────────────────────┘         │
│                    │Residual  │                                 │
│                    └──────────┘                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Risk Acceptability Criteria

### 2.1 Severity Classification

| Level | Category | Definition | Score |
|-------|----------|------------|-------|
| S1 | Negligible | Minor inconvenience, no impact on submission | 1 |
| S2 | Minor | Delays to submission, recoverable | 2 |
| S3 | Serious | Significant submission delays, reputational damage | 3 |
| S4 | Critical | Regulatory rejection due to system failure | 4 |
| S5 | Catastrophic | Patient safety impact through delayed treatment access | 5 |

### 2.2 Probability Classification

| Level | Category | Definition | Score |
|-------|----------|------------|-------|
| P1 | Improbable | <1 occurrence per 10 years | 1 |
| P2 | Remote | 1-10 occurrences per 10 years | 2 |
| P3 | Occasional | 1-10 occurrences per year | 3 |
| P4 | Probable | 1-10 occurrences per month | 4 |
| P5 | Frequent | >10 occurrences per month | 5 |

### 2.3 Risk Matrix

| Probability | S1 | S2 | S3 | S4 | S5 |
|-------------|:--:|:--:|:--:|:--:|:--:|
| P5 | 5 | 10 | 15 | 20 | **25** |
| P4 | 4 | 8 | 12 | **16** | **20** |
| P3 | 3 | 6 | 9 | **12** | **15** |
| P2 | 2 | 4 | 6 | 8 | **10** |
| P1 | 1 | 2 | 3 | 4 | 5 |

### 2.4 Risk Acceptability

| Risk Score | Category | Action Required |
|------------|----------|-----------------|
| 1-4 | **Acceptable** | Monitor, no action required |
| 5-8 | **ALARP** | Reduce if practicable |
| 9-12 | **Undesirable** | Risk controls required |
| 13-25 | **Unacceptable** | Risk controls mandatory, senior approval |

---

## 3. Hazard Identification

### 3.1 Data Integrity Hazards

| ID | Hazard | Potential Harm | Cause |
|----|--------|---------------|-------|
| H-DI-001 | Data corruption in atoms | Incorrect regulatory analysis | Database failure, software bug |
| H-DI-002 | Audit trail tampering | Compliance violation, FDA warning | Unauthorized access, insider threat |
| H-DI-003 | Hash chain compromise | Loss of data integrity verification | Software vulnerability |
| H-DI-004 | Cross-tenant data leakage | Competitor access to submissions | RLS failure, misconfiguration |
| H-DI-005 | Embedding corruption | Wrong search results | Index corruption, model error |
| H-DI-006 | Loss of electronic signatures | Invalid regulatory records | Database failure |

### 3.2 Unauthorized Access Hazards

| ID | Hazard | Potential Harm | Cause |
|----|--------|---------------|-------|
| H-UA-001 | Credential compromise | Unauthorized system access | Phishing, weak passwords |
| H-UA-002 | Session hijacking | Impersonation of authorized users | Network attack |
| H-UA-003 | Privilege escalation | Unauthorized data modification | Software vulnerability |
| H-UA-004 | API key exposure | Programmatic unauthorized access | Code leak, misconfiguration |
| H-UA-005 | Insider threat | Intentional data theft/modification | Malicious employee |

### 3.3 System Downtime Hazards

| ID | Hazard | Potential Harm | Cause |
|----|--------|---------------|-------|
| H-SD-001 | Database unavailability | Unable to access submissions | Hardware failure, attack |
| H-SD-002 | Network outage | System inaccessible | Infrastructure failure |
| H-SD-003 | Application crash | Work disruption | Software bug, memory leak |
| H-SD-004 | Backup failure | Data loss during recovery | Backup system failure |
| H-SD-005 | Deadline-critical downtime | Missed regulatory deadline | Any availability failure |

### 3.4 AI/ML Specific Hazards

| ID | Hazard | Potential Harm | Cause |
|----|--------|---------------|-------|
| H-AI-001 | False negative prediction | Undetected submission risk | Model bias, training gap |
| H-AI-002 | False positive prediction | Unnecessary submission changes | Model overfit |
| H-AI-003 | Model drift | Degraded prediction accuracy | Data distribution shift |
| H-AI-004 | Adversarial input | Manipulated predictions | Intentional attack |
| H-AI-005 | Hallucination in output | Incorrect regulatory guidance | LLM limitation |
| H-AI-006 | Bias in regulatory patterns | Unfair treatment of submission types | Training data bias |

### 3.5 Regulatory Data Misinterpretation Hazards

| ID | Hazard | Potential Harm | Cause |
|----|--------|---------------|-------|
| H-RM-001 | Incorrect signal extraction | Missed critical issues | NLP error, ambiguous text |
| H-RM-002 | Misclassified severity | Inappropriate response | Model error |
| H-RM-003 | Outdated regulatory knowledge | Non-compliant guidance | Knowledge not updated |
| H-RM-004 | Wrong jurisdiction mapping | Incorrect agency requirements | Configuration error |
| H-RM-005 | Causal inference error | Wrong root cause identified | Insufficient data |

---

## 4. Risk Analysis and Evaluation

### 4.1 Data Integrity Risks

| ID | Hazard | S | P | Initial Risk | Risk Score |
|----|--------|---|---|--------------|------------|
| H-DI-001 | Data corruption in atoms | S4 | P2 | Critical × Remote | 8 (ALARP) |
| H-DI-002 | Audit trail tampering | S5 | P1 | Catastrophic × Improbable | 5 (ALARP) |
| H-DI-003 | Hash chain compromise | S4 | P1 | Critical × Improbable | 4 (Acceptable) |
| H-DI-004 | Cross-tenant data leakage | S5 | P2 | Catastrophic × Remote | **10 (Undesirable)** |
| H-DI-005 | Embedding corruption | S3 | P2 | Serious × Remote | 6 (ALARP) |
| H-DI-006 | Loss of electronic signatures | S4 | P1 | Critical × Improbable | 4 (Acceptable) |

### 4.2 Unauthorized Access Risks

| ID | Hazard | S | P | Initial Risk | Risk Score |
|----|--------|---|---|--------------|------------|
| H-UA-001 | Credential compromise | S4 | P3 | Critical × Occasional | **12 (Undesirable)** |
| H-UA-002 | Session hijacking | S4 | P2 | Critical × Remote | 8 (ALARP) |
| H-UA-003 | Privilege escalation | S4 | P2 | Critical × Remote | 8 (ALARP) |
| H-UA-004 | API key exposure | S4 | P2 | Critical × Remote | 8 (ALARP) |
| H-UA-005 | Insider threat | S5 | P2 | Catastrophic × Remote | **10 (Undesirable)** |

### 4.3 System Downtime Risks

| ID | Hazard | S | P | Initial Risk | Risk Score |
|----|--------|---|---|--------------|------------|
| H-SD-001 | Database unavailability | S3 | P2 | Serious × Remote | 6 (ALARP) |
| H-SD-002 | Network outage | S2 | P2 | Minor × Remote | 4 (Acceptable) |
| H-SD-003 | Application crash | S2 | P3 | Minor × Occasional | 6 (ALARP) |
| H-SD-004 | Backup failure | S4 | P2 | Critical × Remote | 8 (ALARP) |
| H-SD-005 | Deadline-critical downtime | S5 | P2 | Catastrophic × Remote | **10 (Undesirable)** |

### 4.4 AI/ML Specific Risks

| ID | Hazard | S | P | Initial Risk | Risk Score |
|----|--------|---|---|--------------|------------|
| H-AI-001 | False negative prediction | S4 | P3 | Critical × Occasional | **12 (Undesirable)** |
| H-AI-002 | False positive prediction | S2 | P3 | Minor × Occasional | 6 (ALARP) |
| H-AI-003 | Model drift | S3 | P3 | Serious × Occasional | **9 (Undesirable)** |
| H-AI-004 | Adversarial input | S3 | P1 | Serious × Improbable | 3 (Acceptable) |
| H-AI-005 | Hallucination in output | S3 | P4 | Serious × Probable | **12 (Undesirable)** |
| H-AI-006 | Bias in regulatory patterns | S3 | P2 | Serious × Remote | 6 (ALARP) |

### 4.5 Regulatory Data Misinterpretation Risks

| ID | Hazard | S | P | Initial Risk | Risk Score |
|----|--------|---|---|--------------|------------|
| H-RM-001 | Incorrect signal extraction | S3 | P3 | Serious × Occasional | **9 (Undesirable)** |
| H-RM-002 | Misclassified severity | S3 | P2 | Serious × Remote | 6 (ALARP) |
| H-RM-003 | Outdated regulatory knowledge | S3 | P3 | Serious × Occasional | **9 (Undesirable)** |
| H-RM-004 | Wrong jurisdiction mapping | S3 | P2 | Serious × Remote | 6 (ALARP) |
| H-RM-005 | Causal inference error | S3 | P3 | Serious × Occasional | **9 (Undesirable)** |

---

## 5. Risk Control Measures

### 5.1 Design Controls

| Risk ID | Control | Type | Implementation |
|---------|---------|------|----------------|
| H-DI-001 | Database transaction integrity | Design | ACID transactions, WAL |
| H-DI-002 | Immutable audit trail triggers | Design | PostgreSQL triggers prevent UPDATE/DELETE |
| H-DI-003 | Cryptographic hash chain | Design | SHA-256 chain verification |
| H-DI-004 | Row-Level Security | Design | PostgreSQL RLS on all tables |
| H-UA-001 | Multi-factor authentication | Design | MFA required for all users |
| H-UA-003 | Principle of least privilege | Design | Role-based access controls |
| H-AI-001 | Confidence thresholds | Design | Minimum confidence required |
| H-AI-005 | Structured output validation | Design | Output schema validation |

### 5.2 Protective Controls

| Risk ID | Control | Type | Implementation |
|---------|---------|------|----------------|
| H-DI-004 | Access logging and monitoring | Protective | All queries logged, anomaly detection |
| H-UA-002 | Session management | Protective | Short timeouts, secure cookies |
| H-UA-004 | Secret rotation | Protective | Automatic API key rotation |
| H-SD-001 | High availability deployment | Protective | Multi-zone database replication |
| H-SD-004 | Automated backup verification | Protective | Daily backup restore tests |
| H-SD-005 | Redundant systems | Protective | Active-passive failover |
| H-AI-003 | Drift detection monitoring | Protective | Continuous model monitoring |

### 5.3 Information Controls

| Risk ID | Control | Type | Implementation |
|---------|---------|------|----------------|
| H-AI-001 | Uncertainty quantification | Information | Confidence scores shown to users |
| H-AI-005 | AI output labeling | Information | "AI-generated, requires human review" |
| H-RM-001 | Human review requirement | Information | "Decision support only" labeling |
| H-RM-003 | Knowledge currency indicators | Information | Last update timestamp displayed |
| ALL | User training | Information | Mandatory training on system limitations |

---

## 6. Residual Risk Assessment

### 6.1 Post-Control Risk Evaluation

| ID | Initial Score | Controls Applied | Residual S | Residual P | Residual Score |
|----|--------------|------------------|------------|------------|----------------|
| H-DI-001 | 8 | ACID, backup | S4 | P1 | 4 ✓ |
| H-DI-002 | 5 | Immutable triggers | S5 | P1 | 5 ✓ |
| H-DI-004 | **10** | RLS, monitoring | S5 | P1 | 5 ✓ |
| H-UA-001 | **12** | MFA, training | S4 | P1 | 4 ✓ |
| H-UA-005 | **10** | Audit, access controls | S5 | P1 | 5 ✓ |
| H-SD-005 | **10** | HA, failover | S4 | P1 | 4 ✓ |
| H-AI-001 | **12** | Confidence, human review | S3 | P2 | 6 ✓ |
| H-AI-003 | **9** | Drift detection | S3 | P2 | 6 ✓ |
| H-AI-005 | **12** | Output validation, labeling | S2 | P3 | 6 ✓ |
| H-RM-001 | **9** | Validation, human review | S2 | P2 | 4 ✓ |
| H-RM-003 | **9** | Currency indicators | S2 | P2 | 4 ✓ |
| H-RM-005 | **9** | Uncertainty display | S2 | P2 | 4 ✓ |

### 6.2 Residual Risk Summary

| Category | Unacceptable | Undesirable | ALARP | Acceptable |
|----------|-------------|-------------|-------|------------|
| Data Integrity | 0 | 0 | 2 | 4 |
| Unauthorized Access | 0 | 0 | 3 | 2 |
| System Downtime | 0 | 0 | 2 | 3 |
| AI/ML | 0 | 0 | 4 | 2 |
| Data Misinterpretation | 0 | 0 | 2 | 3 |
| **TOTAL** | **0** | **0** | **13** | **14** |

---

## 7. Clinical Evaluation Impact

### 7.1 Impact on Clinical Decision-Making

The Cortex Prime system is classified as **Decision Support Software**:

- **Does NOT** directly diagnose, treat, or monitor patients
- **Does** support regulatory submission decisions that affect drug/device availability
- **Indirect patient impact** through delayed or rejected submissions

### 7.2 Risk-Benefit Analysis

| Factor | Assessment |
|--------|------------|
| **Benefit** | Faster, more accurate regulatory submissions |
| **Benefit** | Earlier detection of submission risks |
| **Benefit** | Reduced regulatory delays |
| **Risk** | Potential for incorrect guidance if not properly used |
| **Risk** | Over-reliance on AI predictions |

### 7.3 Clinical Impact Mitigation

1. **Human-in-the-loop requirement:** All AI outputs require human review
2. **Decision support labeling:** Clear indication that system provides recommendations only
3. **Regulatory expert oversight:** Qualified personnel must approve final decisions
4. **Training requirements:** Users must complete training on system limitations

---

## 8. Risk if System Fails During Regulatory Submission

### 8.1 Failure Scenarios

| Scenario | Impact | Mitigation |
|----------|--------|------------|
| **Complete system failure** | Cannot access historical data or predictions | Offline backup access, manual procedures |
| **Incorrect prediction** | Submit with undiscovered issues | Human review mandatory, validation data |
| **Data corruption** | Invalid regulatory records | Audit trail, hash verification |
| **Missed deadline** | Regulatory penalty, market delay | Redundancy, monitoring |

### 8.2 Contingency Procedures

1. **Backup access procedures:** Documented manual processes
2. **Escalation path:** 24/7 support for critical submissions
3. **Regulatory notification:** Process for informing agencies of system issues
4. **Data recovery:** Tested restore procedures with RTO < 4 hours

---

## 9. Ongoing Risk Monitoring

### 9.1 Monitoring Requirements

| Activity | Frequency | Responsible |
|----------|-----------|-------------|
| Security vulnerability scan | Weekly | Cybersecurity |
| Audit trail integrity check | Daily | IT Operations |
| Model performance review | Monthly | Data Science |
| Incident review | Per occurrence | QA |
| Risk assessment review | Annual | Risk Management |

### 9.2 Risk Indicators

| Indicator | Threshold | Action |
|-----------|-----------|--------|
| Failed login attempts | >10/hour | Account lockout, investigate |
| Audit chain breaks | Any | Immediate investigation |
| Model accuracy decline | >5% | Retrain model |
| System availability | <99.9% | Incident review |

---

## 10. Approval Signatures

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Risk Manager | _________________ | _________________ | ________ |
| QA Manager | _________________ | _________________ | ________ |
| Technical Lead | _________________ | _________________ | ________ |
| Management | _________________ | _________________ | ________ |

---

**⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE**

*This risk analysis is generated as a draft template and must be reviewed and approved by qualified personnel before use in a regulated environment.*
