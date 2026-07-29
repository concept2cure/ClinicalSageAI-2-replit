# Dev Recipe — Seeing Document-Type Detection & the Studio

**Purpose:** a shared reference frame so Design and engineering look at the *same* thing when working on the document-type-detection surface (Work Order WO-ANA-DTD-01). It covers how to turn the surface on, the golden prompts that deterministically trigger detection, what to observe at each layer, and how to capture a screenshot.

**Companion docs (this folder):** `WORK_ORDER_doc-type-detection.md` (governing — WO-ANA-DTD-01), `DESIGN_INSTRUCTIONS_doc-type-detection.md`, `ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md`.

---

## 1. Two layers, two switches

Detection and the Studio are **independent** — know which you're looking at:

| Layer | What it is | Requires flag? | Requires a draft artifact? |
|---|---|---|---|
| **Detection chip** | The "Drafting: X" chip on the assistant message + the metadata payload | **No** — detection always runs server-side | No |
| **Document Studio** | The split-pane right rail (preview + trust panels) | **Yes** — `ENABLE_ANA_DOCUMENT_STUDIO` | Yes — opens on an `artifact_draft` event |

So you can exercise **detection** (chip + the new `sections[]` payload) with no flags at all. You only need the flag + a generated draft to see the **Studio**.

---

## 2. Turn on the Studio (for Studio work)

The flag lives in `client/src/flags/featureFlags.ts`, default `false`:

```ts
ENABLE_ANA_DOCUMENT_STUDIO: { …, defaultValue: false, enabled: false }
```

Two ways to enable in a dev build:
- **Quick (local only):** flip `enabled: true` for `ENABLE_ANA_DOCUMENT_STUDIO` in `featureFlags.ts`. Don't commit it.
- **Per-org (production-shaped):** enable it on the org via `organizations.settings.features` (Build 3 path — see advisory §13.2). Use this when validating the real enablement flow.

Both fail closed; nothing is visible to users until set.

---

## 3. Run the app

```bash
npm run dev        # → source scripts/startup.sh && main && tsx server/index.ts
```

> Requires a full install (`node_modules` with dev deps). The tokenized UI renders through `client/src/concept2cure/design/claude-design.css`; the AnA surface is `client/src/concept2cure/components/ana/`.

---

## 4. Golden prompts (deterministic detection)

These phrases are covered by the detection unit tests (`server/services/ana-ri/__tests__/document-templates.test.ts`), so they detect reliably. Use them as the shared reference set:

| Prompt | Detects (`chipLabel`) | Template id |
|---|---|---|
| `draft a clinical overview for the NDA` | Clinical Overview | `ctd_2_5_clinical_overview` |
| `draft the quality overall summary` | QOS 2.3 | `ctd_2_3_qos` |
| `draft an investigator's brochure` | (IB) | `ind_investigator_brochure` |
| `draft a phase 1 clinical protocol` | (Phase 1 Protocol) | `ind_phase1_protocol` |
| `cmc drug substance section` | (CMC Drug Substance) | `cmc_drug_substance` |
| `draft a 510(k) substantial equivalence statement` | (510(k) SE) | `fda_510k_se_statement` |
| `write the dsur for this ind` | (DSUR) | `dsur` |

**Negative control** (must detect *nothing* — verifies the null state): `What are the risks of this drug?`, or the bare word `clinical`. The chip and any primed Studio state must be absent.

---

## 5. What to observe

**Detection chip (`Message.tsx`).** On a golden prompt, the assistant row shows the `.docTypeChip` — "Drafting: Clinical Overview" — appearing on the `orchestration` SSE event, *before* the first token. (This is the WO-1 surface. It now uses a token-driven class, not the old phantom `--ana-accent`.)

**The payload (WO-3 data source).** Open DevTools → Network → the `/api/ana-ri/stream` EventStream. The `orchestration` event now carries `detectedDocumentTemplate.sections[]` — each with `heading`, `code`, `required`, `targetWords`. This is the data the section-outline surface binds to. On the client it lands on the message as `detectedDocumentTemplate` (see `useAnaChat.ts` / `AnaChatMessage`).

**The Studio (flag on + a draft).** When a workstream produces a draft (advisory §13.3 — fixtures drive the demo path), the right pane opens as `DocumentStudioPane`. Note: today it does **not** yet consume the detected type — wiring that is WO-2.

---

## 6. Screenshot for design review

Chromium + Playwright are preinstalled in this environment (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; do **not** run `playwright install`). A minimal capture once the dev server is up:

```js
// screenshot.mjs — node screenshot.mjs
import { chromium } from 'playwright';
const b = await chromium.launch();               // uses /opt/pw-browsers chromium
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:<port>/…ana route…');
// drive a golden prompt, wait for the chip, then:
await p.screenshot({ path: 'ana-detection.png', fullPage: false });
await b.close();
```

Capture light **and** dark (the surface is theme-aware; toggle via the app's theme control or `data-theme` on `:root`). Attach both to any design proposal so the review is grounded in the real render, not a mockup.

---

## 7. What shipped vs what's open

- **Shipped (this PR):** detection + `sections[]` on the wire + shared type (`shared/types/ana-document-detection.ts`) + the de-phantom chip class (`.docTypeChip`).
- **Open (Work Order):** WO-1 final chip treatment, WO-2 Studio priming from detection, WO-3 section-outline surface, WO-5 confidence + null-state polish.
