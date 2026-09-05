# Competitive position — what changed, and what still blocks parity

Companion to `docs/COMPETITIVE_LANDSCAPE_2026-08.md` (the market benchmark) and
`docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md` (the blocker register). That benchmark
established the 2026 table stakes per journey. This document is the honest delta: what
the remediation work actually moved, and what is still genuinely missing.

**Rule for this document:** a row only reads "closed" if a test asserts it. Everything
else is named as open, with the reason. The point of the exercise was to stop the
codebase from claiming more than it does; this file is held to the same standard.

---

## 1. The structural claim, re-tested

The benchmark's core finding was that the market splits into four silos — US submission
authoring, EU clinical evidence, RIM tracking, QMS — and **no competitor spans intake →
evidence → grounded drafting → official output → post-market**. That remains true.

What changed is our side of it. Before this work the platform *architecturally* spanned
the chain but could not be **walked**: the device journey had dead export buttons, the
CER surface was read-only, and the drug journey could not create a submission or a
sequence from any UI at all. Spanning the chain on an architecture diagram is not a
differentiator. Spanning it in a product is.

| Journey | Before | Now |
|---|---|---|
| 510(k) | Buttons sent prose to a chat; no intake; validator orphaned | Intake → AnA drafting → assembly verdict → governed export, one canonical route family |
| CER | One read-only surface, two working buttons | Six-tab workbench over the real MEDDEV backends, literature recording end-to-end |
| NDA/eCTD | No UI or tool could create a submission or sequence | Intake creates the spine; deliverables file into real sequences; governed freeze/dispatch |

## 2. Table stakes — closed vs open

### 510(k)
| Table stake (2026) | State | Evidence / blocker |
|---|---|---|
| Current eSTAR fill + version migration | **Asset-blocked** | Engine + registry + fail-closed gate built and tested; templates unvendored (runbook B1/B2) |
| RTA / completeness validation pre-submission | **Closed** | Filing-readiness + assembly contract with blockers; orphaned pseudo-validator deleted |
| Predicate identification from live FDA data | **Closed (reduced)** | openFDA client; labelled `reduced` when the external engine is absent — never presented as the full engine |
| Multi-user authoring, versioning, Part 11 audit | **Closed** | Stronger than any device-side competitor benchmarked |
| Guidance/standards mapping per product code | **Asset-blocked** | Classification lookup closed (live openFDA). Standards mapping: drop-point + whole-file-validating loader + org-scoped `GET /api/510k/device/standards` + intake panel built and tested; openFDA has no recognized-standards endpoint, so the FDA recognition list is a vendored asset and is unvendored (runbook B21) |
| Claim-to-source AI traceability | **Closed** | RAG with per-claim citations and surfaced ungrounded claims |

### CER
| Table stake | State | Evidence / blocker |
|---|---|---|
| Multi-DB literature search, screening, audit trail | **Closed (single-DB)** | Search + recording + screening all persisted. Screening: `literature_screening_decisions` (migration `20260814b`) holds one current decision per (org, entry, program, appraisal stage) with its reviewer, timestamp and — mandatory on an exclusion, by CHECK constraint — its MEDDEV §8 rationale; the old→new trail is chained through `auditService`. **"Multi-DB" is still one database**: PubMed only (`server/services/integrations/` has no Embase, Cochrane, Scopus or Web of Science client — all four are licensed). The CER flow's own check flags a single-database search as an NB deficiency (`cer-report.ts` `literature_search_fewer_than_2_databases_check`), so this row is not "Closed" outright |
| MEDDEV 2.7/1 rev 4 + Annex XIV structure | **Closed** | Rule packs + conformance validator + structure check wired to the workbench |
| AE/vigilance integration | **Closed** | FAERS/MAUDE live; EUDAMED honestly unavailable (no public API exists) |
| Live evidence tables → NB-acceptable export | **Closed** | Governed PDF/DOCX/ZIP via the MEDDEV style pack |
| PMS/PMCF linkage | **Closed** | Documentation status + generators live; the CER tab now reads the program’s complaint queue (`/api/capa-mdr/complaints`) and PMCF enrolment (`/api/post-market/…/pmcf-enrollment`), figures computed from the rows, absent when the rows cannot support them (2026-09-05, L5) |
| Human-in-loop AI with reviewable provenance | **Closed** | Governed accept-draft + audit chain — the thing pure-AI CER entrants fail NB review on |

### NDA / eCTD
| Table stake | State | Evidence / blocker |
|---|---|---|
| eCTD 3.2.2 assembly (backbone, lifecycle, STF, M1) | **Closed** | `qualify:ectd` passes all regions; four generators consolidated to one |
| Validation parity with eValidator/GlobalSubmit | **Licence-blocked** | Seam + FDA-criteria fallback built; LORENZ unlicensed (runbook B4) |
| ESG transmission + ACK tracking | **Open — engineering** | See §3: the path the product calls has no transport |
| Part 11 + vendor validation pack | **Mechanisms closed; pack open** | Single signature substrate, chained audit, §11.70 supersession; IQ/OQ evidence not produced |
| Word-native authoring with CTD templates | **Closed** | Authoring surface + place-into-filing |
| eCTD 4.0 roadmap | **Partial** | Builders exist; RPS XSD unvendored (B14) |

## 3. Two findings that change the sales story

Both surfaced from verification, and both contradict what I previously reported:

1. **The 510(k) transmit path the product calls has no transport.** The hand-rolled AS2
   implementation is real, but `mdx-command-handlers.ts` calls `ESGSubmissionService`,
   whose transmit throws not-implemented outside simulation. It fails closed, so nothing
   is fabricated — but after templates land, this is the binding constraint on a first
   real 510(k), and it is **engineering, not procurement**.
2. **E2B ICSR is likewise an engineering blocker**, not a credentials one: the transport
   throws precisely when a gateway *is* configured.

Do not sell "submits to FDA" until item 1 is closed. Everything upstream of transmit —
assembly, validation, governance, the audit trail — is real and demonstrable today.

## 4. Where the moat now actually stands

The benchmark ranked five candidate moats. Progress against them:

- **Proprietary outcome data** (the strongest): still unbuilt. Nothing yet captures
  (submission content → agency response). This remains the single highest-leverage
  differentiator and no competitor can buy it. Recommend it as the next strategic build.
- **Validated-system posture**: materially advanced. Single signature substrate,
  tamper-evident chain with the unchained writers closed, §11.50 manifest that actually
  works (it 500'd for every signature before), §11.70 supersession. The IQ/OQ pack is
  the remaining gap.
- **Lifecycle lock-in**: advanced. Intake now creates the submission spine and project
  anchor, so a program accrues sequences, leaves and artifacts from day one.
- **Consultant/CRO channel**: unstarted. Multi-client workspaces and per-submission
  pricing remain a product decision.
- **Template-chase automation**: the substrate is right (versioned catalog, fail-closed
  registry); the ingestion pipeline is not built.

## 5. Honest summary

The delta this work closed is *walkability and truthfulness*, not new capability
surface: most backends already existed and were unreachable, mislabelled, or silently
broken. Three journeys now run end to end with their refusals visible rather than
hidden. What remains between here and a first real filing is, in order: the eSTAR
templates and field map (procurement + a maintainer day), the ESG transport gap
(engineering), the eCTD DTDs and validator licence (procurement), and the IQ/OQ
validation pack (quality). None of those are architecture problems.
