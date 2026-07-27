# AnA-Guided Agentic Onboarding — Design Note

**Status:** Proposed (captured 2026-07-26). Not yet built.
**Branch context:** `claude/backend-client-onboarding-integration-rul4d5` (backend/client-onboarding integration).

---

## Intent

Make **AnA the onboarding concierge** for a new client:

1. **Welcome guide.** AnA greets the new client, explains the workspace in plain,
   regulatory-aware language, and walks them through first-run setup.
2. **Agentic co-pilot that can help _or take over_.** Instead of the client
   manually keying in org / program / profile data, they can **upload files**
   (prior filings, company profile, protocols, org charts, INDs, 510(k)s,
   spreadsheets) and **AnA extracts the data and performs the needed data entry**
   for them — with human review and approval.

Goal: a client goes from an empty workspace to a **provisioned org + first
program + profile** by dropping in documents and confirming AnA's proposed
entries, not by filling out forms.

## What already exists (build on it — do not rebuild)

- **AnA is already agentic.** `server/services/ana/agentic-loop.ts`,
  `AnaToolExecutor.ts`, `AnaToolDefinitions.ts`, `AnaDocumentDraftingService.ts`.
  The new capability is a scoped onboarding agent loop plus new tool definitions
  — not a new agent.
- **A file → data extraction pipeline already exists.**
  `server/services/ocr/tesseractOcrService.ts`,
  `server/services/projects/extract-text.ts`,
  `server/services/ai-actions/handlers/ocr-extract-text.ts`, and
  `extract-template-from-upload.ts` — backed by the PyMuPDF / pytesseract /
  Pillow / pdf2image stack in `requirements.txt`. This is the substrate for
  "AnA reads the uploaded file."
- **An onboarding flow already exists.**
  `client/src/concept2cure/v2/surfaces/OnboardingWizard.tsx` (first-run wizard) +
  the onboarding backend (org provisioning; `users` prefs incl.
  `onboardingComplete`). The new work extends the wizard with an AnA-guided,
  upload-driven path.
- **AnA is already present in the shell** (`AnaRail`, `onAsk`). The welcome
  guide is an AnA conversation state, not a new surface.

## Proposed shape

### Mode 1 — Welcome guide (assist)
- On first run AnA opens with a scripted-but-live welcome that adapts to the
  client's declared type (biotech / device / diagnostics) and their reason for
  joining.
- AnA narrates each step, answers questions, and offers to do the step for them:
  _"Want me to set up your first program? Upload your latest protocol and I'll
  fill it in."_

### Mode 2 — Upload-driven data entry (take over)
1. Client uploads one or more files into the onboarding surface.
2. AnA runs the extraction pipeline (OCR / text extraction) → structured
   candidate fields.
3. A new AnA tool maps extracted content → onboarding target fields: org profile
   (name, address, DUNS, therapeutic area), program / project (code, name,
   pathway, indication, phase, target dates), client-workspace metadata, key
   contacts.
4. AnA proposes the entries **with provenance** (source file + page/section) and
   a **confidence** per field.
5. Human-in-the-loop: the client reviews AnA's proposed values, edits, and
   **approves**; only then are records committed through the existing governed
   org / program / profile endpoints.

## Honesty / GA guardrails (non-negotiable)

- **No fabrication.** Every AnA-entered value is provenance-linked to its source
  document (file + page). Fields with no confident source stay blank (documented
  null) — never invented.
- **Confidence surfaced.** Low-confidence extractions are flagged for the human,
  not silently committed.
- **Human approval gate.** AnA proposes; the client (or CRO staff) approves
  before any write. Nothing auto-commits without review during onboarding.
- **Audited (21 CFR Part 11).** Every AnA-performed entry is written through the
  governed endpoints with a reason-for-change and lands in the sha256-chained
  audit log, attributed to "AnA on behalf of &lt;user&gt;."
- **Tenant-scoped.** Uploaded files and extracted data are scoped to the
  client's workspace; AnA never crosses client boundaries.

## New work (the gaps)

- Onboarding "welcome" AnA persona / state + client-type-aware script.
- File-upload UI in the onboarding surface (drag-drop, multi-file, progress).
- `onboarding_ingest` AnA tool(s): extraction → field-mapping → proposed-entry
  object with provenance + confidence.
- Backend: an onboarding-ingestion endpoint (upload → extract → map → return
  proposals) and a commit endpoint that writes approved proposals through the
  existing governed org / program / profile routes.
- Review / approve UI (AnA's proposals with per-field provenance, confidence,
  inline edit, and approve).
- Audit wiring for AnA-attributed data entry.

## Phasing

- **P1 — Welcome guide (assist only).** AnA greets, narrates, answers. No data
  entry. Lowest risk, immediate UX lift.
- **P2 — Upload → suggestions.** Client uploads; AnA extracts and _suggests_
  values the client confirms into the existing wizard fields.
- **P3 — Agentic auto-fill.** AnA fills the wizard from extracted data with
  provenance / confidence; human reviews + approves; governed commit + audit.

## Open questions

- Which onboarding fields are in scope for auto-entry first (org profile vs first
  program vs contacts)?
- Confidence threshold for "propose" vs "flag for human review."
- File types / size limits; virus scanning; retention policy for uploaded
  onboarding documents.
- Does AnA also _validate_ uploads against regulatory expectations during
  onboarding, or only extract?
