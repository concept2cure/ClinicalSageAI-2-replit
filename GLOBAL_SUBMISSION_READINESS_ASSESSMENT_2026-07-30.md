# Global Submission Readiness Assessment — 2026-07-30

Scope: the Submission Center end-to-end — multi-region eCTD (US/EU/JP/CA and
beyond), agency transmission + inbound correspondence, and how the project
management module drives tasking by filing type.

**Method:** code-evidence only (file:line verified against `concept2cure-v2`).
This assesses what is **built**, not what has been **validated against live agency
sandboxes** — that distinction is load-bearing and is called out per item.

---

## Verdict

The architecture is strong and unusually honest — it fails closed rather than
faking readiness. The gap to live global filing is dominated by **licensed
artifacts and agency credentials**, not missing code. The one genuine
architectural debt is **three disconnected task/tracking systems**.

| Capability | State | Blocker class |
|---|---|---|
| Multi-region eCTD structure (US/EU/JP/CA) | 🟢 Built | — |
| Transmission gateways (12 regions) | 🟡 Uneven | Credentials + sandbox validation |
| eCTD validation (agency-grade) | 🔴 Blocked | Licensed DTDs + validator endpoints |
| Inbound letters / correspondence | 🟡 Built, narrow | Portal integrations |
| PM ↔ tasking by filing type | 🟡 Strong, fragmented | Architecture |

---

## 1. Submission Center — eCTD to US, EU, Japan, Canada

### Built

- **Four regional Module 1 backbones**, each spec-cited
  (`server/services/submission-gateways/regional-packager.ts`):
  - US `us-regional.xml` — FDA eCTD Backbone Files Spec, DTD v3.3 (+XSL)
  - EU `eu-regional.xml` — EU eCTD Spec v3.0, `m1/eu/`
  - **JP** `jp-regional.xml` — PMDA electronic submission notification
  - **CA** `ca-regional.xml` — Health Canada guidance, `m1/ca/`, CESG transport
- **15 market specs** (`market-specs/market-submission-specs.ts:137+`):
  us/eu/jp/ca/uk/ch/au/cn/br/sa/kr-ectd, us-estar, eu-mdr, eu-ivdr, eu-ctis.
- **All four client segments** (`shared/regulatory/client-segments.ts:58`):
  device, ivd, biotech, pharma — with pathway engines for eCTD, eSTAR, CTIS,
  MDR/IVDR technical documentation, and PMDA Shōnin.
- **Governed transmit** (`submission-gateways/index.ts:33-66`): refuses to
  transmit without a verified human actor, a stated reason, and a
  re-authentication timestamp. Real 21 CFR Part 11 discipline.
- **Pre-transmit gate** (`pre-transmit-check.ts`): gateway size limit, PDF/A
  submission grade, DTD self-containment, external eValidator result.
- **Qualification harness** with pinned spec versions
  (`ectd/qualification/qualify.ts:54-63`) — FDA Validation Criteria v4.5
  (2025-10-01), File Format Types v9.3, eCTD v4.0 Regional IG OID.

### Gaps

1. **eCTD DTDs are not vendored.** `assets/ectd-dtd/` contains only README +
   checksums + fixtures. Every generated package therefore references DTDs it
   does not contain, and `validateEctdPackage` correctly flags it **not
   submission-ready**. *Fix: licensed-artifact drop, no code change.*
2. **No agency-grade validation is running.** FDA eValidator, EMA validation and
   PMDA precheck are each gated on a `*_VALIDATOR_URL` env var
   (`validator-registry.ts:63-80`); only the in-process structural validator is
   always available. Nothing has been checked against real agency criteria.
3. **Transport maturity is uneven.** FDA ESG is substantial (768 lines:
   hand-rolled AS2/RFC 4130, mTLS, PKCS#7, SFTP fallback, ack1/2/3). EMA CESP
   541, HC 381, PMDA 376. The other nine (MHRA, NMPA, TGA, Swissmedic, ANVISA,
   CDSCO, MFDS, HSA) are ~170–190 lines over a shared `httpsRequest` helper —
   they satisfy the interface, but there is no evidence any has been exercised
   against a real agency endpoint.

---

## 2. Letters and communications with agencies

### Outbound
Governed authorization → transmit → transmittal record → acknowledgement
filename convention (`acknowledgement.ts`). Every gateway implements
`downloadAcknowledgment(transmittalId)` as part of the contract
(`types.ts:260-279`).

### Inbound
A real module exists — **Regulatory Correspondence OS**
(`server/routes/regulatory-correspondence.ts`, 13 endpoints):

- `/correspondence/intake` — three channels: `manual_upload | mailbox_sync | api_import`
- issue-parser → `/issues/:id/review` → `/response-packages` (compiler)
- `/timeline`, `/analytics/deficiency-patterns`, `/mailbox-connections`
- FDA ack ladder modeled correctly in ESG: **ack1** receipt → **ack2**
  virus/structure → **ack3** center acceptance

Critically, correspondence is **connected to work**: `operating-layer.ts` turns a
letter into blockers + work items + a readiness penalty, with canonical task
types including `correspondence_triage`, `issue_review`, `section_revision`,
`regulator_follow_up`, `mailbox_sync_exception`.

### Gaps

1. **Feature-flagged off** — `REG_CORRESPONDENCE_ENABLED`; returns 403 when disabled.
2. **Inbound is read-only Gmail only** (`GMAIL_OAUTH_JSON`,
   `integrations/correspondence-search.ts:93`). Letters that arrive in **agency
   portals** — CESP, MHRA Product Submissions, PMDA Gateway, HC CESG — are not
   polled. For EU/JP/CA this means transmit-out exists but automated receive-in
   does not.
3. **Correspondence work items borrow `sourceType: 'review_task'`**
   (`operating-layer.ts:156`), so correspondence-driven work is not
   distinguishable from document review in the work-item spine.

---

## 3. Project management ↔ tasking ↔ filing type

### Built (stronger than expected)

`project_schedule_of_events` + `project_milestones` are driven by
**filing-type-keyed templates** (`projects/schedule-of-events/templates.ts`):

`IND · NDA · BLA · 510K · PMA · DE_NOVO · CER · IVDR · MAA · SHONIN · NDS ·
Q_SUB · IDE · 513G · EUA · GENERIC`

Each milestone carries `category` (internal/regulatory/clinical/quality/
submission), `offsetDays`, `isCritical`, **`regulatoryBasis`** (real citations —
21 CFR 312.20, 312.40(b), 314.50, 814.20, 812.20, PMD Act Art. 14, C.08.002),
`ownerRole`, and **`dependsOn`** (a real dependency graph). A background sweep
(`jobs/scheduleOfEventsSweep.ts`) re-assesses milestone health, marks slips, and
opens recovery/mitigation tasks automatically.

### The architectural debt: three disconnected systems

| System | Driven by | Writes to | Knows about |
|---|---|---|---|
| Schedule of events | **Filing type** (16 pathways) | `project_tasks` | Milestones, dates, dependencies |
| Work items / blockers | Review + correspondence | `c2c_project_work_items` | Artifacts, CTD sections, approvals |
| eSTAR filing tracker | Catalog key | `estar_submissions` | Filing status, FDA review clock |

They do not share a spine. A milestone slip, a review blocker, and a filing's
review clock on the same submission live in three tables with three lifecycles.

*Partially addressed 2026-07-30:* `estar_submissions.project_id` now links the
filing tracker to the project (migration
`20260730_estar_submission_project_link.sql`), so filings are at least
correlatable with their project. The `project_tasks` ↔ `c2c_project_work_items`
split remains.

---

## What still needs to be done

### Tier 1 — unblocks real submissions (procurement, not code)
1. **Vendor the eCTD DTDs** → `assets/ectd-dtd/`. Flips packages to
   DTD-self-contained and submission-ready.
2. **Configure one agency validator** (`FDA_VALIDATOR_URL`) → the first
   agency-grade validation the platform has ever run.
3. **Vendor the FDA eSTAR/PreSTAR templates** → `assets/estar-templates/`. eSTAR
   production is already wired and flips from fail-closed to live with **no code
   change** (the gate reads `result.filled`).

### Tier 2 — real code gaps
4. **Unify the task spine** — add `submission_milestone`, `gateway_blocker` and
   `correspondence` source types, and converge `project_tasks` with
   `c2c_project_work_items` so filing milestones, transmit blockers and agency
   letters land in one place. *(Needs product agreement — two mature systems.)*
5. **Portal-based inbound** for EU/JP/CA (CESP / PMDA Gateway / CESG polling) so
   receive-in is not Gmail-only.

### Tier 3 — hardening
6. Exercise the nine thin gateways against agency sandboxes before claiming
   multi-region transmission.
7. Enable `REG_CORRESPONDENCE_ENABLED` once mailbox governance is signed off.

---

## Changes landed alongside this assessment (2026-07-30)

- **JP + CA + device-request schedule templates** — Japan (Shōnin) and Canada
  (NDS) had full eCTD backbones but no planning blueprint; Q-Sub / IDE / 513(g)
  had none either. Added with real regulatory citations and name aliases.
- **Fixed four dangling milestone dependencies** (pre-existing) caught by a new
  graph-integrity test: derived templates (BLA, MAA, De Novo) renamed or dropped
  milestones without remapping `dependsOn`, so those critical-path edges were
  silently ignored by the generator. Replaced ad-hoc derivation with
  `deriveMilestones()`.
- **Linked eSTAR filings to projects** (`project_id` + index + service/route/
  client filter), closing part of the tracking-island gap.
