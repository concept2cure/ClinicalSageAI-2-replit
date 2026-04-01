# CRITICAL AUDIT: Mock/Fake/Placeholder Data in Server Routes

**Audit Date:** 2026-04-01  
**Scope:** `server/routes/*.ts`, `server/routes/*.js`, `server/index.ts`  
**Auditor:** System Pathway Cleanup Sprint  

---

## Executive Summary

**29 route files** contain mock data, fake responses, hardcoded sample data, or in-memory-only stores that pretend to be production-ready. Of these:

- **9 HIGH severity** — User-facing routes returning entirely fake data to clients from mounted endpoints
- **12 MEDIUM severity** — Partially fake (mixed real + mock), in-memory-only stores, or demo fallbacks
- **8 LOW severity** — Comments only, dev-gated, or template content (acceptable patterns)

---

## HIGH SEVERITY — User-facing fake data on mounted routes

These routes are **live-mounted in `server/index.ts`** and return completely fabricated data to clients. Users see fake data and believe it is real.

---

### 1. `server/routes/programs.ts` — ENTIRE FILE IS MOCK

**Mounted:** NOT directly mounted (no `import('./routes/programs')` in index.ts)  
**Risk:** If mounted via another loader or future import, ALL CRUD operations are fake.

| Route | Lines | What's Fake |
|-------|-------|-------------|
| `GET /` | 157–204 | Returns hardcoded array of 2 fake programs ("Cardiac Monitor CER 2026", "Glucose Monitor 510(k)") |
| `GET /:id` | 225–283 | Returns single hardcoded program object with fake team members |
| `POST /` | 310–327 | Accepts input but returns it back without persisting — no DB insert |
| `PATCH /:id` | 346–354 | Returns input + timestamp — no DB update |
| `DELETE /:id` | 367–378 | Returns success message — no DB delete |
| `GET /:id/milestones` | 393–435 | Returns hardcoded array of 3 fake milestones |
| `POST /:id/milestones` | 442–463 | Returns input back — no persistence |
| `GET /:id/activity` | 479+ | Returns fake activity timeline |
| `GET /:id/statistics` | 543+ | Returns fake statistics |

**Severity: HIGH** — Every single route in this file is a mock shell.

---

### 2. `server/routes/evidence.ts` — ENTIRE FILE IS MOCK

**Mounted:** YES — `app.use('/api/evidence', ...)` at index.ts:1611

| Route | Lines | What's Fake |
|-------|-------|-------------|
| `GET /` | 174–243 | Returns hardcoded array of 3 fake evidence objects |
| `GET /:id` | 260–307 | Returns single hardcoded evidence with fake DOI, fake authors |
| `POST /` | 342–362 | Accepts input, returns it back with random UUID — no DB insert |
| `PATCH /:id` | 375–389 | Returns input back — no DB update |
| `DELETE /:id` | 396–407 | Returns success — no DB delete |
| `POST /:id/verify` | 418–441 | Returns verification status — no DB write |
| `GET /:id/links` | 452–480+ | Returns hardcoded fake evidence links |
| `GET /facets` | 554+ | Returns hardcoded facets/filters |

**Severity: HIGH** — Every route is mock. Users think they're managing evidence but nothing persists.

---

### 3. `server/routes/organizations-routes.ts` — ENTIRE FILE IS MOCK

**Mounted:** YES — `app.use('/api/organizations', ...)` at index.ts:6978

| Route | Lines | What's Fake |
|-------|-------|-------------|
| `GET /` | 36–80 | Returns hardcoded array of 3 fake orgs ("Acme Pharmaceuticals", "Biotech Innovations", "MedDevice Corp") |
| `GET /:id` | 86–134 | Returns hardcoded org details based on ID matching ("1"→"Acme", "2"→"Biotech") |
| `GET /:id/clients` | 141–215+ | Returns hardcoded fake clients per org ID |

**Severity: HIGH** — Live route. Despite importing `db` and `organizations` schema, no DB queries are used. All data is fabricated.

---

### 4. `server/routes/ana-features.ts` — Regulatory Intelligence Feed is 100% fabricated

**Mounted:** YES — at index.ts:3834

| Route | Lines | What's Fake |
|-------|-------|-------------|
| Regulatory Intelligence Feed | 51–180+ | Hardcoded array of ~10 fake regulatory intelligence items with fabricated FDA/EMA/PMDA guidance, approvals, and alerts |

**Severity: HIGH** — Users see fake regulatory intelligence items that look real (fake FDA guidance URLs, fake approval dates). This is particularly dangerous for a regulatory platform — fake regulatory data could mislead users.

---

### 5. `server/routes/analytics-routes.ts` — Dashboard section has extensive mock data

**Mounted:** YES — `app.use('/api/analytics', ...)` at index.ts:7133

| Route | Lines | What's Fake |
|-------|-------|-------------|
| Dashboard endpoint | 987–1075 | Hardcoded `sponsorDistribution` (Pfizer: 112, Novartis: 98, etc.), `monthlyTrends`, `mostCommonEndpoints`, `completionRates`, `predictiveInsights` — all fabricated |

**Severity: HIGH** — The route does query real `csrReports` for some data (indications, phases) but then mixes in extensive hardcoded fake data for dashboard widgets. Users see a dashboard that is partially real, partially fabricated.

---

### 6. `server/routes/compliance-gap-analysis.ts` — Trends and Reports are 100% mock

**Mounted:** Unclear — no direct mount found in index.ts, but may be loaded by concept2cure.ts or another loader.

| Route | Lines | What's Fake |
|-------|-------|-------------|
| `GET /trends` | 362–406 | Generates random compliance scores with `Math.random()` |
| `GET /report/:submissionId` | 418–430+ | Returns fabricated compliance report with hardcoded `overallReadiness: 78`, `estimatedApprovalProbability: 0.72`, etc. |

**Severity: HIGH** — Compliance data is fabricated using random numbers. On a regulatory platform, fake compliance scores are a critical integrity issue.

---

### 7. `server/routes/cer-routes.ts` — FAERS data is entirely fabricated

**Mounted:** YES — `app.use('/api/cer', ...)` at index.ts:1380

| Route | Lines | What's Fake |
|-------|-------|-------------|
| `getSampleFaersData()` | 48–98 | Generates 25 fake FAERS adverse event reports with `Math.random()` for ages, random sex, random event types. Fake drug mappings (NDC→brand name). |
| CER generation route | 255–259 | Uses the fake FAERS data for CER report generation |

**Severity: HIGH** — Users generating Clinical Evaluation Reports get fake FDA FAERS safety data. Regulatory documents built on fabricated safety data is a critical compliance risk.

---

### 8. `server/routes/supplyChain.routes.ts` — ENTIRE FILE IS MOCK

**Mounted:** NOT found in index.ts

| Route | Lines | What's Fake |
|-------|-------|-------------|
| All CRUD operations | 18–1248 | 7 hardcoded mock arrays: `mockSuppliers`, `mockMaterials`, `mockBatches`, `mockShipments`, `mockTemperatureReadings`, `mockDeviations`, `mockInventory`. All routes read/write these in-memory arrays. |

**Severity: HIGH** (if mounted) / LOW (if dead code) — The entire supply chain module is a mock shell. Even "DB queries" have catch blocks that fall back to mock data (lines 279–280, 331–332).

---

### 9. `server/routes/notification_routes.ts` — Mock email sender + mock protocol data

**Mounted:** YES — at index.ts:7247

| Route | Lines | What's Fake |
|-------|-------|-------------|
| `sendEmail()` | 13–22 | Logs `[MOCK EMAIL]` to console instead of sending real emails |
| `getProtocolDetails()` | 320–340 | Returns hardcoded protocol details ("Phase 3 Study of Drug XYZ") instead of querying DB |

**Severity: HIGH** — Users never receive notification emails. Protocol details in notifications are fabricated.

---

## MEDIUM SEVERITY — Partially fake, in-memory-only, or dev-gated

---

### 10. `server/routes/mission-control.ts` — In-memory store with seed data

**Mounted:** YES — `app.use('/api/mission-control', ...)` at index.ts:7492  
**Lines:** 75–334 — Entire module uses in-memory `Map` stores with extensive seed data. Headers explicitly warn: `X-Data-Source: in-memory-experimental`.  
**Severity: MEDIUM** — Data is lost on restart. Self-documented as experimental, but mounted as a live route.

---

### 11. `server/routes/snowglobe.ts` — In-memory store with seed data

**Mounted:** YES — `app.use('/api/snowglobe', ...)` at index.ts:7497  
**Lines:** 37–285 — In-memory `Map` stores with seed scenario/prediction data.  
**Severity: MEDIUM** — Simulation engine with no persistence.

---

### 12. `server/routes/inline-annotations.ts` — In-memory store with seed demo annotations

**Mounted:** YES — `app.use('/api/inline-annotations', ...)` at index.ts:7540  
**Lines:** 55–122 — Seeds 3 demo annotations on module load. All data in memory.  
**Severity: MEDIUM** — Annotations not persisted. Demo data mixed with user data.

---

### 13. `server/routes/client-branding.ts` — In-memory store with demo branding

**Mounted:** YES — `app.use('/api/client-branding', ...)` at index.ts:7531  
**Lines:** 58–175 — Seeds demo branding settings and templates for org ID 1.  
**Severity: MEDIUM** — Lost on restart. Demo templates mixed with real usage.

---

### 14. `server/routes/haq-manager.ts` — In-memory store with demo HAQ questions

**Mounted:** YES — `app.use('/api/haq-manager', ...)` at index.ts:7546  
**Lines:** 55–306 — Hardcoded `demoQuestions` array with 3+ fake Health Authority Questions. AI draft responses are fabricated. In-memory only.  
**Severity: MEDIUM** — Users see pre-populated HAQ data that looks real. No persistence.

---

### 15. `server/routes/smart-blocks.js` — Mock data generators for demo

**Mounted:** YES — `app.use('/api/smart-blocks', ...)` at index.ts:1615  
**Lines:** 404–459 — `generateMockData` object with generators for `mrsd-table`, `clinical-endpoints`, `stability-summary-6mo` returning fabricated table data.  
**Severity: MEDIUM** — Smart block content generation returns fake clinical data (e.g., made-up NOAEL values, IC50 data).

---

### 16. `server/routes/tenant-stats.ts` — Dev-mode mock bypass

**Mounted:** YES — `app.use('/api/tenant-stats', ...)` at index.ts:7319  
**Lines:** 37–73 — Returns hardcoded stats when `NODE_ENV === 'development'`. Real DB queries exist for production.  
**Severity: MEDIUM** — Dev-only bypass, but still ships fake data in dev mode.

---

### 17. `server/routes/tenants.ts` — Dev-mode mock bypass

**Mounted:** Via `tenants-simple.js` at index.ts:6962 (separate file, but `tenants.ts` may also be loaded).  
**Lines:** 104–124 — Returns hardcoded tenant data when `NODE_ENV === 'development' && tenantId === 1`.  
**Severity: MEDIUM** — Dev-only bypass with real DB fallback.

---

### 18. `server/routes/collaboration.ts` — Dev-mode fallback demo data

**Mounted:** YES — `app.use('/api/collaboration', ...)` at index.ts:7706  
**Lines:** 95–104 — On DB error, returns fake team member in dev mode.  
**Severity: MEDIUM** — Error fallback only, but silently returns fake data instead of an error.

---

### 19. `server/routes/agent-swarm.ts` — Simulated task execution

**Mounted:** YES — `app.use('/api/agent-swarm', ...)` at index.ts:7454  
**Lines:** 587–630 — `simulateExecution()` fakes task progress with `setTimeout` chains instead of running real AI agents.  
**Severity: MEDIUM** — Tasks appear to complete but no real work is done.

---

### 20. `server/routes/cortex-unified.ts` — Demo fallback on AI failure

**Mounted:** YES — at index.ts:1847  
**Lines:** 801–806 — On AI stream failure, generates a demo response via `generateContextAwareDemoResponse()` and sends it to the user with a `demo_warning` event.  
**Severity: MEDIUM** — Fallback behavior, but sends fake AI responses when the real AI is unavailable.

---

### 21. `server/routes/product-audit.ts` — In-memory store only

**Mounted:** Likely mounted (not confirmed in index.ts search).  
**Lines:** 27–34 — Explicitly warns data is in-memory only.  
**Severity: MEDIUM** — Audit data (regulatory compliance) not persisted. Lost on restart.

---

## LOW SEVERITY — Comments, templates, dev-gated, or acceptable patterns

---

### 22. `server/routes/authoring.router.ts` — Simulated scores in compliance validation

**Mounted:** YES — at index.ts:3868  
**Lines:** 4668, 4864 — `technical_score: 85 + Math.random() * 15` and `compliant: Math.random() > 0.3` used in compliance scoring.  
**Severity: LOW-MEDIUM** — Random scores in compliance validation. Small surface area within a large file, but still fake compliance data.

---

### 23. `server/routes/protocol_routes.ts` — Random scores for demo

**Mounted:** YES — at index.ts:7207  
**Lines:** 643–677 — `calculateRegScore()` and `calculateOverallScore()` use `Math.random()` for demo scoring.  
**Severity: LOW** — Score helpers used alongside real DB queries.

---

### 24. `server/routes/predictive-sections.ts` — Mock template data

**Mounted:** YES — at index.ts:7013  
**Lines:** 113–180 — Hardcoded template definitions for section codes (2.5, 2.7, 510k.2). This is more template/configuration data than mock data.  
**Severity: LOW** — Templates are static reference data, not fake user data.

---

### 25. `server/routes/leaves.js` — Demo hydrated content + sample facts

**Mounted:** YES — at index.ts:7004  
**Lines:** 61–133 — Returns hardcoded HTML content and facts for eCTD leaf nodes.  
**Severity: LOW** — Template-like content for IND document structure.

---

### 26. `server/routes/cerv2-ai-routes.ts` — Template content for AI generation

**Mounted:** YES — at index.ts:1134  
**Lines:** 582–600+ — `enhancedMockContent` provides template text for section generation. Used as fallback when AI is unavailable.  
**Severity: LOW** — AI generation templates/fallbacks, not user data.

---

### 27. `server/routes/cerv2-export-routes.ts` — Mock export routes (production-gated)

**Mounted:** YES — at index.ts:1133  
**Lines:** 442–593 — Mock PDF/DOCX/ZIP/JSON export routes. All gated with `if (process.env.NODE_ENV === 'production') return 404`.  
**Severity: LOW** — Properly gated. Will not serve in production.

---

### 28. `server/routes/ind-autodraft.ts` — Template content for IND auto-drafting

**Mounted:** YES — at index.ts:1556  
**Lines:** 178–215 — Hardcoded IND section templates (Module 1.0, 2.3, 2.4, 2.5) with placeholder clinical data.  
**Severity: LOW** — These are document templates used to seed AI drafting, not fake user data.

---

### 29. `server/routes/academic_protocol_assessment.ts` — Fake citation fallbacks + random similarity scores

**Mounted:** Likely mounted (academic routes).  
**Lines:** 63–120 — Returns fabricated academic citations when no real DB results. Line 336: `similarity: Math.random() * 30 + 70` as placeholder.  
**Severity: LOW** — Fallback citations are clearly labeled as evidence-based recommendations. Similarity score placeholder is minor.

---

### 30. `server/routes/fda510k-routes.ts` — Demo tenant context bypass

**Mounted:** YES — at index.ts:1131  
**Lines:** 521–548 — Uses `demo-org-001` as default organization ID when none provided.  
**Severity: LOW** — Tenant bypass for testing, not fake data.

---

### 31. `server/routes/sso.ts` — Dev-mode mock SSO code acceptance

**Mounted:** Likely mounted.  
**Lines:** 329 — Accepts mock SAML code in dev mode.  
**Severity: LOW** — Dev-only SSO bypass.

---

## Summary Table

| # | File | Severity | Mounted? | Description |
|---|------|----------|----------|-------------|
| 1 | `programs.ts` | **HIGH** | No (dead code?) | Entire CRUD is mock — no DB queries at all |
| 2 | `evidence.ts` | **HIGH** | YES | Entire CRUD is mock — no DB queries at all |
| 3 | `organizations-routes.ts` | **HIGH** | YES | All org/client data is hardcoded fake |
| 4 | `ana-features.ts` | **HIGH** | YES | Fabricated regulatory intelligence feed |
| 5 | `analytics-routes.ts` | **HIGH** | YES | Dashboard filled with hardcoded sponsor/trend data |
| 6 | `compliance-gap-analysis.ts` | **HIGH** | Unclear | Random compliance scores, fake reports |
| 7 | `cer-routes.ts` | **HIGH** | YES | Fabricated FAERS safety data for CER reports |
| 8 | `supplyChain.routes.ts` | **HIGH** | No (dead code?) | 7 mock arrays — entire module is fake |
| 9 | `notification_routes.ts` | **HIGH** | YES | Mock email + mock protocol details |
| 10 | `mission-control.ts` | MEDIUM | YES | In-memory store, seed data, self-labeled experimental |
| 11 | `snowglobe.ts` | MEDIUM | YES | In-memory store with seed scenarios |
| 12 | `inline-annotations.ts` | MEDIUM | YES | In-memory store with seed annotations |
| 13 | `client-branding.ts` | MEDIUM | YES | In-memory store with demo branding |
| 14 | `haq-manager.ts` | MEDIUM | YES | In-memory store with demo HAQ questions |
| 15 | `smart-blocks.js` | MEDIUM | YES | Mock data generators for clinical content |
| 16 | `tenant-stats.ts` | MEDIUM | YES | Dev-mode mock bypass |
| 17 | `tenants.ts` | MEDIUM | YES | Dev-mode mock bypass |
| 18 | `collaboration.ts` | MEDIUM | YES | Dev-mode error fallback returns fake team |
| 19 | `agent-swarm.ts` | MEDIUM | YES | Simulated task execution (no real AI) |
| 20 | `cortex-unified.ts` | MEDIUM | YES | Demo fallback on AI failure |
| 21 | `product-audit.ts` | MEDIUM | Likely | In-memory only, data lost on restart |
| 22 | `authoring.router.ts` | LOW-MED | YES | Random compliance scores (`Math.random()`) |
| 23 | `protocol_routes.ts` | LOW | YES | Random demo scores in helpers |
| 24 | `predictive-sections.ts` | LOW | YES | Static template data |
| 25 | `leaves.js` | LOW | YES | Template content for IND docs |
| 26 | `cerv2-ai-routes.ts` | LOW | YES | AI generation template fallbacks |
| 27 | `cerv2-export-routes.ts` | LOW | YES | Production-gated mock exports |
| 28 | `ind-autodraft.ts` | LOW | YES | IND section templates |
| 29 | `academic_protocol_assessment.ts` | LOW | Likely | Fallback citations |
| 30 | `fda510k-routes.ts` | LOW | YES | Demo tenant context bypass |
| 31 | `sso.ts` | LOW | Likely | Dev-mode mock SSO |

---

## Recommended Actions

### Immediate (HIGH severity — must fix)

1. **`evidence.ts`** — Replace all mock responses with real Drizzle ORM queries. This is a mounted route serving fake evidence data.
2. **`organizations-routes.ts`** — Wire up the already-imported `db` and `organizations` schema. The imports exist but are unused.
3. **`ana-features.ts`** — Replace fabricated regulatory intelligence feed with real data or remove the endpoint. Fake regulatory guidance is dangerous.
4. **`analytics-routes.ts`** — Remove hardcoded `sponsorDistribution`, `monthlyTrends`, etc. Compute from real `csrReports` data.
5. **`cer-routes.ts`** — Replace `getSampleFaersData()` with real FDA FAERS API calls or remove the endpoint. Fabricated safety data in CER reports is a critical regulatory risk.
6. **`compliance-gap-analysis.ts`** — Replace `Math.random()` compliance scores with real analysis.
7. **`notification_routes.ts`** — Wire up real email sending (SendGrid/Nodemailer already in stack). Replace mock protocol query.

### Short-term (MEDIUM severity)

8. **In-memory stores** (mission-control, snowglobe, inline-annotations, client-branding, haq-manager, product-audit) — Migrate to PostgreSQL. Data loss on restart is unacceptable for a production system.
9. **`agent-swarm.ts`** — Either wire up real AI execution or clearly label as preview/beta.
10. **`smart-blocks.js`** — Replace mock data generators with real data queries from project documents.
11. **Dev-mode bypasses** (tenant-stats, tenants, collaboration) — Ensure these never activate in production by adding explicit checks.

### Housekeeping (LOW severity)

12. **Dead code files** (`programs.ts`, `supplyChain.routes.ts`) — Verify unmounted and either delete or document as planned-but-unimplemented.
13. **`authoring.router.ts`** random scores — Replace `Math.random()` compliance scoring with deterministic analysis.
14. **Template/fallback content** — Acceptable patterns, but should be clearly documented as templates vs. user data.

---

## Methodology

Searched using the following patterns:
- `mock|Mock|MOCK` — 31 files matched
- `placeholder|Placeholder|PLACEHOLDER` — 28 files (mostly false positives: SQL placeholders, UI placeholders)
- `sample|Sample|SAMPLE` — 40+ files (mostly false positives: "sample size" domain term)
- `dummy|Dummy|DUMMY` — 0 matches
- `fake|Fake|FAKE` — 0 matches
- `hardcoded|hard-coded|HARDCODED` — 1 match (comment only)
- `Coming Soon|Not yet implemented` — 5 matches (legitimate 501 responses)
- `TODO.*implement|FIXME.*implement` — 0 matches
- `res.json([` — checked for hardcoded array returns
- `demo.*data|for demo|for development` — 15+ files
- `in-memory|InMemory` — 15+ files
- Cross-referenced all findings against `server/index.ts` route mounting

Each finding was manually reviewed to distinguish:
- Real mock data (fake objects returned to clients) vs. false positives (SQL parameterized placeholders, "sample size" as a domain term, template content)
- Mounted routes (live) vs. dead code (unmounted)
- Dev-gated (acceptable) vs. always-active (unacceptable)
