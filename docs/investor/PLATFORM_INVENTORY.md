# Platform capability inventory

Derived by walking the repository, not from any summary. It exists so that
`whitepaper.html` — and anything else written about this platform — can be
checked against the code rather than against someone's memory of it.

**Method.** Service counts are non-test `.ts`/`.js` files under
`server/services/<dir>/**`. Table families are `export const X = pgTable`
declarations under `shared/`. Surfaces are `.tsx` files under
`client/src/concept2cure/v2/surfaces/`. Regenerate with the commands in
[Refreshing this document](#refreshing-this-document).

**Measured at** `concept2cure-v2`, 2026-08-14.

| Dimension | Count |
|---|--:|
| Service directories | 215 |
| Service files (non-test) | 1,527 + 264 loose top-level |
| Lines in `server/services` | ~519,000 |
| Route modules | 465 |
| Client surfaces (`v2/surfaces`) | 107 |
| Tables provisioned from blank | 931 |
| RLS policies | 787 |

---

## The finding that matters

**This is not a submission tool with modules attached. It is a lifecycle
platform that happens to include submission.**

The table families span from *grant funding* — before a molecule exists — through
preclinical, protocol design, ethics, clinical operations, study reporting,
submission, labeling, and post-approval change control, pharmacovigilance and
registration maintenance. Framing the platform as "three submission journeys"
(510(k), CER, IND/NDA) describes perhaps a third of what is built, and positions
it against submission point-tools rather than against the lifecycle suites it
actually resembles.

Any document that leads with the three journeys is understating the asset.

---

## Lifecycle map

Stages are the product lifecycle a sponsor actually moves through. The point of
this table is coverage breadth: each row is backed by real tables and services,
not a roadmap entry.

| Stage | Capability | Evidence in code |
|---|---|---|
| **Funding** | Grant lifecycle | `grantOpportunities`, `grantProposals`, `grantAwards`, `grantMilestones`, `grantInvoices`, `grantCloseoutRecords` |
| **Discovery / preclinical** | Nonclinical program, FIH dosing | `server/services/preclinical` (14) — first-in-human dose engine, nonclinical safety assessment, M2.4/M2.6 summaries |
| **Study design** | Protocol development | 23 `protocol*` tables — objectives, eligibility, schedule of assessments, versions, amendments, deviations, CAPA, budget, milestones, review; `server/services/study-design` (17) |
| **Ethics** | IRB / EC submissions | `irbSubmissions`, `irbSites`, `irbConsentDocuments`, `irbReviews`, `irbAmendments`, `irbReportableEvents` |
| **Clinical operations** | Risk-based monitoring | `server/services/rbm` (7) — site risk engine, central statistical monitoring, KRI ingestion/actuation; `rbmRiskAssessments`, `rbmKris`, `rbmKriValues`, `rbmDataRuns`, `rbmMetricObservations` |
| **Supply** | Supply chain & cold chain | `supplyChainSuppliers`, `supplyChainMaterials`, `supplyChainBatches`, `supplyChainShipments`, `supplyChainTemperatureReadings` |
| **Study reporting** | Clinical study reports | **27 `csr*` tables — the deepest family in the schema**: endpoints and results, populations, arms, AE, safety summaries, PK, dose-response, biomarkers, statistical analyses, TLFs, cross-study comparison, safety signals, knowledge graph nodes/edges, extraction log, build jobs |
| **Quality** | QMS and QC | `qmsDocuments`, `qmsTrainingRecords`, `qmsInternalAudits`, `qmsManagementReviews`, `qmsNonconformingProducts`; `qcSpecifications`, `qcOosInvestigations`, `qcBatchReleases`, `qcDeviations`, `qcMicrobiologicalTests`, `qcReferenceStandards` |
| **CMC** | Module 3 and change control | `server/services/cmc` (16) + 14 tables — see [CMC](#cmc-detail) |
| **Submission** | 510(k) · CER/PER · IND/NDA | `server/services/ectd` (50), `pathway-engines` (22), `submission-gateways` (28); `ctd*`, `submission*`, `fda510k*`, `cer*`, `device*` families |
| **Transmission** | 13 agency gateways | FDA ESG, EMA CESP, PMDA, MHRA, Health Canada, TGA eBS, Swissmedic, NMPA, MFDS, ANVISA, CDSCO Sugam, HSA PRISM |
| **Labeling** | SmPC, PI, SPL | `server/services/labeling` (5) — SPL generation, PI service, SmPC QRD catalog |
| **Post-approval** | Change control, variations | CMC change control projected through the SUPAC/variations classifier |
| **Post-market** | PV, vigilance, registrations | `ind-lifecycle` E2B(R3) ICSR composition + gateway transport; `gspr-postmarket` (6); registration and registry-bridge surfaces |
| **Correspondence** | HAQ, agency meetings, CRL | HAQ manager and agency-meeting surfaces; CRL ingestion and trigger patterns in `regulatory-precedent-intelligence` |

---

## Service domains by size

Top 25 of 215. Counts are non-test service files.

| Services | Domain | What it is |
|--:|---|---|
| 229 | `ana` | The assistant: 359 registered tools, intelligence-questions flows (39), therapeutic-area profiles (27), war-game auditors |
| 77 | `regulatory` | Canonical document store, lifecycle bindings, filing taxonomy |
| 58 | `ana-ri` | Assistant orchestration, command execution, kernel |
| 50 | `ectd` | Backbone assembly, lifecycle ops, PDF/A, checksum manifest, validators, qualification harness |
| 48 | `global-ri` | Multi-market registration intelligence |
| 38 | `report-os` | Immutable sealed reports, lineage-trace, portfolio/regional renderers |
| 37 | `intelligence` | The RIM — pattern store, readiness scoring, recommendations, change impact |
| 36 | `ind-lifecycle` | Amendments, annual reports, briefing books, E2B(R3) ICSR |
| 28 | `submission-gateways` | 13 agency transports behind one governed transmit path |
| 28 | `ivd-knowledge` | Diagnostics standards, legal, regulatory, scientific |
| 25 | `market-specs` | Per-market submission specifications |
| 24 | `stats` | Group-sequential, BOIN, enrolment forecast, external control, analytical/clinical performance |
| 23 | `translation` | Terminology domains, global language |
| 23 | `integrations` | External system connectors |
| 22 | `regulatory-precedent-intelligence` | Approval precedent, RTF and CRL trigger patterns |
| 22 | `pathway-engines` | eSTAR, PreSTAR, PMA, MDR/IVDR, CTIS, PMDA, device assembly |
| 21 | `ai-gateway` | The single model chokepoint — routing, policy, placement, audit |
| 21 | `ai-actions` | Governed AI mutations |
| 20 | `connectors` | Third-party data sources |
| 17 | `clinical-regulatory-evidence` | Evidence spine, CRL ingestion, CSR adapter, data origins |
| 17 | `study-design` | CRF shells, design gates/validation, protocol and registration projection |
| 16 | `cmc` | See below |
| 15 | `resolution` | Contradiction and conflict resolution |
| 15 | `pdev` | Product development |
| 14 | `living-record` | Continuously maintained records |

---

## CMC detail

Called out because it is the clearest instance of the platform's provenance
claim, and because post-approval change control is the recurring-revenue
surface.

- **Module 3 compiler** (`cmc-module3-compiler.ts`) — source objects compile
  deterministically into CTD `3.2.S.1`–`3.2.S.7` and `3.2.P.*`. Each compiled
  section carries `compiledHash`, `stale` + `staleReason`, and `lineage[]`
  recording `sourceObjectId` and `sourceHashAtCompile`. Change a source and
  dependent sections are marked stale **with the reason**.
- **SUPAC / variations classifier** (`supac-classifier.ts`) — pure function, no
  DB, no model. Returns FDA reporting category (Annual Report / CBE-0 / CBE-30 /
  PAS), SUPAC tier, EMA variation class (IA / IAIN / IB / II), BE requirements,
  impacted CTD sections, and guidance citations. Grounded in SUPAC-IR/MR/SS,
  21 CFR 314.70, ICH Q12, EC No 1234/2008.
- **Shelf-life** (`shelf-life.ts`) — ICH Q1E OLS regression to the one-sided 95%
  confidence intersect with the spec limit; t-quantile against a tested
  Student-t CDF, so results reproduce. States its own scope limit; poolability
  is `shelf-life-poolability.ts`.
- **ICH compliance checker** — Q1A(R2), Q2(R1), Q3A/Q3B, Q3D(R2), Q6A/Q6B,
  Q8(R2), Q9, Q10.
- **QbD analyzer** — derives CQAs from spec test parameters, impurity profiles
  and stability indicators; CPPs from process records and in-process controls.
- **Change control** (`cmc-change-control-service.ts`) — org-scoped store whose
  verdicts are **computed at read time** by the classifier, not stored, so a
  rules change re-projects history.

---

## What is NOT built

Kept here so it is as easy to find as the capability list.

- **Outcome-data capture** — submitted content paired with the agency's actual
  response. The only advantage that compounds; nothing captures it.
- **Retrieval-verified citation binding** — grounding is checked
  deterministically and surfaced, but advisory, not bound into the document.
- **Privacy lifecycle** — erasure, retention, and data residency.
- **Audit-substrate consolidation** and database-enforced immutability.
- **Request-path test coverage** and a real browser tier.
- **Production under enforced tenant isolation** — the `app_service` role is
  provisioned; running production under it is not yet proven.

Procurement-blocked rather than unbuilt: eSTAR templates and field maps, eCTD
DTDs, the reference validator licence, agency gateway credentials, terminology
dictionary licences.

---

## Refreshing this document

```bash
# service directories by size
python3 - <<'EOF'
import os
root='server/services'
rows=[]
for d in sorted(os.listdir(root)):
    p=os.path.join(root,d)
    if not os.path.isdir(p): continue
    n=sum(len([f for f in fn if f.endswith(('.ts','.js')) and not f.endswith(('.test.ts','.spec.ts'))])
          for dp,dn,fn in os.walk(p) if '__tests__' not in dp)
    if n: rows.append((n,d))
for n,d in sorted(rows, reverse=True)[:25]: print(f"{n:>4}  {d}")
EOF

# table families
grep -roh "export const [a-zA-Z0-9_]* = pgTable" shared/ --include="*.ts" \
  | sed 's/export const //; s/ = pgTable//' | sort

# client surfaces
ls client/src/concept2cure/v2/surfaces/*.tsx | wc -l

# route modules
find server/routes -name "*.ts" ! -path "*__tests__*" | wc -l
```
