# Project Cortex: Lumen Intelligence System

## 🧠 THE VISION

**"Be the defacto go-to intelligence center outside of the actual FDA."**

Project Cortex is more than data harvesting - it's building a **cognitive regulatory intelligence system** that:

1. **Understands WHY** submissions fail (objective & subjective reasons across IND Pyramid & 510(k) dossier)
2. **Maps** failures to specific regulatory structure levels
3. **Remembers** each project and learns from outcomes
4. **Predicts** risks before they become costly delays
5. **Guides** users with proactive, context-aware suggestions

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COGNITIVE ADVISORY SERVICE                             │
│        (AI brain - project memory, risk analysis, suggestions)              │
│                                                                              │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│    │ Project Memory  │  │  Risk Analyzer  │  │ Suggestion      │           │
│    │ (per-project    │  │ (pattern match  │  │ Generator       │           │
│    │  learning)      │  │  to taxonomy)   │  │ (GPT-4 powered) │           │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGULATORY INTELLIGENCE ENGINE                            │
│         (Rejection patterns, IND Pyramid, 510(k) taxonomy)                  │
│                                                                              │
│    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐           │
│    │ IND Pyramid     │  │ 510(k) Dossier  │  │ Rejection       │           │
│    │ (5 levels)      │  │ (5 sections)    │  │ Patterns        │           │
│    │ - Foundation    │  │ - Predicate     │  │ - CRL causes    │           │
│    │ - Preclinical   │  │ - Performance   │  │ - RTF reasons   │           │
│    │ - CMC           │  │ - Clinical      │  │ - Hold reasons  │           │
│    │ - Clinical      │  │ - Labeling      │  │ - NSE patterns  │           │
│    │ - Admin         │  │ - Admin         │  │                 │           │
│    └─────────────────┘  └─────────────────┘  └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORTEX ORCHESTRATOR                                  │
│          (Master coordinator for all data farmer microservices)             │
│                                                                              │
│                 30-minute harvest cycles, health monitoring                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               │                    │                    │
               ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │   FDA Farmer    │  │  PubMed Farmer  │  │ CT.gov Farmer   │
    │   (OpenFDA)     │  │    (NCBI)       │  │ (ClinicalTrials)│
    │                 │  │                 │  │                 │
    │ • FAERS events  │  │ • Publications  │  │ • Active trials │
    │ • Drug labels   │  │ • Abstracts     │  │ • Sponsors      │
    │ • 510(k) data   │  │ • MeSH terms    │  │ • Conditions    │
    │ • PMA data      │  │ • Authors       │  │ • Endpoints     │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
               │                    │                    │
               └────────────────────┼────────────────────┘
                                    ▼
                      ┌─────────────────────────┐
                      │     LUMEN CORTEX        │
                      │   PostgreSQL Database    │
                      │                         │
                      │  • Data Atoms (1,500+)  │
                      │  • Knowledge Graph      │
                      │  • Rejection Patterns   │
                      │  • Project Memory       │
                      └─────────────────────────┘
```

---

## 📊 Current Status

### Intelligence Cortex Contents

| Type               | Count  | Description                    |
| ------------------ | ------ | ------------------------------ |
| Total Atoms        | 1,540+ | All structured knowledge units |
| Rejection Patterns | 23     | FDA CRL/RTF/Hold/NSE causes    |
| Proactive Guidance | 18     | IND/510(k) best practices      |
| Knowledge Edges    | 1,880+ | Entity relationships           |

### Active Farmers

| Farmer             | Status      | Data Types                      |
| ------------------ | ----------- | ------------------------------- |
| FDA OpenFDA        | ✅ Active   | FAERS, drug labels, 510(k), PMA |
| PubMed/NCBI        | ✅ Active   | Publications, MeSH terms        |
| ClinicalTrials.gov | ✅ Active   | Trials, sponsors, conditions    |
| Rejection Seeder   | ✅ Complete | Historical FDA patterns         |
| Guidance Seeder    | ✅ Complete | IND/510(k) prevention guidance  |

---

## 📁 File Structure

```
scripts/
├── farmers/
│   ├── fda-openfda-farmer.js         # FDA data harvester
│   ├── pubmed-farmer.js              # PubMed literature harvester
│   ├── regulatory-intelligence-engine.js  # Rejection pattern engine
│   └── rejection-pattern-seeder.js   # Historical pattern seeder
├── cortex-orchestrator.js            # Master coordinator
└── lumen-cortex-harvester.js         # ClinicalTrials.gov harvester

server/
├── routes/
│   └── cortexAdvisoryRoutes.ts       # API endpoints for advisory
└── services/
    ├── cognitiveAdvisoryService.ts   # Cognitive advisory brain
    ├── lumen-cortex-service.ts       # SEC harvesting, signals
    └── cortexPrimeService.ts         # Unified AI brain service
```

---

## 🎯 IND Pyramid Structure

The IND Pyramid maps all aspects of drug development from strategic to tactical:

```
                    ┌─────────────────┐
                    │  ADMINISTRATIVE │ Level 5 (10%)
                    │  Form 1571/1572 │
                    │  IB, Consent    │
                    ├─────────────────┤
                    │    CLINICAL     │ Level 4 (15%)
                    │ Protocol Design │
                    │ Endpoints, SAP  │
                ┌───┴─────────────────┴───┐
                │          CMC            │ Level 3 (20%)
                │  Drug Substance/Product │
                │  Specifications, Stab   │
            ┌───┴─────────────────────────┴───┐
            │        PRECLINICAL              │ Level 2 (25%)
            │   Toxicology, Safety Pharm      │
            │   PK/ADME, NOAEL, Margins       │
        ┌───┴─────────────────────────────────┴───┐
        │              FOUNDATION                  │ Level 1 (30%)
        │   Scientific Rationale, TPP, MOA         │
        │   Competitive Differentiation            │
        └─────────────────────────────────────────┘
```

### Common Failure Points by Level

| Level          | Weight | Top Rejection Reasons                                        |
| -------------- | ------ | ------------------------------------------------------------ |
| Foundation     | 30%    | Weak MOA, no TPP, poor differentiation                       |
| Preclinical    | 25%    | Insufficient tox duration, low margins, missing safety pharm |
| CMC            | 20%    | Unqualified impurities, insufficient stability               |
| Clinical       | 15%    | Non-meaningful endpoints, underpowered, no stopping rules    |
| Administrative | 10%    | Outdated IB, missing disclosures                             |

---

## 🏥 510(k) Dossier Structure

```
┌─────────────────────────────────────────────────────────┐
│               510(k) SUBSTANTIAL EQUIVALENCE             │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐    PREDICATE SELECTION (35%)      │
│  │ Most critical    │    • Same intended use             │
│  │ for SE decision  │    • Same tech characteristics     │
│  │                  │    • Not recalled/withdrawn        │
│  └──────────────────┘                                    │
│                                                          │
│  ┌──────────────────┐    PERFORMANCE TESTING (30%)      │
│  │ ISO/IEC standards│    • Biocompat (ISO 10993)         │
│  │ bench validation │    • Software (IEC 62304)          │
│  │                  │    • Electrical (IEC 60601)        │
│  └──────────────────┘                                    │
│                                                          │
│  ┌──────────────────┐    CLINICAL & HUMAN FACTORS (20%) │
│  │ May be required  │    • Clinical data (if needed)     │
│  │ for Class II+    │    • Human factors study           │
│  │                  │    • Risk analysis (ISO 14971)     │
│  └──────────────────┘                                    │
│                                                          │
│  ┌──────────────────┐    LABELING & IFU (15%)           │
│  │ Often overlooked │    • Required elements             │
│  │ easy fixes       │    • Clear instructions            │
│  │                  │    • Warnings/contraindications    │
│  └──────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 🔴 Rejection Pattern Categories

### IND Clinical Holds

| ID           | Pattern                                    | Severity |
| ------------ | ------------------------------------------ | -------- |
| FDA-HOLD-001 | Insufficient preclinical data for FIH dose | Critical |
| FDA-HOLD-002 | hERG/CV safety pharmacology incomplete     | Critical |
| FDA-HOLD-003 | Impurities not qualified (ICH Q3A)         | High     |
| FDA-HOLD-004 | Protocol safety monitoring inadequate      | High     |
| FDA-HOLD-005 | Toxicology duration insufficient (ICH M3)  | Critical |

### NDA/BLA Complete Response Letters

| ID          | Pattern                              | Severity |
| ----------- | ------------------------------------ | -------- |
| FDA-CRL-001 | Primary endpoint not met (p>0.05)    | Critical |
| FDA-CRL-002 | Single pivotal trial (need two)      | Critical |
| FDA-CRL-003 | Benefit-risk unfavorable (SAE rate)  | Critical |
| FDA-CRL-004 | Manufacturing GMP deficiencies (483) | Critical |
| FDA-CRL-005 | Clinical data integrity concerns     | Critical |
| FDA-CRL-006 | Labeling not supported by evidence   | High     |
| FDA-CRL-007 | Multiplicity not addressed           | High     |

### 510(k) Not Substantially Equivalent

| ID               | Pattern                                   | Severity |
| ---------------- | ----------------------------------------- | -------- |
| FDA-510K-NSE-001 | Different technology raises new questions | Critical |
| FDA-510K-NSE-002 | Intended use differs from predicate       | Critical |
| FDA-510K-NSE-003 | Biocompat/software testing incomplete     | High     |
| FDA-510K-NSE-004 | Predicate recalled or inappropriate       | Critical |
| FDA-510K-NSE-005 | Clinical data required                    | High     |

---

## 🚀 API Endpoints

### Cognitive Advisory

```
GET  /api/cortex/advisory/:projectId   # Full advisory analysis
GET  /api/cortex/pyramid/:submissionType  # Structure definitions
GET  /api/cortex/patterns              # Query rejection patterns
GET  /api/cortex/guidance              # Query proactive guidance
POST /api/cortex/assess                # Assess specific action
POST /api/cortex/memory                # Record project event
GET  /api/cortex/stats                 # Intelligence statistics
GET  /api/cortex/similar-learnings     # Similar project learnings
```

### Example Advisory Response

```json
{
  "context": {
    "id": "proj-123",
    "name": "Novel Kinase Inhibitor",
    "submissionType": "ind",
    "phase": "preclinical"
  },
  "readinessScore": 68,
  "currentRisks": [
    {
      "priority": "critical",
      "title": "GLP toxicology studies not completed",
      "pyramidLevel": "preclinical"
    }
  ],
  "proactiveSuggestions": [
    {
      "priority": "high",
      "title": "Complete hERG assay before IND",
      "actionItems": ["Conduct hERG patch clamp study", "Assess IC50 vs clinical Cmax"]
    }
  ],
  "nextSteps": [
    "Verify GLP toxicology studies meet duration requirements",
    "Consider requesting Type B Pre-IND meeting with FDA"
  ]
}
```

---

## 🎯 Future Roadmap

### Phase 2: Enhanced Intelligence

- [ ] SEC EDGAR 10-K farmer (regulatory signals from filings)
- [ ] EMA farmer (European regulatory data)
- [ ] WHO ICTRP farmer (international trials)
- [ ] Patent farmer (freedom-to-operate analysis)

### Phase 3: Predictive Analytics

- [ ] Submission success probability model
- [ ] Review timeline prediction
- [ ] Advisory committee outcome prediction
- [ ] Competitive landscape analysis

### Phase 4: Full Cognitive Platform

- [ ] Real-time project health dashboard
- [ ] Automated document analysis against pyramid
- [ ] Meeting preparation assistant
- [ ] Regulatory submission validation

---

## 📚 References

- FDA Guidance: IND Applications
- FDA Guidance: 510(k) Program
- ICH M3(R2): Nonclinical Safety Studies
- ICH E6(R2): Good Clinical Practice
- ICH Q3A/Q3B: Impurities in Drug Substances/Products
- ISO 10993: Biological Evaluation of Medical Devices
- IEC 62304: Medical Device Software Lifecycle
