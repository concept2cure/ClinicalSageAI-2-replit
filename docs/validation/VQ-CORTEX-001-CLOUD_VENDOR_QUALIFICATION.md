# Cloud Vendor Qualification Assessment
## Cortex Prime AI / Clinical Sage Platform

---

**Document ID:** VQ-CORTEX-001  
**Version:** 1.0.0-DRAFT  
**Classification:** GxP - Vendor Qualification  
**Status:** ⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE

---

## Document Control

| Version | Date | Author | Description | Approved By |
|---------|------|--------|-------------|-------------|
| 1.0.0-DRAFT | 2025-01-24 | Engineering | Initial assessment | PENDING |

**Regulatory References:**
- 21 CFR Part 11 (Electronic Records; Electronic Signatures)
- 21 CFR Part 820 (Quality System Regulation)
- ICH Q9 (Quality Risk Management)
- ISO 13485:2016 (Medical Devices QMS)
- HIPAA Security Rule (45 CFR 164.308-312)
- GDPR (EU 2016/679)
- FDA Guidance: Computer Software Assurance for Production and QMS Software

---

## 1. Executive Summary

### 1.1 Purpose

This document provides a comprehensive vendor qualification assessment for hosting the Clinical Sage / Cortex Prime AI platform on cloud infrastructure. The assessment evaluates AWS, Azure, and Google Cloud against FDA/GxP requirements.

### 1.2 Recommendation Summary

| Provider | Overall Score | Recommendation |
|----------|--------------|----------------|
| **AWS** | 92/100 | ✅ **RECOMMENDED** |
| Azure | 88/100 | ✅ Acceptable Alternative |
| Google Cloud | 78/100 | ⚠️ Additional Validation Required |

### 1.3 Decision Rationale

**AWS is recommended** based on:
- Most mature GxP compliance program
- Comprehensive validation documentation (IQ/OQ/PQ templates)
- Largest FDA customer base (proven track record)
- Best HIPAA BAA terms for healthcare workloads

---

## 2. Vendor Assessment Matrix

### 2.1 AWS (Amazon Web Services)

#### FDA Compliance Certifications

| Certification | Status | Evidence |
|--------------|--------|----------|
| SOC 1 Type II | ✅ Available | AWS Artifact |
| SOC 2 Type II | ✅ Available | AWS Artifact |
| SOC 3 | ✅ Available | AWS Artifact |
| ISO 27001 | ✅ Certified | Certificate #IS 619625 |
| ISO 27017 | ✅ Certified | Cloud security controls |
| ISO 27018 | ✅ Certified | PII protection |
| ISO 27701 | ✅ Certified | Privacy management |
| ISO 9001 | ✅ Certified | QMS |
| FedRAMP High | ✅ Authorized | Government workloads |
| HITRUST CSF | ✅ Certified | Healthcare framework |

#### 21 CFR Part 11 Compliance Support

| Requirement | AWS Service | Implementation |
|-------------|-------------|----------------|
| §11.10(a) Validation | AWS Artifact | IQ/OQ/PQ templates provided |
| §11.10(b) Record copies | S3, RDS snapshots | Immutable backups, versioning |
| §11.10(c) Record protection | KMS, encryption | AES-256, key rotation |
| §11.10(d) Access control | IAM, Organizations | Role-based, MFA enforced |
| §11.10(e) Audit trails | CloudTrail, CloudWatch | Immutable logs, S3 lock |
| §11.10(k) Documentation | AWS Artifact | GxP workbook available |
| §11.50 Signatures | Cognito, IAM | MFA, certificate auth |

#### Data Residency Options

| Region | Location | GDPR | FDA | Notes |
|--------|----------|------|-----|-------|
| us-east-1 | N. Virginia | N/A | ✅ | Primary FDA region |
| us-east-2 | Ohio | N/A | ✅ | DR region |
| us-west-2 | Oregon | N/A | ✅ | West coast option |
| eu-west-1 | Ireland | ✅ | ✅ | EU primary |
| eu-central-1 | Frankfurt | ✅ | ✅ | German data residency |
| eu-west-2 | London | UK GDPR | ✅ | Post-Brexit option |

**Data Residency Controls:**
- ✅ S3 Bucket policies enforce region
- ✅ VPC endpoints prevent cross-region
- ✅ AWS Control Tower for governance
- ✅ Service Control Policies (SCPs)

#### Infrastructure Audit Trail Capabilities

| Capability | Service | Retention | Immutability |
|------------|---------|-----------|--------------|
| API calls | CloudTrail | Configurable (7yr recommended) | S3 Object Lock |
| Database changes | RDS Audit | 7 days default | Custom export |
| Network traffic | VPC Flow Logs | Configurable | S3 export |
| Security events | GuardDuty | 90 days | EventBridge archive |
| Config changes | AWS Config | Configurable | S3 export |

#### HIPAA BAA

| Aspect | Details |
|--------|---------|
| BAA Available | ✅ Yes |
| Minimum Plan | Business Support ($100/mo minimum) |
| Covered Services | 150+ services (RDS, S3, EC2, Lambda, etc.) |
| Process | Self-service via AWS Artifact |
| Response Time | Immediate (click-through) |
| Liability | Shared responsibility model |

#### Validation Documentation (IQ/OQ/PQ)

| Document | Availability | Location |
|----------|--------------|----------|
| GxP Compliance Workbook | ✅ Free | AWS Artifact |
| IQ Templates | ✅ Free | AWS GxP Lens |
| OQ Templates | ✅ Free | AWS GxP Lens |
| PQ Guidelines | ✅ Free | AWS Well-Architected |
| Risk Assessment | ✅ Free | AWS GxP Lens |
| Architecture Patterns | ✅ Free | AWS Solutions Library |

**AWS GxP Services:**
- AWS Landing Zone for Life Sciences
- AWS GxP on AWS Well-Architected Lens
- AWS Healthcare Competency Partners

#### AWS Score: 92/100

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| FDA Compliance | 25% | 95 | 23.75 |
| Data Residency | 20% | 95 | 19.00 |
| Audit Trails | 20% | 90 | 18.00 |
| HIPAA BAA | 15% | 95 | 14.25 |
| Validation Docs | 20% | 90 | 18.00 |
| **TOTAL** | 100% | | **92/100** |

---

### 2.2 Microsoft Azure

#### FDA Compliance Certifications

| Certification | Status | Evidence |
|--------------|--------|----------|
| SOC 1 Type II | ✅ Available | Service Trust Portal |
| SOC 2 Type II | ✅ Available | Service Trust Portal |
| SOC 3 | ✅ Available | Service Trust Portal |
| ISO 27001 | ✅ Certified | Multiple certificates |
| ISO 27017 | ✅ Certified | Cloud security |
| ISO 27018 | ✅ Certified | PII protection |
| ISO 27701 | ✅ Certified | Privacy management |
| FedRAMP High | ✅ Authorized | Azure Government |
| HITRUST CSF | ✅ Certified | Healthcare |
| FDA 21 CFR Part 11 | ⚠️ Guidance | Not certified, guidance provided |

#### 21 CFR Part 11 Compliance Support

| Requirement | Azure Service | Implementation |
|-------------|---------------|----------------|
| §11.10(a) Validation | Azure Compliance | Guidance docs |
| §11.10(b) Record copies | Blob Storage, SQL | Soft delete, snapshots |
| §11.10(c) Record protection | Key Vault | Customer-managed keys |
| §11.10(d) Access control | Entra ID, RBAC | Conditional access |
| §11.10(e) Audit trails | Azure Monitor | Log Analytics |
| §11.10(k) Documentation | Service Trust Portal | Compliance docs |
| §11.50 Signatures | Entra ID | MFA, certificates |

#### Data Residency Options

| Region | Location | GDPR | FDA | Notes |
|--------|----------|------|-----|-------|
| East US | Virginia | N/A | ✅ | Primary |
| East US 2 | Virginia | N/A | ✅ | DR |
| West US 2 | Washington | N/A | ✅ | West coast |
| West Europe | Netherlands | ✅ | ✅ | EU primary |
| Germany West Central | Frankfurt | ✅ | ✅ | German data residency |
| UK South | London | UK GDPR | ✅ | UK option |

**Data Residency Controls:**
- ✅ Azure Policy for region enforcement
- ✅ Resource locks
- ✅ Management Groups
- ⚠️ Some services have limited region support

#### Infrastructure Audit Trail Capabilities

| Capability | Service | Retention | Immutability |
|------------|---------|-----------|--------------|
| API calls | Activity Log | 90 days default | Export to Storage |
| Database changes | SQL Audit | Configurable | Blob immutability |
| Network traffic | NSG Flow Logs | Configurable | Storage export |
| Security events | Defender | 90 days | Sentinel archive |
| Config changes | Azure Policy | Configurable | Export required |

#### HIPAA BAA

| Aspect | Details |
|--------|---------|
| BAA Available | ✅ Yes |
| Minimum Plan | No minimum (Standard support) |
| Covered Services | 100+ services |
| Process | Online Service Terms (automatic) |
| Response Time | Automatic with subscription |
| Liability | Shared responsibility |

#### Validation Documentation (IQ/OQ/PQ)

| Document | Availability | Location |
|----------|--------------|----------|
| 21 CFR Part 11 Guidance | ✅ Free | Microsoft Docs |
| IQ Templates | ⚠️ Consulting | Microsoft Consulting |
| OQ Templates | ⚠️ Consulting | Microsoft Consulting |
| PQ Guidelines | ⚠️ Partner | Life Sciences partners |
| Azure for Health | ✅ Free | Azure Industry solutions |

**Azure Healthcare Services:**
- Azure Health Data Services (FHIR)
- Azure API for DICOM
- Microsoft Cloud for Healthcare

#### Azure Score: 88/100

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| FDA Compliance | 25% | 90 | 22.50 |
| Data Residency | 20% | 90 | 18.00 |
| Audit Trails | 20% | 85 | 17.00 |
| HIPAA BAA | 15% | 95 | 14.25 |
| Validation Docs | 20% | 80 | 16.00 |
| **TOTAL** | 100% | | **88/100** |

---

### 2.3 Google Cloud Platform (GCP)

#### FDA Compliance Certifications

| Certification | Status | Evidence |
|--------------|--------|----------|
| SOC 1 Type II | ✅ Available | Compliance Reports Manager |
| SOC 2 Type II | ✅ Available | Compliance Reports Manager |
| SOC 3 | ✅ Available | Public report |
| ISO 27001 | ✅ Certified | Certificate available |
| ISO 27017 | ✅ Certified | Cloud security |
| ISO 27018 | ✅ Certified | PII protection |
| FedRAMP High | ✅ Authorized | Select services |
| HITRUST CSF | ⚠️ In progress | Not all services |
| FDA 21 CFR Part 11 | ⚠️ Limited | General guidance only |

#### 21 CFR Part 11 Compliance Support

| Requirement | GCP Service | Implementation |
|-------------|-------------|----------------|
| §11.10(a) Validation | Compliance Reports | Limited GxP guidance |
| §11.10(b) Record copies | Cloud Storage | Object versioning |
| §11.10(c) Record protection | Cloud KMS | Customer-managed keys |
| §11.10(d) Access control | Cloud IAM | Granular permissions |
| §11.10(e) Audit trails | Cloud Audit Logs | 400 days default |
| §11.10(k) Documentation | Compliance Center | Generic compliance |
| §11.50 Signatures | Cloud Identity | MFA available |

#### Data Residency Options

| Region | Location | GDPR | FDA | Notes |
|--------|----------|------|-----|-------|
| us-east4 | N. Virginia | N/A | ✅ | Primary |
| us-central1 | Iowa | N/A | ✅ | Central option |
| us-west1 | Oregon | N/A | ✅ | West coast |
| europe-west1 | Belgium | ✅ | ✅ | EU primary |
| europe-west3 | Frankfurt | ✅ | ✅ | German option |
| europe-west2 | London | UK GDPR | ✅ | UK option |

**Data Residency Controls:**
- ✅ Organization policies
- ✅ Resource location constraints
- ⚠️ Fewer region options than AWS/Azure

#### Infrastructure Audit Trail Capabilities

| Capability | Service | Retention | Immutability |
|------------|---------|-----------|--------------|
| API calls | Cloud Audit Logs | 400 days | Export to bucket |
| Database changes | Cloud SQL Audit | Configurable | Export required |
| Network traffic | VPC Flow Logs | 30 days default | Export to bucket |
| Security events | Security Command | Configurable | Export required |
| Config changes | Cloud Asset | Configurable | BigQuery export |

#### HIPAA BAA

| Aspect | Details |
|--------|---------|
| BAA Available | ✅ Yes |
| Minimum Plan | No minimum |
| Covered Services | 70+ services |
| Process | Cloud Console acceptance |
| Response Time | Self-service |
| Liability | Shared responsibility |

#### Validation Documentation (IQ/OQ/PQ)

| Document | Availability | Location |
|----------|--------------|----------|
| GxP Guidance | ⚠️ Limited | Google Cloud Docs |
| IQ Templates | ❌ Not provided | Custom required |
| OQ Templates | ❌ Not provided | Custom required |
| PQ Guidelines | ❌ Not provided | Custom required |
| Healthcare API | ✅ Available | Cloud Healthcare API |

**GCP Healthcare Services:**
- Cloud Healthcare API (FHIR, HL7v2, DICOM)
- Healthcare Natural Language API
- Vertex AI for healthcare

#### GCP Score: 78/100

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| FDA Compliance | 25% | 75 | 18.75 |
| Data Residency | 20% | 80 | 16.00 |
| Audit Trails | 20% | 80 | 16.00 |
| HIPAA BAA | 15% | 85 | 12.75 |
| Validation Docs | 20% | 70 | 14.00 |
| **TOTAL** | 100% | | **78/100** |

---

## 3. Architecture Decision: Cloud vs. On-Premise

### 3.1 Decision Framework

| Factor | Cloud Provider | On-Premise |
|--------|---------------|------------|
| **Validation Burden** | Lower - vendor provides IQ | Higher - full custom validation |
| **Initial Cost** | Lower (OpEx) | Higher (CapEx) |
| **Compliance Cost** | Included in service | Custom build required |
| **Time to Deploy** | Weeks | Months |
| **IT Resources Required** | Minimal | Significant |
| **Scalability** | Automatic | Manual planning |
| **Disaster Recovery** | Built-in options | Custom build |
| **Physical Security** | Vendor managed | Customer managed |

### 3.2 Business Constraints Analysis

| Constraint | Cloud Advantage | On-Premise Advantage |
|------------|-----------------|---------------------|
| FDA CSV | Pre-validated infrastructure | Full control |
| Budget ($X/year) | Predictable monthly cost | Lower long-term cost |
| Timeline (X months) | Fast deployment | N/A |
| Limited IT | Managed services | N/A |
| Data Sensitivity | SOC 2/HIPAA certified | Air-gapped option |

### 3.3 Recommendation: Cloud (AWS)

**For Clinical Sage / Cortex Prime, cloud hosting is recommended because:**

1. **Validation Burden:** AWS provides IQ/OQ/PQ templates, reducing validation effort by ~60%
2. **Compliance Costs:** Built-in audit trails, encryption, and access controls
3. **Non-Technical Team:** Managed services reduce operational overhead
4. **FDA Track Record:** AWS has 1000+ FDA-regulated customers

**Cost Comparison (Estimated Annual):**

| Category | AWS Cloud | On-Premise |
|----------|-----------|------------|
| Infrastructure | $36,000 | $150,000 (initial) |
| Validation | $15,000 | $75,000 |
| Security/Compliance | Included | $50,000 |
| IT Staff | 0.25 FTE ($30,000) | 2 FTE ($200,000) |
| DR/Backup | $6,000 | $30,000 |
| **Year 1 Total** | **$87,000** | **$505,000** |
| **Year 2+ Total** | **$57,000** | **$280,000** |

---

## 4. ISO 14971 Risk Analysis: Cloud Infrastructure

### 4.1 Hazard Identification

| HAZ-ID | Hazard | Hazardous Situation | Harm |
|--------|--------|---------------------|------|
| INF-001 | Cloud provider outage | Platform unavailable during submission deadline | Missed regulatory deadline |
| INF-002 | Data breach at provider | Unauthorized access to regulatory data | Competitive harm, legal liability |
| INF-003 | Region failure | Data loss in single region | Loss of regulatory records |
| INF-004 | API changes | Provider changes break integrations | System downtime |
| INF-005 | Vendor lock-in | Unable to migrate data | Business continuity risk |
| INF-006 | Compliance gap | Provider loses certification | Regulatory non-compliance |
| INF-007 | Cost escalation | Unexpected pricing changes | Budget impact |
| INF-008 | Data residency violation | Data moved outside approved region | GDPR/regulatory violation |

### 4.2 Risk Scoring Matrix

**Severity Scale:**
| Level | Description | Examples |
|-------|-------------|----------|
| S5 | Catastrophic | FDA warning letter, patient harm |
| S4 | Critical | Missed regulatory deadline, data breach |
| S3 | Serious | Significant delay, compliance finding |
| S2 | Minor | Temporary inconvenience |
| S1 | Negligible | No regulatory impact |

**Probability Scale:**
| Level | Description | Frequency |
|-------|-------------|-----------|
| P5 | Frequent | >1/month |
| P4 | Probable | 1/year |
| P3 | Occasional | 1/5 years |
| P2 | Remote | 1/10 years |
| P1 | Improbable | <1/10 years |

### 4.3 Risk Assessment

| HAZ-ID | Hazard | S | P | Initial Risk | Controls | Residual S | Residual P | Final Risk |
|--------|--------|---|---|--------------|----------|------------|------------|------------|
| INF-001 | Provider outage | S4 | P3 | **12 - HIGH** | Multi-AZ, DR plan | S3 | P2 | 6 - MEDIUM |
| INF-002 | Data breach | S5 | P2 | **10 - HIGH** | Encryption, IAM, monitoring | S4 | P1 | 4 - LOW |
| INF-003 | Region failure | S4 | P2 | 8 - MEDIUM | Multi-region backup | S2 | P2 | 4 - LOW |
| INF-004 | API changes | S3 | P3 | 9 - MEDIUM | Version pinning, monitoring | S2 | P3 | 6 - MEDIUM |
| INF-005 | Vendor lock-in | S3 | P3 | 9 - MEDIUM | Cloud-agnostic design | S2 | P2 | 4 - LOW |
| INF-006 | Compliance gap | S5 | P1 | 5 - LOW | Vendor monitoring, alerts | S4 | P1 | 4 - LOW |
| INF-007 | Cost escalation | S2 | P3 | 6 - MEDIUM | Reserved instances, budgets | S1 | P2 | 2 - LOW |
| INF-008 | Data residency | S4 | P2 | 8 - MEDIUM | SCPs, policy enforcement | S3 | P1 | 3 - LOW |

### 4.4 Risk Control Measures

#### INF-001: Provider Outage

**Design Controls:**
- Multi-AZ deployment (99.99% SLA)
- Database replication across availability zones
- Auto-scaling for compute resources

**Protective Controls:**
- Automated failover configuration
- Health monitoring with PagerDuty/OpsGenie
- Disaster recovery plan with RTO < 4 hours

**Information Controls:**
- Status page monitoring (statuspage.io)
- User notification for planned maintenance
- SLA documentation for audit

#### INF-002: Data Breach

**Design Controls:**
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Customer-managed keys in KMS

**Protective Controls:**
- GuardDuty threat detection
- Security Hub continuous monitoring
- WAF on all public endpoints

**Information Controls:**
- Incident response playbook
- Breach notification procedures
- Regular penetration testing

#### INF-003: Region Failure

**Design Controls:**
- Cross-region S3 replication
- Database read replicas in DR region
- Infrastructure as Code for fast rebuild

**Protective Controls:**
- Daily backup verification
- Quarterly DR testing
- Runbook documentation

**Information Controls:**
- RPO/RTO documentation
- DR test reports
- Backup audit logs

### 4.5 Residual Risk Summary

| Risk Level | Count | Acceptable |
|------------|-------|------------|
| HIGH | 0 | ✅ |
| MEDIUM | 2 | ✅ (ALARP) |
| LOW | 6 | ✅ |

**Conclusion:** All infrastructure risks have been reduced to ALARP or Acceptable levels.

---

## 5. Vendor Qualification Checklist

### 5.1 Pre-Qualification

| Item | AWS | Azure | GCP |
|------|-----|-------|-----|
| Vendor assessment form completed | ☐ | ☐ | ☐ |
| Compliance certifications verified | ☐ | ☐ | ☐ |
| BAA executed | ☐ | ☐ | ☐ |
| Data processing agreement signed | ☐ | ☐ | ☐ |
| Security questionnaire completed | ☐ | ☐ | ☐ |

### 5.2 Technical Qualification

| Item | AWS | Azure | GCP |
|------|-----|-------|-----|
| IQ documentation reviewed | ☐ | ☐ | ☐ |
| OQ test procedures approved | ☐ | ☐ | ☐ |
| PQ acceptance criteria defined | ☐ | ☐ | ☐ |
| Audit trail configuration verified | ☐ | ☐ | ☐ |
| Encryption configuration verified | ☐ | ☐ | ☐ |

### 5.3 Ongoing Qualification

| Item | Frequency |
|------|-----------|
| SOC 2 report review | Annual |
| Compliance certification renewal | Annual |
| Security assessment | Annual |
| DR test | Quarterly |
| Access review | Quarterly |

---

## 6. Recommended AWS Architecture

### 6.1 GxP Reference Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS GxP Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│  │   Route 53     │    │   CloudFront   │    │    WAF         │            │
│  │   (DNS)        │───▶│   (CDN)        │───▶│   (Firewall)   │            │
│  └────────────────┘    └────────────────┘    └────────────────┘            │
│                                                      │                       │
│                        ┌─────────────────────────────▼───────────────────┐  │
│                        │              VPC (us-east-1)                     │  │
│                        │  ┌─────────────────┐  ┌─────────────────┐       │  │
│                        │  │  Public Subnet  │  │  Public Subnet  │       │  │
│                        │  │  (us-east-1a)   │  │  (us-east-1b)   │       │  │
│                        │  │  ┌───────────┐  │  │  ┌───────────┐  │       │  │
│                        │  │  │    ALB    │  │  │  │    ALB    │  │       │  │
│                        │  │  └─────┬─────┘  │  │  └─────┬─────┘  │       │  │
│                        │  └────────┼────────┘  └────────┼────────┘       │  │
│                        │           │                    │                 │  │
│                        │  ┌────────▼────────┐  ┌────────▼────────┐       │  │
│                        │  │ Private Subnet  │  │ Private Subnet  │       │  │
│                        │  │  (us-east-1a)   │  │  (us-east-1b)   │       │  │
│                        │  │  ┌───────────┐  │  │  ┌───────────┐  │       │  │
│                        │  │  │    ECS    │  │  │  │    ECS    │  │       │  │
│                        │  │  │  Fargate  │  │  │  │  Fargate  │  │       │  │
│                        │  │  └─────┬─────┘  │  │  └─────┬─────┘  │       │  │
│                        │  └────────┼────────┘  └────────┼────────┘       │  │
│                        │           │                    │                 │  │
│                        │  ┌────────▼────────────────────▼────────┐       │  │
│                        │  │         Data Subnet                   │       │  │
│                        │  │  ┌─────────────┐  ┌─────────────┐    │       │  │
│                        │  │  │    RDS      │  │  ElastiCache │    │       │  │
│                        │  │  │  PostgreSQL │  │    Redis     │    │       │  │
│                        │  │  │  Multi-AZ   │  │   Cluster    │    │       │  │
│                        │  │  └─────────────┘  └─────────────┘    │       │  │
│                        │  └───────────────────────────────────────┘       │  │
│                        └─────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│  │   CloudTrail   │    │   CloudWatch   │    │  GuardDuty     │            │
│  │   (Audit)      │    │   (Logs)       │    │  (Security)    │            │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘            │
│          │                     │                     │                      │
│          └─────────────────────┼─────────────────────┘                      │
│                                ▼                                             │
│                    ┌────────────────────────┐                               │
│                    │     S3 (Audit Logs)    │                               │
│                    │     Object Lock        │                               │
│                    │     (Immutable)        │                               │
│                    └────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Key Services Configuration

| Service | Configuration | 21 CFR Part 11 Mapping |
|---------|---------------|----------------------|
| RDS PostgreSQL | Multi-AZ, encryption, automated backups | §11.10(b), (c) |
| S3 | Versioning, Object Lock, encryption | §11.10(b), (c) |
| CloudTrail | Multi-region, S3 immutable storage | §11.10(e) |
| IAM | MFA required, least privilege | §11.10(d) |
| KMS | Customer-managed keys, rotation | §11.10(c) |
| Cognito | MFA, password policies | §11.100 |

---

## 7. Approval Signatures

| Role | Name | Signature | Date |
|------|------|-----------|------|
| IT Director | _________________ | _________________ | ________ |
| QA Manager | _________________ | _________________ | ________ |
| Regulatory Affairs | _________________ | _________________ | ________ |
| CISO/Security | _________________ | _________________ | ________ |
| Executive Sponsor | _________________ | _________________ | ________ |

---

**⚠️ DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE**

*This vendor qualification assessment is generated as a draft template. All evaluations must be validated against current vendor offerings and approved by qualified personnel.*
