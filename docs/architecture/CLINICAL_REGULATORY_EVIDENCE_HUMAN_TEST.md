# Clinical Regulatory Evidence — Human-Test Walkthrough

**Purpose.** Bring the CRE module up on a real backend and exercise every surface a
human should verify. It assumes the integration remediation in
`CLINICAL_REGULATORY_EVIDENCE_INTEGRATION_AUDIT.md` (P0a/P0b/P0c + P1) is deployed.

**What "works" means here.** The module has two egress paths:
- **Always-on AnA tools** (not flag-gated, tenant-scoped): the five evidence tools
  plus `project_csr_evidence`. These read the spine directly.
- **Flag-gated v2 surfaces**: CRL Library, CSR-workflow evidence columns, the
  study-design coverage strip. Dark unless the graph flag is on.

Some deep panels are still honest stubs (called out in step 6) — this walkthrough
verifies the paths that are wired, and names the ones that are not, so a tester is
never left guessing whether an empty panel is a bug.

---

## 1. Apply the schema

The durable migration set now includes the embedding reconciliation
(`db/migrations/20260730_fix_atom_embedding_dimension.sql`). On a normal deploy it
runs automatically (`scripts/db/deploy-migrate.mjs`). To apply out-of-band against a
reachable database:

```bash
DATABASE_URL='postgres://…' npm run db:apply-c2c
```

The `cre_*` spine tables come from `20260724_clinical_regulatory_evidence_spine.sql`
(already in the set). Nothing here is destructive.

## 2. Turn the feature on

**Server** (gates the routes — flag off ⇒ 404):

```bash
export ENABLE_CLINICAL_REGULATORY_GRAPH=true
```

**Client** (gates rendering — no rebuild needed; per browser):
- append `?crl-graph=1` to the app URL once, **or**
- run `localStorage.setItem('c2c-crl-graph','1')` in the browser console.

`?crl-graph=0` / `'0'` turns it back off. The client flag is a rendering gate only;
with the server flag off you get honest error states, never another tenant's data.

## 3. Seed demo evidence

Populate ONE tenant with clearly-labelled, tenant-private demo evidence (a `[DEMO]`
CRL with three findings + a verified outcome, a `[DEMO]` CSR + study, and a governed
design lesson). It also folds the tenant's own `csr_reports` into the spine (the P0b
projection path).

```bash
# by org id
DATABASE_URL='postgres://…' npm run cre:seed-demo -- --org <ORG_ID>
# or by org name (defaults to concept2cure)
DATABASE_URL='postgres://…' npm run cre:seed-demo -- --org-name concept2cure
# idempotent; re-run with --verify to print corpus counts
DATABASE_URL='postgres://…' npm run cre:seed-demo -- --org <ORG_ID> --verify
```

Nothing is written global-public; the demo never leaks to another tenant and never
poses as a real FDA record.

Optional — materialize retrieval atoms (semantic search over the evidence):

```bash
DATABASE_URL='postgres://…' npm run cre:atoms -- --org <ORG_ID>
```

## 4. Exercise the AnA tools (always on)

In the assistant, as a user of the seeded tenant:

| Ask | Tool | Expect |
|---|---|---|
| "What has FDA objected to for metastatic NSCLC endpoints?" | `search_clinical_regulatory_evidence` / `explain_design_risk` | the multiplicity + safety-database findings, with ICH E3 / CTD citations, and an explicit "evidence, not a prediction" note |
| "Compare a proposed co-primary OS/PFS Phase 3 NSCLC design to precedent" | `compare_proposed_design_to_precedent` | a benchmark with a provenance envelope, no accept/reject verdict |
| "Stress-test this NSCLC protocol" | `stress_test_protocol` | scenarios **driven by the findings on record** (multiplicity, dropout), run through the existing simulator |
| "Trace the evidence behind that recommendation" | `trace_design_recommendation` | the inspectable source→study→finding chain |
| "Bring my CSRs into the evidence graph" | `project_csr_evidence` | a count of projected vs already-present CSRs; re-running is a no-op |

Every tool refuses to run without tenant context and never emits a dose value,
approval probability, or binary FDA verdict.

## 5. Exercise the v2 surfaces (flag on)

- **CRL Library** — lists the three demo findings; each opens to its source
  application, page, verbatim excerpt, discipline, and ICH E3 / CTD mapping. The
  discipline shown is the honest normalized value (e.g. *statistical* for the
  multiplicity finding), never a fabricated *clinical* default.
- **CSR workflow** (project → clinical) — the added columns show the findings and the
  coverage strip; the **Regulatory outcome** card now resolves the application from
  the findings and shows the verified CRL outcome (it reads "Not verified" only when
  there is genuinely no verified outcome — never inferred from trial completion).
- **Study Design coverage strip** — counts the structured `csr` sources the seed +
  projection produced.

## 6. Known honest-empty (not bugs)

These return real zeros / nulls by design until their phase lands (audit P2):
- Study-design **evidence accordions** deep arrays, **Trace** report, and **Stress**
  scenario detail via `getDesignEvidence` / `getTrace` / `runStressTest` on the facade
  are stubs — the coverage counts are real, the deep panels are intentionally empty
  rather than sample content.
- **RAG semantic discovery** of CRE atoms is deferred: CRE reaches AnA through the
  five direct tools above, not (yet) through project-knowledge semantic search.

## 7. Add real evidence (platform admin)

A real FDA CRL is written to the SHARED global-public corpus by a platform admin:

```bash
curl -sS -X POST "$BASE/api/clinical-regulatory-evidence/crl" \
  -H "authorization: Bearer $ADMIN_JWT" -H 'content-type: application/json' \
  -d '{"applicationNumber":"BLA-761234","applicationType":"BLA","findings":[
        {"findingText":"…","requestedAction":"…","fdaReviewDiscipline":"clinical"}]}'
```

Supplying `text` instead of `findings` extracts them through the AI gateway; an empty
extraction is a `422`, never a synthetic finding. Non-admins get `403` — a single
tenant cannot mint cross-tenant FDA evidence.

## 8. Verify

```bash
DATABASE_URL='postgres://…' npm run cre:seed-demo -- --org <ORG_ID> --verify
# → "CRE corpus for org N: X sources, Y findings, Z studies, … design lessons."
```

Route smoke test (flag on, authenticated):

```bash
curl -sS "$BASE/api/clinical-regulatory-evidence/findings?limit=25" -H "authorization: Bearer $JWT"
curl -sS "$BASE/api/clinical-regulatory-evidence/outcome?applicationNumber=NDA-DEMO-CRE-001" -H "authorization: Bearer $JWT"
```
