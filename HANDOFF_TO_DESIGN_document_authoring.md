# Handoff to Design — Document Authoring & Publishing UI

**Date:** 2026-06-12
**From:** Backend / platform audit follow-through
**To:** Claude design
**Companion:** `GA_GAP_AUDIT_2026-06-10.md` (full gap analysis)

## Why this exists

The document platform audit found a consistent shape: the **back half** of the pipeline (format → generate → assemble → validate → transmit) is production-grade, but the **authoring experience** is the weakest stage — and almost every authoring feature already has a *working backend with no UI wired to it*. This brief hands those backends to design so the surfaces can be built on top of real, tested APIs rather than invented from scratch.

Scope boundary: **this is a design brief, not an implementation.** No UI was built in the backend work. Each section below names the exact backend (route, table, tool) the surface should bind to, plus the compliance rails that already exist and must be honored visually.

Two design skills are directly relevant and should gate this work: `regulatory-compliance-ux` (21 CFR Part 11 patterns — governed-action confirmations, reason-for-change, e-signature flows, immutable history) and `accessibility-enforcement` (WCAG 2.2 AA). Visual tone follows the existing design system (`README.md`, `colors_and_type.css`, `HANDOFF.md`): calm, reviewer-grade, sentence case, no emoji.

## The backends waiting for a UI (P1 register)

Each row is "real backend, zero UI." Priority order is the recommended build sequence.

### 1. The editor itself — the foundation everything else hangs on
- **What exists:** `client/src/components/ui/editor.jsx` — a minimal TipTap (ProseMirror) editor: bold/italic/headings/lists only.
- **What's available but unwired:** `@tiptap/extension-table`, `-link`, `-mention`, `-task-list`, `-collaboration`, and `@tiptap/y-tiptap` are already in `package.json`.
- **Design need:** a real regulatory writing surface — tables, links, images, citations, section structure, slash-command insert. This is the substrate; sections 2–7 attach to it.
- **Roadmap fit:** this is the "Phase 9 Universal Authoring" single-editor direction (`READ_ME_FIRST.md`).

### 2. Real-time co-authoring (Yjs/CRDT)
- **What exists:** `server/routes/realtime-collab.ts` — production Yjs CRDT + WebSocket server: presence (cursors, who's typing), document locks (`exclusive` / `shared` / `advisory`), Part 11 audit per edit, Postgres persistence for offline recovery.
- **Design need:** connect the editor via `@tiptap/y-tiptap`; presence avatars/cursors, lock indicators, "X is editing this section" affordances. Wiring the editor to this server activates everything the backend already does.

### 3. Track changes / redline
- **What exists:** `coauthor_document_versions` (content + change summary per version) as the diff basis; DOCX export already supports tracked changes on the way out.
- **Design need:** an insertions/deletions overlay derived from version diffs; accept/reject affordances. Honor `motion-discipline` (calm transitions).

### 4. Comments / annotations
- **What exists:** `coauthor_annotations` table (notes + AI advice, per section).
- **Design need:** threaded comment UI, resolve/reopen, anchored to text ranges. Reviewer-grade tone per `microcopy-tone`.

### 5. Version browse / compare
- **What exists:** `coauthor_document_versions` with `UNIQUE(document_id, version_number)` and change summaries.
- **Design need:** a version timeline + side-by-side or inline diff viewer. Immutable-history visual per `regulatory-compliance-ux`.

### 6. Approval workflow
- **What exists:** `server/routes/approval-workflow.ts` — `start` / `approve` / `reject` / `delegate` / `pending` / `:id/status` over `shared/schema/unified_workflow` (`workflowTemplates`, `workflowSteps`).
- **Design need:** an approver queue, step-history timeline, reject-with-reason dialog. Governed-action confirmation pattern from `regulatory-compliance-ux`.

### 7. E-signature manifestation (21 CFR §11.50)
- **What exists:** `server/routes/esignature.ts` — server-side bcrypt password re-verify + TOTP (`verify-password`, `verify-mfa`, `sign`), writes `electronic_signatures`, content SHA-256.
- **Design need:** the e-sign modal (password + TOTP), and — the audit-flagged gap — the §11.50 **signature manifestation**: printed name, date/time, and meaning of signature visibly bound to the signed record. This is a compliance requirement, not decoration.

### 8. Template management surface
- **What exists:** full REST at `server/routes/c2c/templates.ts` — list, extract-preview, extract+save from upload, create-from-spec, update, deactivate, render (`.docx`/`.pdf`). Org-scoped, audited. Spec model in `server/services/templates/templateSpec.ts` (page, typography, colors, brand/logo, header/footer, table, named styles), with an extraction `confidence` score + `warnings`.
- **Design need:** browse/preview templates, confirm an extraction (surface confidence + warnings before save), and choose a template at export. This closes the loop on the single strongest backend in the platform — today it has no UI at all.

### 9. Sentence-level source traceability (the headline differentiator)
- **What exists:** citation plugin + provenance events; today click-through is claim-level.
- **Design need:** citation marks in the editor that resolve to the exact source span. This is the product's core "verify any sentence against its source" promise and should be treated as the marquee interaction, not a footnote.

## Authoring tools the AI already exposes (so the UI can surface them)

These AnA tools exist and return structured scaffolds/drafts the editor can drop in — the UI should make them reachable (slash command, "insert section", or AnA chat):

- `get_csr_template` — Module 5 / ICH E3 CSR, synopsis, ISS, ISE, clinical protocol scaffolds (**new**, this initiative).
- `get_nonclinical_template` — Module 4 study reports, M2.6 summaries, FIH dose memo.
- `draft_clinical_overview_m2_5`, `draft_clinical_summary_m2_7`, `draft_nonclinical_overview_m2_4`, `draft_quality_overall_summary_m2_3` — data-driven composers.

## Out of scope for design (tracked elsewhere)

These remaining audit gaps are **not** UI and are not part of this handoff:
- Vendor the licensed ICH DTDs into `assets/ectd-dtd/` (procurement).
- Integrate a commercial external eValidator (vendor selection).
- PDF/A enforcement on the submission path — **already implemented** behind `ECTD_REQUIRE_PDFA` (`server/services/ectd/pdfa-readiness.ts`); ops enables it once binaries ship.

## Suggested sequence

Build **1 (editor) + 2 (Yjs)** first — that single integration lights up presence, locks, and Part 11 edit audit that already work server-side, and is the substrate for 3–7. Then **8 (templates)** and **9 (traceability)** as the two highest-differentiation surfaces. Follow the `design-brief` → `brief-to-tasks` → build → `design-review` flow, with `accessibility-enforcement` and `regulatory-compliance-ux` as gates throughout.
