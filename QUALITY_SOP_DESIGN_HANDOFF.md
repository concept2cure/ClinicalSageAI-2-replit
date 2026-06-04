# Quality / SOP register — design handoff

> To: Claude Design (this project — the Concept2Cure.RI design system).
> From: Claude Code.
> Date: 2026-06-04. Shipped to `concept2cure-v2` (commits `d8415a3`, `568fb02`, `72263b3`, `ebb0880`).
> Status: built and pushed. Not yet deployed or verified on the live URL.

## Why you're reading this

The operator asked for a way for clients to build and control their internal SOPs. I built it end to end against the existing live QMS backend, but **there is no `ui_kits/` entry for this surface** — it was not designed here first. Per `CLAUDE.md` that normally means "stop and ask," but the operator directed the build directly and repeatedly, so I shipped it in the house language, mirroring `ui_kits/mdx/surfaces/Quality.jsx` and the live `client/src/concept2cure/intelligence/` module pattern.

Read the shipped surface as a working draft of a kit, not the final design. This handoff exists so you can (1) ratify or correct what I had to decide without a kit, and (2) decide what the surface becomes.

## What shipped

Reachable at: home rail → "Quality and Lifecycle" (the item that previously dead-ended at the MDX `#validation` tab).

Frontend — `client/src/concept2cure/quality/`
- `SopRegister.tsx` — the surface: header, 4 KPIs, template gallery, controlled-document register table, periodic-review panel, training-compliance panel.
- `App.tsx` + `QualityRoute.tsx` — single-surface shell (topbar + scrolling page), mounted by ZenApp on `layoutMode === 'quality'`.
- `data.ts`, `hooks.ts`, `icons.tsx`, `app.css` — types + fixtures + the 7-type family, `live ?? fixture` hooks, a Lucide subset, scoped styles.

Backend — extended the live QMS API (`server/routes/mdx-qms.ts`, mounted `/api/mdx/qms/*`)
- `GET /qms/templates` — the Quality system template family (7 types).
- `GET /qms/documents/review-due` — periodic review, with an `overdue` flag.
- `POST /qms/documents/:id/revise` — change control (version bump, back to draft, reason captured + audited).
- `POST /qms/documents/:id/retire` — terminal lifecycle state.
- `GET /qms/training/compliance` — read-and-understood: distinct current acknowledgments over the org roster.
- create now seeds `metadata.sections` from a `templateKey`.
- `server/services/qms/sopTemplates.ts` — the catalog (7 types × the standard Purpose → Approval skeleton).
- `server/api/templates/routes.ts` — folds the family into the cross-program `/api/templates` list.

Built on the existing `qms_documents` register and `qms_training_records`. No new tables.

The 7 types: quality manual · policy · SOP · work instruction · form · validation protocol · training curriculum. Each carries the standard section structure: Purpose · Scope · Responsibilities · Definitions · Procedure · References · Attachments · Revision history · Approval.

## What I decided without a kit (please ratify or correct)

1. **Shape.** A single scrolling surface (topbar + page), not a multi-tab shell with its own rail. The home rail already provides global nav.
2. **Hierarchy.** Header → 4 KPIs (effective · under review · review overdue · training compliance) → template gallery → register table → two-column grid (periodic review | training).
3. **Mutations are AnA-first.** Every action (create, approve, revise, retire, schedule review, record training) hands a written prompt to the conversation surface rather than opening a form or modal. This keeps the Part 11 reason-for-change and e-signature capture on one governed path.
4. **Lifecycle taxonomy and colour.** Five states — draft, under review, effective, superseded, retired — as status pills. I used semantic colours (green / amber / neutral) as literal hex, matching the precedent already in `intelligence/app.css`. These should become tokens.
5. **Register columns.** Number · Title · Type · Version · Status · Effective · Next review · row actions. Owner is omitted (the list API returns `author_id` only, no name).
6. **Template gallery.** "Build from the Quality system library" — 7 cards; each opens an AnA create flow that assigns the next number and the standard sections.
7. **Single accent.** Claude orange appears once, on the "New controlled document" primary button.

## What the UI needs from you (asks)

1. **A formal `ui_kits/` entry.** Either `ui_kits/quality/` or a surface inside `ui_kits/mdx/`. Right now the shipped surface is the source of truth, which inverts the design-system contract. Promote it to a kit so it can be kept 1:1.
2. **Rail scope.** The home rail item has five sub-items — SOP management, CAPA, Post-market surveillance, Inspection readiness, Compliance monitor (`components/concept2cure-home/data.tsx`). I built **SOP management** only. Are the other four tabs of this surface, separate surfaces, or links into the MDX post-market/quality surfaces? This decides whether Quality becomes a multi-surface cluster (like intelligence) with its own rail.
3. **Status tokens.** Promote the lifecycle pill colours and the training-bar tones (ok / warn / err) to tokens in `colors_and_type.css`. The literals are a stopgap.
4. **Create flow.** Confirm AnA-first create/approve, or specify a direct form/modal. A form would need a kit: fields, validation, number assignment, and the standard section editor.
5. **Authoring path for SOP content (the biggest open question).** Today an SOP's section skeleton lives as `metadata.sections` on `qms_documents`. The Phase 9 Universal Authoring surface (`c2c_documents` + rule packs) is the natural place to actually write the sections, but its `doc_type` enum is a closed regulatory set with no SOP. Decide: extend authoring with a quality rule pack, or keep quality docs on a lighter dedicated editor.
6. **Document numbering.** Auto-assign the next number per prefix (SOP-, WI-, …) server-side, or keep it AnA-assigned? There is no server sequence today.
7. **E-signature.** Approve / sign should drive the Part 11 `EsignModal` (`ui_kits/esign/`). Today the surface hands signing to AnA; wiring the modal in is a design + integration task.
8. **Training matrix.** The denominator is the whole org roster. If clients need role-based required-reader matrices (train only the people a document applies to), that needs a model and UI you would design.
9. **Accessibility pass.** Run `accessibility-enforcement` against the surface — focus order on register rows and template cards, ARIA on status pills and filter chips, contrast on the semantic colours.

## Known gaps and follow-ups

- Deploy + live-URL verification still pending (CI/operator-driven).
- No design tokens for status/training colours (literals, matching the intelligence sheet).
- CAPA, post-market surveillance, inspection readiness, compliance monitor not built.
- Document numbering not auto-sequenced server-side.
- E-signature handed to AnA; the Part 11 modal is not wired directly into this surface.
- Training denominator is org-wide; no per-document required-reader matrix.

## Non-negotiables I held to

Sentence case throughout; no emoji, no exclamations; 13px body, serif titles ≤ 24px; Claude orange once (primary CTA); Lucide icons only; 200ms ease-out; second person; numbers over adjectives; `live ?? fixture`; mutations through the governed AnA action path.

## Route note (resolved)

`/api/templates` has two mounts in the tree, but only the core one — `register-core-routes.ts` → `server/api/templates/routes.ts` (the file I edited) — is live. The second (`server/routes.js` → `shared-templates`) is dead: nothing calls its `registerRoutes`, and the `shared-templates` module it imports does not exist. The templates fold takes effect with no shadowing.
