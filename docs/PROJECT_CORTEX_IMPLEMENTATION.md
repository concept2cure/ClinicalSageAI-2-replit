# Project Cortex: Automated Data Harvester Implementation

## Vision Summary (from Project Cortex Design Document)

The Concept2Cure platform requires a **robust, automated data harvester** that:

1. Continuously ingests files from various sources
2. Processes them into structured data ("data atoms")
3. Updates the internal knowledge base (the "Intelligence Cortex")

### Architecture: Fleet of "Data Farmers"

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROJECT CORTEX ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     SOURCE HARVESTER SERVICES                          │ │
│  │  (Independent microservices for each data source)                      │ │
│  ├────────────────────────────────────────────────────────────────────────┤ │
│  │                                                                         │ │
│  │  🏥 ClinicalTrials.gov    🍁 Health Canada      🇪🇺 EU CTR/EudraCT     │ │
│  │  📊 FDA (FAERS, Orange)   📈 SEC EDGAR (10-K)  🔬 PubMed/NIH          │ │
│  │  🏛️ EMA (EPAR, PSUR)      🧬 USPTO Patents     📚 ICH Guidelines       │ │
│  │  📋 WHO ICTRP             💊 DrugBank          🔍 OpenFDA              │ │
│  │                                                                         │ │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 │                                            │
│                                 ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      MESSAGE QUEUE / STAGING                           │ │
│  │  (Decoupled async processing - files parked here for extraction)       │ │
│  │                                                                         │ │
│  │  • Raw file storage (temporary)                                         │ │
│  │  • Job queue for processing                                             │ │
│  │  • Progress tracking & checkpoints                                      │ │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 │                                            │
│                                 ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                  PROCESSING & SCRUBBING SERVICE                        │ │
│  │  (Extract atomic data, clean, normalize, validate)                     │ │
│  │                                                                         │ │
│  │  • PDF/XML/JSON parsers                                                 │ │
│  │  • NLP entity extraction (Claude AI integration)                        │ │
│  │  • Schema mapping & normalization                                       │ │
│  │  • Data quality validation                                              │ │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 │                                            │
│                                 ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                     DATA LOADING SERVICE                               │ │
│  │  (Insert clean data into platform data model)                          │ │
│  │                                                                         │ │
│  │  Tables: lumen_data_atoms, rag_knowledge_graph, regulatory_atoms       │ │
│  └──────────────────────────────┬─────────────────────────────────────────┘ │
│                                 │                                            │
│                                 ▼                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                 INTELLIGENCE CORTEX UPDATE                             │ │
│  │  (Index, link, embed for AI/semantic search)                           │ │
│  │                                                                         │ │
│  │  • Knowledge graph node/edge creation                                   │ │
│  │  • Vector embeddings for semantic search                                │ │
│  │  • Entity linking to biomedical ontologies                              │ │
│  │  • AI-powered relationship extraction                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Status

### ✅ Already Built

- `lumen_data_atoms` table (256+ atoms already populated)
- `rag_knowledge_graph` table (entity relationships)
- `regulatory_atoms` table (regulatory intelligence)
- Basic ClinicalTrials.gov API harvester
- Health Canada synthetic data generator
- CSR document indexer
- SEC 10-K harvesting service (`lumen-cortex-service.ts`)
- Cortex Prime service (`cortexPrimeService.ts`)

### 🔄 In Progress

- [ ] Continuous background harvesting scheduler
- [ ] Progress tracking across restarts

### 📋 TO BUILD - Data Source Farmers

| Priority | Source             | API/Method         | Status                               |
| -------- | ------------------ | ------------------ | ------------------------------------ |
| 🔴 HIGH  | ClinicalTrials.gov | REST API v2        | ✅ Working                           |
| 🔴 HIGH  | FDA FAERS          | OpenFDA API        | 🔧 Needs Build                       |
| 🔴 HIGH  | FDA Orange Book    | openFDA/downloads  | 🔧 Needs Build                       |
| 🔴 HIGH  | SEC EDGAR 10-K     | SEC API            | ✅ Partial (lumen-cortex-service.ts) |
| 🟡 MED   | Health Canada      | HPFB API           | ✅ Synthetic                         |
| 🟡 MED   | EMA (EPAR)         | EMA website scrape | 🔧 Needs Build                       |
| 🟡 MED   | PubMed/PMC         | NCBI E-utilities   | 🔧 Needs Build                       |
| 🟡 MED   | WHO ICTRP          | WHO registry       | 🔧 Needs Build                       |
| 🟢 LOW   | USPTO Patents      | USPTO API          | 🔧 Needs Build                       |
| 🟢 LOW   | DrugBank           | DrugBank API       | 🔧 Needs Build                       |
| 🟢 LOW   | ICH Guidelines     | Manual/scrape      | 🔧 Needs Build                       |
| 🟢 LOW   | EU CTR             | EUCTR API          | 🔧 Needs Build                       |

---

## API Endpoints & Data Sources

### 1. ClinicalTrials.gov (Working ✅)

```
Base URL: https://clinicaltrials.gov/api/v2/studies
Method: REST GET
Rate Limit: Reasonable (add 2-3s delay between requests)
Data: Clinical trials, conditions, sponsors, phases, outcomes
```

### 2. FDA OpenFDA (To Build 🔧)

```
Base URL: https://api.fda.gov
Endpoints:
  - /drug/event.json (FAERS adverse events)
  - /drug/label.json (Drug labels)
  - /drug/ndc.json (National Drug Codes)
  - /device/510k.json (510(k) clearances)
  - /device/pma.json (PMA approvals)
Rate Limit: 240 requests/minute (with API key)
```

### 3. SEC EDGAR (Partial ✅)

```
Base URL: https://data.sec.gov
Endpoints:
  - /cik-lookup-data.txt (Company CIKs)
  - /submissions/CIK{}.json (Company filings)
  - Full-text search available
Data: 10-K annual reports, 8-K events, pharmaceutical company financials
```

### 4. PubMed/NCBI (To Build 🔧)

```
Base URL: https://eutils.ncbi.nlm.nih.gov/entrez/eutils/
Endpoints:
  - esearch.fcgi (Search)
  - efetch.fcgi (Fetch records)
  - elink.fcgi (Related records)
Rate Limit: 3 requests/second (10/sec with API key)
Data: Scientific publications, clinical trial results, medical literature
```

### 5. Health Canada (Synthetic + API 🔧)

```
Base URL: https://health-products.canada.ca/api/
Endpoints:
  - drug/drugproduct
  - drug/activeingredient
  - clinical-trials (if available)
Data: Canadian drug approvals, DINs, safety alerts
```

### 6. EMA (European Medicines Agency) (To Build 🔧)

```
Base URL: https://www.ema.europa.eu
Data: EPAR (European Public Assessment Reports)
      PSUR (Periodic Safety Update Reports)
      Scientific guidelines
Method: Web scraping or RSS feeds
```

---

## Next Steps

1. **Build FDA OpenFDA Farmer** - High priority for FAERS data
2. **Build PubMed Farmer** - Scientific literature backbone
3. **Implement Queue System** - For async processing
4. **Add Vector Embeddings** - For semantic search in Cortex
5. **Build Orchestrator** - Continuous scheduling of all farmers

---

## File Structure

```
scripts/
├── lumen-cortex-harvester.js       # Main orchestrator (existing)
├── farmers/
│   ├── clinicaltrials-farmer.js    # ClinicalTrials.gov
│   ├── fda-openfda-farmer.js       # FDA FAERS, labels, 510k
│   ├── sec-edgar-farmer.js         # SEC 10-K filings
│   ├── pubmed-farmer.js            # PubMed/NCBI
│   ├── health-canada-farmer.js     # Health Canada
│   ├── ema-farmer.js               # EMA EPAR
│   └── who-ictrp-farmer.js         # WHO registry
├── processors/
│   ├── pdf-extractor.js            # PDF parsing
│   ├── xml-parser.js               # XML/JSON processing
│   └── nlp-enricher.js             # AI entity extraction
└── cortex/
    ├── atom-loader.js              # Load atoms to DB
    ├── graph-builder.js            # Build knowledge graph
    └── embedding-service.js        # Vector embeddings
```

---

_Document generated: January 25, 2026_
_Based on: Project Cortex Design Document_
