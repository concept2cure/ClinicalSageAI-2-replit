# Pricing — page copy and launch pricing proposal

> **DRAFT — FOR FOUNDER PRICING DECISION AND LAWYER REVIEW.**
> Prepared 2026-09-20 by a Claude Code session (workstream W6). Part 1 is
> proposed public copy. Part 2 is the pricing table **as it exists in code**
> (`server/services/billing.ts`, mirrored in
> `client/src/concept2cure/v2/fixtures/licensing.ts`) beside a **proposal**
> that is not implemented anywhere and is not a fact until the founder
> decides it and the code changes. Part 3 is the rationale. Part 4 says what
> is and is not in this release. No customer has paid any of these prices.
> Launch row moved: **D9**.

---

## Part 1 — Pricing page copy (proposed)

### Headline

**Governed regulatory documents, from first draft to a validated eCTD
sequence.**

Concept2Cure is the system of record for a small regulatory team: controlled
documents, a Part 11 audit trail on every action, drafting assistance from
Claude, and an eCTD sequence you can validate before it leaves your hands.

### Two ways to buy

**Submission** — one fixed fee for one submission-shaped deliverable. You
bring the data and the regulatory judgement; the platform carries the
documents, the review record and the sequence. Priced against what a
consultancy charges to assemble the same package.

**Platform** — an annual subscription for the whole lifecycle: amendments,
annual reports, the next sequence, and the controlled documents in between.

No per-seat fees. Bring QA, the medical writer and your consultant into the
same record without buying another licence.

### What every plan includes

- **Projects** — one place per program: journey, filings catalog, tasks.
- **Vault** — controlled documents with version history and governed export.
- **Authoring** — templates, a drafting engine that cites its sources, and a
  review workflow with reason-for-change on every governed action.
- **Submission Center** — dossier map, eCTD compile, co-authoring at
  eCTD granularity, publishing and gateway transmittal records.
- **Submission Readiness** — dispatch readiness, orchestration and
  cross-document inconsistency checks.
- **QMS controlled documents** — controlled SOPs and quality-plan documents
  under the same audit trail.
- A SHA-256-chained, HMAC-sealed audit trail; electronic signatures with
  server-side identity verification; a second factor on every login.
- A validation package (validation plan, IQ, OQ, traceability, summary
  report) and release notes for every release.
- AI drafting on approved, version-pinned models. Claude is the primary
  drafting model. Every figure, verdict and validation result comes from a
  deterministic engine, never from the model.

### What is not in this release

Device eSTAR assembly, CER/PER authoring, predicate intelligence,
global-market planning, prediction-backed forecasts and pre-mortems, and
several specialist modules are in the product tree behind a flag that is
off in production. They are listed in the Apps catalog as "not in this
release" with no toggle and no upsell. Health-authority gateway
transmission is included only once our FDA ESG transport has been accepted
by FDA's test environment; until then you transmit through your own ESG
account or vendor and the platform says so.

### Honest notes for buyers

- We are a new company. Our security posture, including what we have not
  yet done, is published in `SECURITY.md`. We have no SOC 2 report and no
  third-party penetration test as of this page's date; both are on our
  launch list and we will say when they are done.
- Our validation package exists and is unsigned by an independent qualified
  reviewer as of this page's date. You are responsible for your own PQ,
  SOPs and training; we supply test scripts and a sandbox.
- AI output is a draft for a qualified human. Nothing becomes a governed
  record until a named user reviews it and signs.

---

## Part 2 — Current (in code) vs proposed (not in code)

### 2.1 Self-serve tiers (`DTC_PRICING`) — CURRENT, in code

| Tier id | Display name | Price | Annual discount | Users | Projects | Storage | Deep-research credits/mo | Builder credits/mo | Trial |
|---|---|---|---|---|---|---|---|---|---|
| `free` | Researcher | $0 | — | 1 | 2 | 1 GB | 5 | 0 | — |
| `standard` | Startup Biotech | **$499/mo** | 15% | 5 | 10 | 25 GB | 50 | 10 | 14 days |
| `professional` | Growth | **$1,499/mo** | 15% | 25 | 50 | 100 GB | 200 | 50 | 14 days |
| `enterprise` | Enterprise | custom (contact) | — | unlimited | unlimited | unlimited | unlimited | unlimited | 30 days |

### 2.2 Per-user tiers by industry archetype (`PRICING`) — CURRENT, in code

| Family (archetypes) | Standard | Professional | Enterprise | Min commitment |
|---|---|---|---|---|
| pharma (pharma, biotech, virtual_biotech, big_pharma, cro, regulatory, medical_writing) | $459/user/mo | $399/user/mo | custom | 3 mo / 3 mo / 12 mo |
| medtech | $349/user/mo | $299/user/mo | custom | 3 / 3 / 12 |
| academic | $149/user/mo | $119/user/mo | custom | 3 / 3 / 12 |

Bundle discounts on per-user pricing: 5+ users 10%, 10+ 15%, 25+ 20%,
50+ 25%. Annual discount 13% (20–25% on academic/enterprise).

Observations on the current tables, for the decision:

1. Two pricing surfaces exist for the same four tier ids (flat self-serve
   and per-user by archetype). The working agreement is one canonical
   implementation per capability; launch should ship one.
2. In the per-user table, Professional is priced *below* Standard in every
   family ($399 < $459; $299 < $349; $119 < $149). Whether that is a
   volume-ladder intent or an error, it will be read as an error by a buyer.
3. The per-user feature lists name capabilities that are not in the launch
   catalog ("CER Generation", "510(k) Module", "eSTAR Builder", "Custom AI
   Models", "On-Prem Option", "SLA Guarantee"). Whatever pricing ships, the
   feature copy must be regenerated from `shared/constants/launch-scope.ts`.
4. The free "Researcher" tier creates anonymous tenants on a regulated
   product with a fixed-cost Part 11 audit trail. Recommend it is not
   offered at launch (a 14-day trial on a paid tier serves the same purpose).

### 2.3 PROPOSED launch pricing — not implemented, founder decision required

| Offer | Proposed price | Includes | Positioned against |
|---|---|---|---|
| **Design-partner pilot** (first [3–5] customers) | **$15,000** fixed, 90 days, 100% credited on conversion within 30 days | Launch Catalog, up to 5 users, one program, weekly check-in, logo/case-study rights with approval | A paid proof, not a discount: the buyer's alternative is a $30–80K consultant project |
| **Submission — original** (IND-shaped or first sequence 0000) | **$25,000–$40,000** fixed per submission | Launch Catalog for the project team (up to 5 users) for 6 months; one assembled and validated sequence; readiness report; export | Consultant/publishing project $30–80K; outsourced eCTD sequence $10–50K |
| **Submission — lifecycle** (amendment, annual report, response) | **$15,000–$20,000** fixed per sequence | As above, 3 months of access, one sequence | Per-sequence publishing bureau $10–25K |
| **Platform — Standard** (`standard`) | **$1,250/mo, billed annually ($12,750/yr after 15%)** — proposed increase from $499/mo | Launch Catalog, 5 users, 10 projects, 25 GB, AI credits as today | Veeva Basics-class fixed-price editions and the $15–45K/yr small-biotech RIM band reported by third parties |
| **Platform — Professional** (`professional`) | **$3,500/mo, billed annually ($35,700/yr)** — proposed increase from $1,499/mo | 25 users, 50 projects, 100 GB, higher AI credits, priority support, sandbox tenant for customer PQ, inspection support hours | Growing biotech 3–8 RA users on incumbent RIM ($45–120K/yr, third-party figure) |
| **Platform — Enterprise / Consultancy** (`enterprise`) | custom, **floor $60,000/yr** | Multi-client workspaces for consultancies, Bedrock placement for residency/ZDR, expanded audit and inspection support, custom validation support | Enterprise RIM |
| Free tier | **withdrawn at launch** (proposal) | — | — |

Submission fees are proposed as credits toward a Platform subscription
signed within 60 days of sequence validation (e.g. 50% of the submission
fee credited), so the wedge converts into lifecycle revenue.

### 2.4 What changes in code if the proposal is adopted

`DTC_PRICING[].baseMonthly` for `standard` and `professional`; withdrawal or
gating of the `free` entry; retirement or regeneration of `PRICING` (per-user)
and its feature strings; new Stripe products/prices for the per-submission
SKUs (one-off invoices, not subscriptions); the fixtures file regenerated
from the kit. None of that is in this workstream; it is a code change under
the founder's decision.

---

## Part 3 — Rationale for the proposal

1. **Price against the alternative, not against seats.** The buyer this
   product is for — the one-to-three-person regulatory team at a pre-IND or
   first-510(k) sponsor, or a boutique consultancy — does not buy per-user
   RIM. They buy a consultant project ($30–80K per 510(k), $10–50K per
   eCTD sequence, $3–8K per CER, per `docs/COMPETITIVE_LANDSCAPE_2026-08.md`
   §7) or they do it in Word. A fixed per-submission fee at $15–40K is
   legible to that buyer and sits inside their existing budget line.
2. **$499/month is the wrong signal for a GxP system of record.** It reads
   as a productivity tool. The buyer's own validation overhead for any
   GxP system is reported in the $15–30K/year band (`COMPETITIVE_LANDSCAPE`
   §6), and the platform's cost per governed action (model inference,
   validated release process, audit retention, inspection support) is not
   a $499 cost. An entry tier above $1,000/month with no per-seat fee still
   undercuts the small-biotech RIM band.
3. **No per-seat fee is a positioning choice.** The most-cited grievance
   about incumbent RIM is paying twice for one person across modules
   (`docs/commercial/RIM_COMPETITIVE_PACKAGING_RESEARCH_2026-08-23.md` §2.2).
   Tiering by users-included, projects and storage keeps the ladder honest
   without punishing QA for reading a document.
4. **AI is included, not an add-on.** The market leader bundles AI at the
   platform level to drive adoption; pricing AI as a premium add-on fights
   that giveaway. The differentiator sold is *approved-model governance
   with evidence*, which is a property of the platform, not a SKU.
5. **The pilot is paid.** A free pilot produces no D10 evidence ("a signed
   pilot with a fee"). $15,000 is low enough for a Series A regulatory
   budget to approve without a board, high enough to require a named
   sponsor who will use it.
6. **Credits convert the wedge.** Every fixed fee credits toward the next
   purchase so that the first sequence becomes the lifecycle subscription
   (moat item 3 in `COMPETITIVE_LANDSCAPE` §6).

Numbers marked "third-party" come from the research file cited and are
indicative, not audited.

---

## Part 4 — What each launch app includes, and what is excluded

### Included (Launch Catalog, `shared/constants/launch-scope.ts`)

| App | Surfaces | What the buyer gets |
|---|---|---|
| Projects | projects, project-home, program-journey, filings-catalog, tasks | One workspace per program with the journey, the filings it will need, and the tasks to get there |
| Vault | vault, artifacts-center | Controlled documents and generated artifacts with version history, governed export and audit |
| Authoring | document-authoring, authoring-engine, template-library, review, regulatory-workspace | Template-driven drafting with source-cited AI assistance, review and approval with reason-for-change |
| Submission Center | submission-center, dossier-map, ectd-compile, ectd-coauthor, ectd-publishing, gateway-transmittals | Dossier planning, eCTD compilation and validation, co-authoring at eCTD granularity, publishing output, and the transmittal record |
| Submission Readiness | dispatch-readiness, orchestration, inconsistency | Readiness verdicts, orchestration of the steps to dispatch, and cross-document inconsistency findings |
| QMS controlled documents | quality, qmp | Controlled quality documents and quality-management plans under the same audit trail |

Always on for every tenant (shell surfaces): AnA conversation and command
surfaces, audit trail, Part 11 console, admin console, onboarding, billing,
usage, licensing, access requests, training, identity console.

### Explicitly not in this release

- Device/IVD eSTAR and 510(k) assembly surfaces; CER/PER authoring;
  predicate intelligence; GSPR mapping.
- Global-market planner; report families; Regulatory Forecast and CRL/RTF
  pre-mortem (prediction-backed); scheduled reports; portfolio rollup.
- The regulatory digital twin, epistemic / causal / self-evolving engines,
  federated learning and the manufacturing digital twin.
- Health-authority gateway transmission until launch row **D7** is green.
- EU or non-US hosting; self-hosted/on-prem inference; Vertex and Azure
  placements (present in code, not deployed).
- Any model other than the approved primary (Claude Opus 5, pinned) and its
  validated fallbacks for high-risk regulatory drafting; other approved
  entries are capped below high-risk until their PQ executes.
- The Claude connector (remote MCP server) until launch row **D8** is green.

Live count from the launch-scope evidence (2026-09-20, local instance):
86 catalog cards, 20 on, 66 "not in this release".
