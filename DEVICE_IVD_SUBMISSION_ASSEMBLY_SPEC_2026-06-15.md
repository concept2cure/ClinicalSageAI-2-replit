# Device & IVD Submission Assembly — Implementation Spec

**Date:** 2026-06-15
**Author:** Cross-functional review (global device/IVD regulatory, eCTD/eSTAR engineering, PM)
**Method:** Code-grounded against live branch `claude/medical-device-audit-spec-9w994x`. Every state claim checked against a file.
**Status:** Design only. **No code written.**
**Companion to:** `REPORTING_INTELLIGENCE_AUDIT_AND_SPEC_2026-06-15.md` (which covers the reporting/prediction layer). This spec covers the **other** gap that audit surfaced — the one that is genuine engineering rather than UI wiring, and that sits squarely in the medical-device/diagnostics/IVD domain.

---

## 0 — Why this spec exists (and why it's different from the reporting one)

The whole-platform audit found one consistent pattern: **strong, tested backends with no UI.** That pattern makes most gaps cheap to close (wire a UI). **Device/IVD submission *assembly* is the exception** — it is the one area where the gap is partly real engineering, not just integration, and it is the area an IVD-led company most needs to be real. This spec defines exactly what is missing, what already exists to build on, and how to close it without over-claiming.

The single most important, easily-missed fact: **the platform already fills official FDA AcroForm PDFs today** — for IND (`server/services/ind-forms/ind-form-fill-service.ts`, Forms 1571/1572/3674). That capability is the foundation; the device gap is largely "point the proven form-fill machinery at the eSTAR/device templates," not "invent PDF form-filling."

---

## 1 — What's missing (precise, not hand-wavy)

### 1.1 eSTAR (510(k) / De Novo) — produces the wrong artifact
- **What exists:** a readiness/gap mapper (`pathway-engines/estar/estar-mapper.ts`, pure + honest), an eSTAR completeness validator with scoring (`eSTARValidator.ts`), and a build route (`routes/510k-estar-routes.ts` → `POST /api/510k/estar/build`) that produces a **governed ZIP of separately-rendered section PDFs** (`01_CoverLetter.pdf`, `02_510kSummary.pdf`, `03_DeviceDescription.pdf`, `04_SE_Discussion.pdf`, `05_PerformanceTesting.pdf`, `06_Labeling.pdf`).
- **What's missing:** CDRH does not accept a ZIP of loose PDFs for 510(k)/De Novo — since Oct 2023 it requires the **official FDA eSTAR interactive PDF** (a specific AcroForm template the manufacturer downloads, fills, and attaches files into). We render the *content* but never populate the *official eSTAR PDF*. So today's output is a useful internal package, **not a submittable eSTAR**.
- **Severity:** High for a device/IVD GTM. This is the literal deliverable CDRH ingests.

### 1.2 PMA — content generator, not an assembled/validated package
- **What exists:** `routes/pma-workflow-routes.ts` (a 2-endpoint workflow), `services/regulatory/pyramids/pma-pyramid.ts`. (`pmaDocumentGenerator.js` — a generic PDF/DOCX of the 10 PMA modules over hard-coded fixture prose, reachable from no route — was deleted; PMA drafting is `/api/510k/estar/*` over the governed store.)
- **What's missing:** PMA at FDA is increasingly eCTD/eSTAR-structured; we have neither a PMA eCTD assembly path nor a PMA eSTAR fill, and no validation/dispatch gate equivalent to the pharma eCTD pipeline. It's a document *drafter*, not a submission *assembler*.

### 1.3 EU MDR/IVDR technical file — assembled but unproven
- **What exists:** `pathway-engines/mdr-ivdr/{assemble-technical-file-from-core,tech-doc-assembler,technical-file-packager}.ts` map canonical leaves → Annex II/III sections and have a packager.
- **What's missing:** end-to-end ZIP emission is not tested; no Notified-Body-shaped output validation beyond readiness; no EUDAMED registration payload generation (knowledge of UDI/SRN exists, transmission does not).

### 1.4 Global agencies beyond FDA/EMA/PMDA — advisory only
- **What exists:** a deep IVD knowledge corpus + readiness assessors for Health Canada, NMPA, ANVISA, TGA, MFDS, MHRA, Swissmedic, India (`ivd-knowledge/**`, `regulatory/global-pathways.ts`).
- **What's missing:** no submission *assembly* or *gateway* for any of them. We can advise; we cannot package or transmit.

### 1.5 The connective tissue
- There are **multiple overlapping eSTAR/510(k) entry points** (`510k-estar-routes.ts`, `fda510k-unified.ts`, `submission-ops.ts`, `pathway-engines/estar`, `eSTARValidator.ts`) without one canonical assembly contract — the same fragmentation the reporting audit found, applied to devices.

---

## 2 — What it does (the target capability)

A **canonical Device & IVD submission-assembly path** that, for a given project + pathway, takes the canonical content already in the platform and produces the **exact artifact the target authority ingests**, validated and governed:

1. **510(k) / De Novo** → the **official FDA eSTAR PDF, programmatically filled** from canonical fields, with section files attached, passing `eSTARValidator` + (when licensed) the external eValidator gate, exported as a governed, e-signed artifact.
2. **PMA** → an assembled, validated PMA package on the same eCTD/eSTAR rails as pharma, not a loose document.
3. **EU MDR/IVDR** → a proven, tested technical-file ZIP in Annex order, with an optional EUDAMED registration payload.
4. **One assembly contract** (`assembleDeviceSubmission(project, pathway) → { artifact, validation, blockers, provenance }`) that every device pathway implements, mirroring the pharma eCTD `assemble-from-core` → `regional-packager` → `dispatch-gate` spine.

## 3 — Who it's for
- **Device & IVD regulatory affairs teams** filing 510(k)/De Novo/PMA/CE-IVDR — primary.
- **CROs / consultancies** assembling device submissions for clients.
- **The platform's own submission center + reporting layer** (a real assembled package makes readiness/forecast reports truthful).

## 4 — Who it's NOT for
- **Pharma eCTD users** — already served by the working FDA/EMA/PMDA pipeline; this doesn't touch it.
- **Markets we only advise on today** (Health Canada/NMPA/ANVISA/TGA/MFDS/MHRA/Swissmedic/India) — explicitly *out of scope for assembly* in this spec (advisory stays; assembly is a later, per-market effort).
- **Authoring** — content is authored in the editor; this assembles existing content, it doesn't draft it.

## 5 — What success looks like
- A test 510(k) project produces the **official FDA eSTAR PDF**, filled and attachment-complete, that opens correctly in Adobe and passes `eSTARValidator` with no errors — **and** an honest readiness report that no longer claims "submittable" for a loose-ZIP output.
- De Novo produces its eSTAR variant (classification request + special controls slots filled).
- One MDR and one IVDR project emit a tested Annex-ordered technical-file ZIP.
- PMA produces an assembled, validated package (not just a DOCX).
- A single `assembleDeviceSubmission` contract backs all of them; the overlapping eSTAR entry points are consolidated behind it.
- **Honesty gate:** no pathway reports "ready to submit" unless it produced the authority's actual artifact and passed validation. (Reuse the truthfulness discipline from the reporting spec.)

## 6 — Out of scope
- New global-agency gateways/assembly (the 8 advisory markets).
- Live transmission credentials/UAT (ESG/CESP/EUDAMED creds are procurement; the assembly is what this spec delivers).
- eValidator license + eCTD DTD procurement (the *seam* is wired; the licensed engine is not this spec's job).
- Authoring/content generation, and the reporting/prediction layer (separate spec).
- Federated learning.

## 7 — Build steps (each with the key decision and my default)

### Step 1 — Vendor the official FDA eSTAR templates + map the field model
- **Decision:** Treat the eSTAR PDF as a vendored asset (like the eCTD DTDs) or generate from scratch? **Default:** **vendor it** — drop FDA's official `eSTAR.pdf` (non-IVD and IVD variants, current versions) into an `assets/estar-templates/` dir behind a self-containment gate, exactly as `dtd-bundler.ts` treats DTDs. Never regenerate FDA's form.
- **Decision:** Where does the field map live? **Default:** a declarative map (canonical field → eSTAR AcroForm field name) per template version, versioned alongside the asset, so a new eSTAR release is a data change, not a code change.

### Step 2 — Reuse the IND AcroForm fill machinery for eSTAR
- **Decision:** New PDF-fill code or reuse `ind-forms/ind-form-fill-service.ts`? **Default:** **reuse/extend the existing service** — it already fills official FDA AcroForm PDFs (1571/1572/3674) with pdf-lib. Generalize it to `fillOfficialPdf(template, fieldMap, data)` and apply to eSTAR. This is the single highest-leverage decision: it turns "build eSTAR fill" into "configure existing fill."
- **Decision:** How are section files attached? **Default:** use eSTAR's defined attachment slots; attach the already-rendered section PDFs (the ones the current ZIP route produces) into the official form rather than discarding them — the existing renderers become inputs, not the output.

### Step 3 — Define the canonical `assembleDeviceSubmission` contract
- **Decision:** Extend the pharma `assemble-from-core` or build a parallel device spine? **Default:** **mirror the pharma spine** (`assemble-from-core` → packager → `dispatch-gate`) with a device-specific assembler, so devices inherit the freeze/e-sign/governed-export/dispatch-readiness discipline already proven for eCTD.
- **Decision:** Output shape? **Default:** `{ artifact, validationReport, blockers, provenance }` — identical envelope to the report orchestrator, so readiness/forecast reports can consume it directly.

### Step 4 — Consolidate the overlapping eSTAR entry points
- **Decision:** Refactor now or leave parallel routes? **Default:** **consolidate** `510k-estar-routes.ts` / `fda510k-unified.ts` / `submission-ops` eSTAR paths to call the one assembler; keep old routes as thin deprecated shims for one release. Fragmentation is how the platform got two reporting systems — don't repeat it for devices.

### Step 5 — Wire validation honestly (internal now, external-ready)
- **Decision:** Gate on internal `eSTARValidator` only, or require external eValidator? **Default:** internal validator **blocks** on errors now; external eValidator is the same opt-in fail-closed gate as eCTD (`ECTD_REQUIRE_EVALIDATOR`) — advisory until licensed, blocking in production when configured. Never report "submittable" on internal pass alone for a production dispatch.

### Step 6 — De Novo, then PMA, then MDR/IVDR (in that order)
- **Decision:** Order? **Default:** **De Novo next** (it's the eSTAR variant — cheapest after 510(k): same machinery + 2 extra slots already in the mapper). **Then PMA** (put it on the eCTD/eSTAR rails; retire the generic generator as the *submittable* path, keep it for drafts). **Then MDR/IVDR** (add the missing end-to-end ZIP tests + NB-shaped validation; EUDAMED payload behind a flag).
- **Decision:** PMA format? **Default:** assemble PMA via the eCTD path (FDA accepts eCTD for PMA); reuse the pharma packager rather than a device-only format.

### Step 7 — Surface in the Submission Center + make reports truthful
- **Decision:** New UI or reuse submission center? **Default:** reuse the existing submission center surfaces; the assembler output drops into the same freeze/dispatch/transmit flow. The device/diagnostics workbench (`docs/medical-device-diagnostics-beta-audit.md`) becomes the entry point.
- Feed the real assembled-package status into the reporting layer so "submission readiness" stops being computed against a non-submittable artifact.

### Step 8 — Tests + honesty gates (the GA bar)
- **Decision:** What's the test bar? **Default:** golden-file test that the filled eSTAR PDF opens and round-trips its field values; `eSTARValidator` no-error test on a complete project; MDR/IVDR ZIP end-to-end emission test; a truthfulness test asserting no "submittable" status without the authority's real artifact + validation pass.
- Part 11: freeze/e-sign/governed-export audit on every device assembly, same as eCTD.

## 8 — Slicing
- **Slice 1 (closes the headline gap):** Steps 1–3, 5, 8 for **510(k)** — official eSTAR PDF filled, validated, governed, with honest readiness. This alone makes "we can produce a real 510(k)" true.
- **Slice 2:** Step 6 De Novo + Step 4 consolidation.
- **Slice 3:** PMA on eCTD rails.
- **Slice 4:** MDR/IVDR end-to-end + EUDAMED payload (flagged).

## 9 — Risks / honest caveats
- **eSTAR templates are versioned and licensed-by-distribution by FDA** — vendoring + a version-pinned field map is essential; an eSTAR version bump must be a tracked asset update with a re-validation.
- **Don't let the loose-ZIP output keep masquerading as a submission.** The most important near-term fix is *honesty*: until Slice 1 lands, the platform should not label the ZIP "submittable eSTAR." That's a one-line truthfulness change worth making immediately, independent of the rest.
- **Scope discipline:** resist expanding to the 8 advisory markets until FDA device assembly is solid; per-market assembly is a roadmap, not this spec.

---

## Appendix — Evidence files
- eSTAR: `server/services/pathway-engines/estar/estar-mapper.ts`, `server/services/eSTARValidator.ts`, `server/routes/510k-estar-routes.ts`, `server/routes/fda510k-unified.ts`
- Proven AcroForm fill to reuse: `server/services/ind-forms/ind-form-fill-service.ts`, `ind-form-data-builders.ts`, `server/routes/ind-forms.routes.ts`
- PMA: `server/routes/510k-estar-routes.ts` (`/build`, `/assemble`, `/filing-readiness` with pathway/catalog `pma`), `server/services/pathway-engines/pma/pma-mapper.ts`, `server/routes/pma-workflow-routes.ts`, `services/regulatory/pyramids/pma-pyramid.ts`
- MDR/IVDR: `server/services/pathway-engines/mdr-ivdr/{assemble-technical-file-from-core,tech-doc-assembler,technical-file-packager}.ts`
- Pharma spine to mirror: `server/services/ectd/{assemble-from-core,dispatch-gate,dispatch-readiness}.ts`, `server/services/submission-gateways/regional-packager.ts`
- Global advisory (out of scope for assembly): `server/services/ivd-knowledge/**`, `server/services/regulatory/global-pathways.ts`
- eValidator/DTD seams: `EVALIDATOR_INTEGRATION_SPEC.md`, `server/services/ectd/dtd-bundler.ts`
