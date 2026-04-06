# Apps Catalog Convergence Proof

**Date:** 2026-04-06
**Scope:** Consolidate 25 catalog apps → 20 use-case-based apps across 4 SME-correct categories.
**Plan source:** `/root/.claude/plans/linear-hugging-firefly.md`

## What Changed

### Catalog: 25 → 20 apps

**Two safe Tier-D merges (only chat-first apps converged):**

| New Hub | Replaces | Saves |
|---|---|---|
| `device-strategy` (Device Strategy & FDA Engagement) | `device-pathway` + `q-submission` + `predicate-finder` | 2 entries |
| `device-engineering` (Device Engineering) | `risk-management` + `samd-cybersecurity` + `human-factors` + `biocompatibility` | 3 entries |

**Net:** 25 − 5 = 20 apps. Zero backend touched.

### 17 Backend-Rich Apps Kept Distinct

After SME code audit, these were preserved because each maps 1:1 to a real backend route, tool panel, workspace view, or embedded module. Merging would have broken wiring:

- `medical-device` (embedded hosts), `ind-authoring` (`/api/ind-*`), `cmc` (`/api/cmc-dashboard-prisma`), `safety-narrative` (`/api/safety-narratives`), `report-engine` (`/api/report-os`)
- `precedent-intelligence` (`/api/regulatory-precedent-intelligence/*`), `csr-intelligence` (`csr-workflow` view)
- `regulatory-intelligence` (`intelligence` panel), `biostatistics` (`ana-biostats` panel), `protocol-designer` (`protocol` panel)
- `ectd-navigator` (`ectd` panel), `dossier-navigator` (`dossier-map` view), `document-vault` (`vault` view)
- `sop-management`, `capa-management`, `post-market`, `inspection-readiness` (each maps to a distinct tool panel — 1:1 invariant)
- `deep-research` (chat mode)

### Recategorization

Old 4 categories → new 4 SME categories:

| Old | New | Apps |
|---|---|---|
| Featured | **Strategy & Research** | Deep Research, Precedent Intelligence, Device Strategy & FDA Engagement (3) |
| Authoring | **Submission Authoring** | Medical Device & Diagnostics, IND Authoring, CMC, Safety Narrative, Report Generator (5) |
| Intelligence | **Intelligence & Analysis** | Regulatory Intelligence, CSR Intelligence, Biostatistics, Protocol Designer (4) |
| Specialist | **Quality & Lifecycle** | Device Engineering, Dossier Navigator, eCTD Navigator, Document Vault, SOP Management, CAPA Management, Post-Market & Vigilance, Inspection Readiness (8) |

**Final shape:** 20 apps in 4 categories: 3 / 5 / 4 / 8.

## Files Modified

| File | Change |
|---|---|
| `client/src/concept2cure/pages/AppsPage.tsx` | APPS array rewritten (25→20), Category type renamed, CATEGORIES list relabeled, ICON_MAP updated, 5 unused Lucide imports removed (`Crosshair`, `Code2`, `Users`, `TestTube`, `MessageCircle`) |
| `client/src/concept2cure/ZenApp.tsx` | AppsPage onNavigate: added `device-strategy` and `device-engineering` cases with rich multi-capability prompts. The 7 Tier-D legacy IDs (`device-pathway`, `q-submission`, `predicate-finder`, `risk-management`, `samd-cybersecurity`, `human-factors`, `biocompatibility`) are now fallthrough cases on the merged hubs |
| `client/src/concept2cure/hooks/useProjectApps.ts` | Renamed `cmc-platform`→`cmc`, `csr-builder`→`csr-intelligence` to match global catalog. Added 2 device hubs (tracks: 510K/PMA/DE_NOVO/EUA/IVDR). Fixed CATEGORY_META hex colors from indigo/cyan/violet/emerald to stone palette (#1c1917/#44403c/#57534e/#78716c) |
| `server/routes/concept2cure.ts` | `KNOWN_APP_IDS` rewritten with the 20 canonical IDs grouped by category, 12 legacy IDs as back-compat block (with arrow comments showing canonical mapping), and 2 preserved pre-existing IDs (`compliance-monitor`, `evidence-engine`) |
| `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx` | `APP_MENTIONS` updated: removed `@510k`/`@pma`/`@cer` (replaced by `@medical-device`), renamed `@precedent`/`@safety`/`@biostats`/`@vault`/`@ectd`/`@protocol` to canonical IDs, added `@device-strategy` + `@device-engineering` |
| `config/ui-surface-registry.json` | Updated apps destination notes documenting the 25→20 convergence, the 4 catalog sync, and the back-compat strategy |

## Domain Prompts (Multi-Capability)

### `device-strategy`
> "I can help you with device strategy and FDA engagement: classify your device (Class I/II/III), determine the right regulatory pathway (510(k), De Novo, PMA, HDE, or Exempt), look up FDA product codes, find predicate devices and build substantial equivalence comparison tables, and prepare an FDA Pre-Submission (Q-Sub) package with feedback questions and meeting prep. What would you like to start with?"

### `device-engineering`
> "I can help with the four core engineering disciplines for medical devices: ISO 14971 risk management (Risk Management Plan, hazard analysis, FMEA for design/process/use, risk control matrix, Risk Management Report), IEC 62304 software lifecycle and FDA cybersecurity premarket guidance (software classification Class A/B/C, threat modeling, SBOM, vulnerability management), IEC 62366-1 human factors and usability (use specification, task analysis, use error analysis, formative studies, summative validation), and ISO 10993 biocompatibility (contact category and duration, biological endpoint selection, test methods, Biological Evaluation Report). Which discipline would you like to start with?"

## Verification Results

### 1. Catalog ↔ AppsPage onNavigate Switch Parity
```
Catalog count: 20
Switch cases (canonical + 7 legacy): 27
Catalog IDs missing from switch: 0
Legacy back-compat cases: 7 (device-pathway, q-submission, predicate-finder, risk-management, samd-cybersecurity, human-factors, biocompatibility)
```
**PASS** — Every canonical ID has a case; every legacy ID falls through to its merged hub.

### 2. AppsPage Catalog ⊆ KNOWN_APP_IDS
```
KNOWN_APP_IDS: 33 (20 canonical + 12 legacy + compliance-monitor + evidence-engine)
Catalog IDs missing from KNOWN_APP_IDS: 0
```
**PASS**

### 3. useProjectApps Catalog ⊆ KNOWN_APP_IDS
```
Project catalog: 11 (deep-research, precedent-intelligence, device-strategy, device-engineering, medical-device, safety-narrative, biostatistics, csr-intelligence, cmc, compliance-monitor, evidence-engine)
Project IDs missing from KNOWN_APP_IDS: 0
```
**PASS**

### 4. @-Mention List ⊆ AppsPage Catalog
```
@-mentions: 11 (deep-research, precedent-intelligence, device-strategy, medical-device, device-engineering, cmc, safety-narrative, biostatistics, protocol-designer, document-vault, ectd-navigator)
Mentions not in canonical catalog: 0
```
**PASS**

### 5. Tool Panel 1:1 Preservation
| Panel | Call sites in ZenApp.tsx |
|---|---|
| `ana-biostats` | 4 |
| `intelligence` | 1 |
| `protocol` | 1 |
| `ectd` | 1 |
| `sop` | 1 |
| `capa` | 1 |
| `pms` | 1 |
| `inspection` | 1 |

**PASS** — All 8 tool panels still have at least one `setActiveToolPanel` call site. Zero panels lost.

### 6. Color Audit
```
$ grep -n "blue-|violet-|indigo-|cyan-|teal-|emerald-" \
    AppsPage.tsx ZenApp.tsx AnaPersistentPanel.tsx useProjectApps.ts \
  | grep -v "//\|prose-"
(no output — zero non-stone colors)
```
**PASS** — Includes the CATEGORY_META hex color fix in useProjectApps.ts (was indigo/cyan/violet/emerald, now stone palette).

## Back-Compat Matrix

| Legacy ID | New Hub | Resolved By |
|---|---|---|
| `device-pathway` | `device-strategy` | Fallthrough case in AppsPage onNavigate |
| `q-submission` | `device-strategy` | Fallthrough case in AppsPage onNavigate |
| `predicate-finder` | `device-strategy` | Fallthrough case in AppsPage onNavigate |
| `risk-management` | `device-engineering` | Fallthrough case in AppsPage onNavigate |
| `samd-cybersecurity` | `device-engineering` | Fallthrough case in AppsPage onNavigate |
| `human-factors` | `device-engineering` | Fallthrough case in AppsPage onNavigate |
| `biocompatibility` | `device-engineering` | Fallthrough case in AppsPage onNavigate |
| `cmc-platform` | `cmc` | Listed in KNOWN_APP_IDS for stored project app connections |
| `csr-builder` | `csr-intelligence` | Listed in KNOWN_APP_IDS for stored project app connections |
| `510k-workspace` | `medical-device` | Existing fallthrough in main sidebar handler (line ~2160) |
| `pma-workspace` | `medical-device` | Existing fallthrough in main sidebar handler |
| `cer-generator` | `medical-device` | Existing fallthrough in main sidebar handler |

All 12 legacy IDs continue to resolve. Stored nav targets, command palette entries, slash command handlers, saved actions, and project app connections in localStorage all continue to work.

## What Was NOT Done

Per the SME audit findings, the following aggressive merges were intentionally **rejected**:

- ❌ Merging `sop`/`capa`/`pms`/`inspection` into one "Quality Management System" hub — would break the 1:1 tool panel invariant (`setActiveToolPanel` accepts one panel ID).
- ❌ Merging `deep-research` + `precedent-intelligence` + `regulatory-intelligence` + `csr-intelligence` into one "Research Hub" — each has distinct backend (`/api/deep-research`, `/api/regulatory-precedent-intelligence/*`, `/api/intelligence`, `/api/csr-intelligence-routes`).
- ❌ Merging `cmc` + `ind-authoring` + `safety-narrative` into one "Drug & Biologic Submissions" hub — distinct backends for each.
- ❌ Merging `ectd-navigator` + `dossier-navigator` + `report-engine` into one "Submission Assembly" hub — different render mechanisms (tool panel vs workspace view) and distinct backends.

**Result:** 25 → 20 (28% reduction) instead of the originally proposed 25 → 10 (60% reduction). The smaller reduction preserves every backend service, every tool panel, and every workspace view.

## Why This Convergence Is Better Than 25 → 10

| Concern | Aggressive 25→10 (rejected) | Conservative 25→20 (shipped) |
|---|---|---|
| Backend service preservation | High risk — 17 backends would need re-exposing | Zero backend touched |
| Tool panel 1:1 invariant | Broken (4-into-1 panel merges impossible) | Preserved |
| 4-catalog sync | Massive coordinated rewrite | Targeted rename + 2 new IDs |
| User capability loss | Possible | None |
| Visual catalog reduction | 60% | 28% |
| SME accuracy | Hubs become vague | Each app has a clear job |
| Implementation risk | High | Low |
