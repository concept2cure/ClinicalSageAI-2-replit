# AnA document/template tool gap audit — 2026-08-11

Coverage audit of AnA's document- and template-generation surface across every
major regulatory submission family. Five parallel auditors each owned a family
and worked from one canonical inventory of the **705 tool names** defined across
74 files in `server/services/ana/`, so a gap claimed here means "no tool under
any naming convention I searched", not "I didn't find it by its obvious name".

Every claim below carries `file:line` evidence. Where a tool exists but stops
short of producing the document, it is marked PARTIAL with the specific
shortfall rather than being counted as coverage.

## Headline

Coverage is **broad and, in places, exceptional** — Module 2 summaries, FDA
forms, IVD analytics, 62304/PCCP/cybersecurity, and signal detection are all
stronger than a 705-tool surface would lead you to expect.

The gaps cluster into three kinds, and the distinction drives priority:

1. **Exposure gaps** — the engine exists and is tested, but no AnA tool reaches
   it. Wiring, not building. Highest value per unit of work.
2. **Enum-lag gaps** — a correct, general tool is artificially narrowed by an
   enum that has fallen behind the backend.
3. **True build gaps** — no implementation anywhere.

## 1. Exposure gaps — engine exists, tool does not

These are the cheapest real wins in the audit.

| Capability | Existing engine | Why it matters |
|---|---|---|
| PMCF Plan + Evaluation Report | `server/services/gspr-postmarket/pmcf-plan-generator.ts` (REST-only) | MDR-mandatory for nearly every notified-body client |
| SSCP | `post-market-authoring.ts:195` + SSCP-001 validator | MDR Art. 32 for Class III/implantable IIb; AnA can currently *reconcile* an SSCP it cannot produce |
| PDF submission compliance | `ectd/pdfa-detect.ts`, `pdfa-readiness.ts`, `pdf-bookmark-generator.ts` | PDF/A + bookmark defects are a top eCTD technical-rejection cause |
| CRF / eCRF + annotated CRF | `server/services/study-design/crf-shell.ts` | No tool reaches the existing shell engine |
| WHO PQ / cross-jurisdiction reliance | `cross-jurisdictional-intelligence.ts` | Reachable only from `ana-ri/command-executor.ts`, never from a tool |

`server/services/ectd/` holds ~30 modules of which roughly a third are
tool-exposed. The backend is materially ahead of the tool surface.

## 2. Enum-lag gaps — right tool, stale enum

| Tool | Current enum | Backend reality |
|---|---|---|
| `package_ectd_for_region`, `transmit_submission` | `fda\|ema\|pmda\|ca` | 10 gateways ship: `mhra-`, `nmpa-`, `tga-ebs-`, `anvisa-`, `swissmedic-egateway`, `cdsco-sugam-`, `hsa-prism-`, `mfds-` |
| `cross_region_gap_analysis` | `fda\|eu\|jp` | Cannot answer "US → Canada / UK / China" despite being the right tool |
| `assemble_briefing_book` | omits `scientific_advice` | `create_ha_interaction` already supports it — a one-value fix |
| `compare_global_pathways` vs `lookup_regulatory_pathway` | 8 markets vs 9 agencies, **non-identical lists** | MHRA/Swissmedic in one, MFDS in the other |

Widening enums is the single highest leverage change in this audit: one edit
unlocks eight jurisdictions whose gateways already exist.

## 3. True build gaps, ranked by client value

1. **CRL response package** — the highest-stakes FDA event. Only pre-mortem
   *prediction* exists (`assemble_crl_premortem_artifact`); nothing assembles
   the response.
2. **General submission cover letter** (IND/NDA/BLA/MAA/amendment) — the only
   composer is 510(k)/eSTAR-bound (`coverLetterTools.ts:18`); `generate_document`'s
   enum has no `cover_letter`, so there is no generic fallback.
3. **DMF / ASMF authoring + Letter of Authorization** — every small-molecule
   sponsor needs it; absent from the tool surface.
4. **EU-RMP document generator** — REMS has a full `design_rems`; the EU
   equivalent stops at advisory scaffolding.
5. **DHF / 21 CFR 820.30 design controls** for standalone devices — today
   reachable only through the combination-product tool.
6. **Efficacy supplement / sNDA** — change *classification* exists, authoring
   does not; recurring, billable RA work on every marketed product.
7. **IDMP / ISO 11615-11616-11238 (+xEVMPD/SPOR)** — zero coverage, no substitute
   anywhere in the 705.
8. **Advisory Committee briefing document** — a six-figure deliverable with zero
   tool hits.
9. **Standalone HFE/usability file + URRA (IEC 62366-1)** — a top RTA driver;
   current tool assumes a drug-delivery constituent.
10. **EU application form (eAF)** — FDA M1 forms are fully wired (18 forms); the
    EU M1 equivalent is not, blocking an end-to-end MAA.

Also confirmed missing, lower volume: carton/immediate-container labelling text
(drug), Package Leaflet (Annex IIIB), 3.2.A/3.2.R, Orange Book patent
certification, cleaning validation, batch record/CoA review, ICH Q9 QRM
document, meeting minutes, formal dispute/appeal letter, CIOMS I, literature
monitoring report, J-RMP, Health Canada CPID, hyperlink generation.

## 4. Naming hazards worth fixing

Several tools are near-undiscoverable or actively misleading — a real problem
when tool selection is driven by lexical relevance (see §5):

- `advise_risk_management` is **pharma REMS/EU-RMP**, not ISO 14971 — the
  CMC/device risk vocabulary is unclaimed (`evidence-literature-tool-defs.ts:583`).
- `create_dms_plan` reads as a clinical Data Management Plan but is the **NIH
  grants** DMS plan (`notifications-study-memory-tool-defs.ts:587`).
- The **DSMB charter** exists only as one enum value inside a *statistics* tool.
- `generate_document` accepts `cer`/`510k`/`pma` but is a generic DOCX renderer
  with no device section logic — it should not be counted as device coverage.
- `compose_correspondence_cover_letter` is 510(k)-specific despite a generic name.

## 5. Why naming matters more here than in most codebases

`selectToolsForTurn` (`server/services/ana/tool-selection.ts`) offers roughly 50
of the 705 tools per turn, ranked by lexical relevance scored from each tool's
own **name and description** (name matches weigh 3×, description 1×). A tool
whose name does not contain the words a user would use is systematically
under-selected. Misleading names are therefore not cosmetic — they are a
retrieval defect.

The always-on core plus `execute_platform_command` guarantees nothing becomes
truly unreachable, but a mis-named tool still loses its natural turn.

## 6. Registry defect found during the audit (fixed in this change)

Three tool names are defined twice. `ALL_ANA_TOOLS` dedupes first-occurrence-wins,
so the later definition is **silently discarded** — its author's schema never
reaches the model.

| Tool | Winner (spread first) | Silently shadowed |
|---|---|---|
| `screen_signal_panel` | `statisticalDesignTools` @2494 | `ivdLifecycleTools` @2506 |
| `generate_define_xml` | `extendedRegulatoryTools` @2536 (v2.0) | `cdiscTools` @2567 (v2.1) |
| `run_cdisc_pipeline` | `advancedModelingTools` @2548 | `cdiscTools` @2567 |

The shadowed `screen_signal_panel` additionally had **`b` and `c` transposed**
relative to the 2×2 convention its own implementation uses
(`stats/signal-disproportionality.ts:11-13`). Because
`PRR = [a/(a+b)]/[c/(c+d)]` is not symmetric in `b`/`c`, that swap would skew
PRR, χ², IC and EBGM. ROR (`ad/bc`) would have survived unchanged, which is
exactly the kind of partial agreement that makes such a bug hard to spot.

It was not live — the correct definition wins today purely because of spread
order. Reorder those two lines in a refactor and post-market signal detection
starts returning wrong numbers with no test failing.

**The guard that should have caught this could never fire.** The existing
assertion tested `ALL_ANA_TOOLS`, which is deduped before the test sees it, so
duplicates were invisible to it by construction.

Fixed here:
- Corrected the transposed `b`/`c` descriptions and documented the cell order.
- Exported `ALL_ANA_TOOLS_RAW` and added a pre-dedupe collision assertion with a
  documented allowlist of the three known cases — so a **new** collision fails
  the build. The allowlist may shrink, never grow.
- The new guard was verified to fail when the allowlist is emptied, confirming
  it is not itself vacuous.

The two CDISC collisions are left in the allowlist deliberately: the dedupe note
in `AnaToolDefinitions.ts` marks them as owned by an in-flight CDISC refactor,
and pre-empting that refactor from here would be the wrong call.

## Recommended sequence

1. Widen the region/gateway enums (§2) — largest unlock per line changed.
2. Wire the five exposure gaps (§1) — engines exist and are already tested.
3. Rename or alias the misleading tools (§4) — cheap, and it directly improves
   turn-level tool selection.
4. Then build from §3 in the listed order.
