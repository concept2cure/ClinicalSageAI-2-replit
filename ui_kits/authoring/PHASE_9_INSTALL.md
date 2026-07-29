# PHASE 9 — Universal Authoring · install guide for Claude Code

> Companion to `HANDOFF.md`, `PHASE_4_INSTALL.md` through `PHASE_8_INSTALL.md`. Phase 9 is the **universal document-authoring spine**. It consolidates the three pathway editors + the CTD-only `ectd_coauthor` prototype + per-PDEV activity drafting into one engine driven by `(doc_type × agency)` rule packs.
>
> Read `CLAUDE.md`, `HANDOFF.md`, and this kit's `README.md` before this file.

---

## 0 · Audit findings (from Claude Code, pre-design)

Before scoping, an editor & document-model audit was done in `concept2cure-v2`. The seven findings that shaped this phase:

1. **`EstarEditor` (838 LOC) is the canonical editor.** `PmaEditor.tsx` and `CerEditor.tsx` are 40-line shims around a shared `DocumentEditor.tsx` (610 LOC). Consolidation is 80% done already; Phase 9 just graduates `DocumentEditor` into the universal engine.
2. **PMA and CER editors both PATCH `cerv2_510k_sections`** (`DocumentEditor.tsx:550`) — a misnamed 510(k)-only section store. PMA and CER drafts land in the wrong table today. Phase 9 must ship the schema migration alongside the UI; otherwise UI consolidation alone causes silent data loss.
3. **No unified document model.** Pathways have their own (or no) tables: `cerv2_510k_sections` (510(k)), `cer_sections` (CER, slim), nothing for PMA. `concept2cure_artifacts` is the closest store with version + SHA-256 + lifecycle, but the editors don't write to it.
4. **`AnaMode` is model tiers, not UX modes** — `standard | deep-research | nano-banana`. Phase 9 introduces a new field `authoringView: 'conversation' | 'workbench'`. No enum collision.
5. **Only PDEV's drafting endpoint writes `audit_logs`.** Every other route (`/api/ana-ri/stream`, `/cerv2-ai/*`, `/ind-autodraft/*`, `/ana-intelligence/*`, `/mdx/ana-drafts`, `/cmc/*/ai-draft`, `/haq/*/ai-draft`) writes telemetry only. Phase 9 adopts the PDEV pattern: `agent.ana.<workstream>.section.ai_draft` audit entries on every mutation.
6. **No `(doc_type, agency)` rule pack registry exists** server-side. eCTD regional rules in `server/services/ectd/ectd-regional-rules.ts` are the closest seed. Phase 9 introduces `c2c_rule_packs` and treats the registry as a first-class server concept.
7. **Vault stores artifacts; sections live elsewhere.** `concept2cure_artifacts` has one `content` blob plus a `ctd_section` string — not a sectioned structure. Phase 9 keeps this as the immutable published-snapshot layer and introduces `c2c_documents` + `c2c_document_sections` as the mutable working layer.

**Phase 9 shape: (c) — UI + new document-schema migration + rule-pack registry.**

---

## 1 · Scope

| # | Surface                          | Endpoint                                                        | Layout                       |
|---|----------------------------------|-----------------------------------------------------------------|------------------------------|
| 1 | Universal authoring shell        | `/api/c2c/documents/:id`                                        | top bar + 3-pane             |
| 2 | Outline tree (left, both modes)  | `/api/c2c/documents/:id/outline`                                | recursive tree               |
| 3 | Conversation mode (default)      | `POST /api/ana-ri/stream` (already wired) + `/c2c/documents/:id/sections/:key:draft` | 35/65 split (chat / artifact) |
| 4 | Workbench mode                   | same data, different surface                                    | section table + open card    |
| 5 | Evidence + Reviewers inspector   | `/api/c2c/documents/:id/sections/:key/evidence` + `/reviewers`  | tabs in workbench right pane |
| 6 | Selection toolbar                | `/c2c/documents/:id/sections/:key/rewrite` (strengthen/tighten) | floating over artifact       |
| 7 | Rule pack picker (top bar)       | `GET /api/c2c/rule-packs?docType=…&agency=…`                    | popovers in topbar           |

The kit ships all seven; the v2 lift is mostly schema + audit wiring.

---

## 2 · Files (8 source files in `ui_kits/authoring/`)

| Kit source            | Lands at                                                      | Notes |
|-----------------------|---------------------------------------------------------------|-------|
| `data.jsx`            | `client/src/concept2cure/authoring/data.ts` + `mdx/data/rule-packs.ts` | Outline fixtures become `c2c_rule_packs.required_sections` seeds. |
| `Icons.jsx`           | reuse codebase `icons.tsx` — every glyph is Lucide-compatible | Add `conversation`, `workbench`, `agency` glyphs (already in `mdx/icons.tsx`'s pattern). |
| `Shell.jsx`           | `client/src/concept2cure/authoring/shell/{TopBar,DocTypePicker,AgencyPicker}.tsx` | TopBar is the Phase 9 chrome — replaces per-editor breadcrumb bars. |
| `OutlineTree.jsx`     | `client/src/concept2cure/authoring/shell/OutlineTree.tsx`     | Shared across both modes. |
| `Conversation.jsx`    | `client/src/concept2cure/authoring/conversation/{Chat,Composer,SelectionToolbar}.tsx` | The composer's slash menu lives here; lifts to the existing CmdK service for tab-complete. |
| `Artifact.jsx`        | `client/src/concept2cure/authoring/artifact/{Artifact,Paragraph,Provenance}.tsx` | `Paragraph` is the only reused renderer between modes. |
| `Workbench.jsx`       | `client/src/concept2cure/authoring/workbench/{SectionTable,Inspector,SectionCard}.tsx` | Inspector reuses `<AnaRail>`-like Chat shell. |
| `App.jsx`             | `client/src/concept2cure/authoring/App.tsx`                   | Mounts under `/authoring/:documentId` and `/projects/:projectId/authoring`. |

## 3 · Hooks Phase 9 introduces

```ts
// Document-level (replaces useK510, useCerWorkbench, useEstarEditor, usePdevActivityAiDraft)
useC2cDocument(documentId)                  // GET /api/c2c/documents/:id
useC2cDocumentOutline(documentId)           // GET /api/c2c/documents/:id/outline
useC2cDocumentSection(documentId, key)      // GET /api/c2c/documents/:id/sections/:key
useC2cDocumentSectionSave()                 // PATCH /api/c2c/documents/:id/sections/:key  (audited)
useC2cDocumentLockSection()                 // POST  /api/c2c/documents/:id/sections/:key/lock (audited)
useC2cDocumentRewriteSelection()            // POST  /api/c2c/documents/:id/sections/:key/rewrite (audited)
useC2cDocumentDraftSection()                // POST  /api/c2c/documents/:id/sections/:key/ai-draft (audited, stream)
useC2cDocumentValidate()                    // POST  /api/c2c/documents/:id/validate?pack=<docType>:<agency>

// Rule pack registry
useRulePack(docType, agency)                // GET /api/c2c/rule-packs?docType=…&agency=…
useRulePackList()                           // GET /api/c2c/rule-packs?list=1 (top bar pickers)

// Reviewer / evidence linking (audit on link/unlink)
useDocSectionEvidence(documentId, key)      // GET /api/c2c/documents/:id/sections/:key/evidence
useDocSectionLinkEvidence()                 // POST … /evidence (audited)
useDocSectionUnlinkEvidence()               // DELETE … /evidence/:evId (audited)
useDocSectionAssignReviewer()               // POST … /reviewers (audited)
```

Every mutation hook MUST receive `reason: string` and forward it to the route — the audit middleware writes the SHA-256 chain entry with that reason. This is the **PDEV pattern**; copy it verbatim from `pdev-command-handlers.ts:540 pdevActivityAiDraft` (`auditService.logAction({ action: 'agent.ana.pdev.activity.ai_draft', … })`).

## 4 · AnA integration

`useAnaChat` already wires `/api/ana-ri/stream`. Phase 9 just augments `moduleContext`:

```ts
useAnaChat({
  projectId:    documentId,                  // for grounding
  projectName:  document.title,
  screenName:   'Authoring',
  submissionType: rulePack.docType,         // 'IND' | 'NDA' | '510K' | 'CER' | …
  moduleContext: {
    workstream:    'authoring',
    docType:       document.docType,
    agency:        document.agency,
    sectionKey:    activeSection.key,
    rulePack:      `${document.docType}:${document.agency}`,
    authoringView: 'conversation' | 'workbench',
    anaMode,                                 // unchanged — model tier
  },
})
```

`authoringView` is a new client-only field and a UI affordance; do **not** branch the server orchestrator on it (the kernel router already chooses model from gateway response). Persist `authoringView` in `localStorage('authoring.view')` like MDX persists `mdx.anaMode`.

## 5 · Database deltas

```sql
-- 1) Unified document table — supersedes per-pathway fragmentation.
CREATE TABLE c2c_documents (
  id               text PRIMARY KEY,                       -- doc_<uuid>
  org_id           uuid NOT NULL,
  project_id       uuid NOT NULL REFERENCES regulatory_programs(id),
  doc_type         text NOT NULL,                          -- 'ind' | 'nda' | 'k510' | 'cer' | …
  agency           text NOT NULL,                          -- 'fda' | 'ema' | 'pmda' | …
  rule_pack_version text NOT NULL,                         -- e.g. 'ich-m4-v2.0'
  title            text NOT NULL,
  status           text NOT NULL DEFAULT 'draft',          -- draft | review | approved | locked
  readiness        integer NOT NULL DEFAULT 0,             -- 0..100 (computed)
  artifact_id      text REFERENCES concept2cure_artifacts(id), -- immutable snapshot on lock
  locked_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX c2c_documents_project_idx ON c2c_documents (project_id);
CREATE INDEX c2c_documents_pack_idx    ON c2c_documents (doc_type, agency);

-- 2) Sectioned content — replaces cerv2_510k_sections + cer_sections + the missing PMA store.
CREATE TABLE c2c_document_sections (
  id               bigserial PRIMARY KEY,
  document_id      text NOT NULL REFERENCES c2c_documents(id) ON DELETE CASCADE,
  section_key      text NOT NULL,                          -- e.g. 'm2.5', 'C2', '3.2.S'
  parent_key       text,
  label            text NOT NULL,
  mandatory        boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'todo',           -- todo | drafted | review | approved | locked
  owner_id         uuid REFERENCES users(id),
  content          jsonb NOT NULL DEFAULT '{}'::jsonb,     -- structured paragraphs[] with prov + citations
  draft_source     text,                                   -- 'human' | 'ana' | 'imported'
  drafted_at       timestamptz,
  accepted_by      uuid REFERENCES users(id),
  accepted_at      timestamptz,
  version          integer NOT NULL DEFAULT 1,
  UNIQUE (document_id, section_key)
);
CREATE INDEX c2c_doc_sections_doc_idx ON c2c_document_sections (document_id);

-- 2a) Section version shadow — mirrors cerv2_section_versions; keep on every PATCH.
CREATE TABLE c2c_document_section_versions (
  id               bigserial PRIMARY KEY,
  section_id       bigint NOT NULL REFERENCES c2c_document_sections(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  content          jsonb NOT NULL,
  author_id        uuid NOT NULL REFERENCES users(id),
  reason           text NOT NULL,                          -- audit reason (21 CFR Part 11)
  occurred_at      timestamptz NOT NULL DEFAULT now()
);

-- 3) Rule pack registry — the missing primitive.
CREATE TABLE c2c_rule_packs (
  doc_type         text NOT NULL,
  agency           text NOT NULL,
  version          text NOT NULL,                          -- e.g. 'ich-m4-v2.0'
  label            text NOT NULL,                          -- 'IND × FDA · eCTD M1-5 (US)'
  required_sections jsonb NOT NULL,                        -- [{key, path, label, mandatory, parent_key}]
  validators       jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{id, severity, expr}]
  template_id      text REFERENCES account_template_registry(id),
  esubmit_channel  text,                                   -- 'ESG' | 'CESP' | 'PMDA' | …
  effective_from   date NOT NULL,
  PRIMARY KEY (doc_type, agency, version)
);

-- 4) Evidence link table — section ↔ vault artifact, audited.
CREATE TABLE c2c_document_section_evidence (
  id               bigserial PRIMARY KEY,
  section_id       bigint NOT NULL REFERENCES c2c_document_sections(id) ON DELETE CASCADE,
  evidence_kind    text NOT NULL,                          -- 'artifact' | 'vault_doc' | 'rim_precedent' | 'guidance'
  evidence_ref     text NOT NULL,
  paragraph_id     text,                                   -- nullable; null = section-level cite
  confidence       numeric(3,2),
  linked_by        uuid NOT NULL REFERENCES users(id),
  linked_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX c2c_doc_evidence_section_idx ON c2c_document_section_evidence (section_id);
```

### Migration order (must be one atomic transaction):

1. Create the four new tables.
2. Seed `c2c_rule_packs` from `ui_kits/authoring/data.jsx > AUTH_OUTLINES` (10 doc types × 6 agencies = 13 packs at launch).
3. Backfill from `cerv2_510k_sections` → `c2c_document_sections` (one `c2c_documents` row per `fda510k_projects` row).
4. Backfill from `cer_sections` → `c2c_document_sections` (one `c2c_documents` row per `cer_reports` row).
5. For PMA (no source table today) — synthesize empty `c2c_documents` rows for each `pma_submissions` row.
6. Drop write access to `cerv2_510k_sections` from the editor save path — keep the table for now (Phase 9 cleanup phase deletes it after one full release cycle).

## 6 · Audit integration

Every mutation route MUST write to `audit_logs` using the PDEV pattern. Required actions:

```
agent.ana.authoring.section.ai_draft        (POST  …/sections/:key/ai-draft)
agent.ana.authoring.section.rewrite          (POST  …/sections/:key/rewrite)
authoring.section.save                       (PATCH …/sections/:key)
authoring.section.lock                       (POST  …/sections/:key/lock)
authoring.section.evidence.link              (POST  …/sections/:key/evidence)
authoring.section.evidence.unlink            (DELETE …/sections/:key/evidence/:evId)
authoring.section.reviewer.assign            (POST  …/sections/:key/reviewers)
authoring.document.lock                      (POST  /api/c2c/documents/:id/lock)
authoring.rule_pack.validate                 (POST  /api/c2c/documents/:id/validate)
```

Each entry: `{ action, actor_id, target: documentId + ':' + section_key, reason (required), sha256_chain }`.

## 7 · Replaces (HANDOFF.md delete list — execute after Phase 9 ships)

Delete from the codebase after acceptance:

- `client/src/concept2cure/mdx/editors/EstarEditor.tsx` (838 LOC) — graduated into the universal `<Authoring.Artifact>`.
- `client/src/concept2cure/mdx/editors/PmaEditor.tsx` (40 LOC shim) — folded.
- `client/src/concept2cure/mdx/editors/CerEditor.tsx` (40 LOC shim) — folded.
- `client/src/concept2cure/mdx/editors/DocumentEditor.tsx` (610 LOC) — folded.
- `client/src/concept2cure/mdx/editors/` (whole folder) — removed.
- `client/src/concept2cure/mdx/surfaces/cer/CerWorkbench.tsx` — folded into `<Authoring.Workbench>`.
- `ui_kits/ectd_coauthor/` — kit superseded; keep in design system as reference for one release cycle, then delete.
- Route alias: `editor` / `pma-editor` / `cer-editor` in `mdx/App.tsx` switch → all forward to `authoring` with `(doc_type, agency)` pre-set from program type.
- Per-pathway client hooks that wrap the legacy section routes (`useEstarSection`, `useCerSection`, `usePmaSection` if they exist) — replaced by `useC2cDocumentSection`.

## 8 · Nav additions

The home rail (`ui_kits/home/data.jsx > NAV_ITEMS`) already has `User Artifacts` pointing at `ectd_coauthor`. Phase 9 **repoints** the same entry — no rail expansion. `User Artifacts` becomes the single entry point for authoring across MDX / biopharma / PDEV.

```ts
// ui_kits/home/data.jsx — change the artifacts href:
{ id: 'artifacts', label: 'User Artifacts', icon: 'sparkles', group: 'system',
  href: '../authoring/index.html' },   // was: '../ectd_coauthor/index.html'
```

## 9 · Acceptance

- [ ] Single editor mount under `/authoring/:documentId` replaces the three pathway editor mounts.
- [ ] Top-bar mode toggle switches between Conversation and Workbench without dropping state (chat thread + active section + scroll position preserved).
- [ ] Rule pack picker in topbar reloads outline + validators on change.
- [ ] `c2c_documents` + `c2c_document_sections` + `c2c_document_section_versions` + `c2c_rule_packs` tables created and seeded.
- [ ] Backfill from `cerv2_510k_sections` and `cer_sections` produces no orphaned rows; PMA synthesis covers every `pma_submissions` row.
- [ ] PMA and CER drafts written via the new save path land in `c2c_document_sections`, not `cerv2_510k_sections`.
- [ ] Every mutation route writes an `audit_logs` entry with a non-empty `reason`.
- [ ] `useAnaChat` includes `authoringView`, `rulePack`, `sectionKey` in `moduleContext`.
- [ ] No `(doc_type, agency)` switch statements remain in client code outside `<RulePackPicker>` and `useRulePack`.
- [ ] Lock action writes a `concept2cure_artifacts` immutable snapshot with `ctd_section = section_key` (when applicable).
- [ ] Tweaks panel persists `authoringView`, `evidenceMode`, `focus`, `treeCollapsed` to `localStorage('authoring.*')`.
- [ ] Legacy editor files deleted; `editor` / `pma-editor` / `cer-editor` routes forward.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## 10 · Out of scope (Phase 9 explicitly does NOT do)

- **Submission compilation.** That stays in Submission Center (`submissions` rail item, Phase 5).
- **Vault browsing** — Vault stays the read surface (Phase 5). Phase 9 only links evidence into sections.
- **eCTD XML output.** The artifact tab "eCTD XML" remains inert; `cerv2-export-routes.ts` handles compile-time XML and is unchanged.
- **PDEV activity drafting** — PDEV's `usePdevActivityAiDraft` remains for now. A Phase 9.1 ticket can migrate it once `c2c_documents` covers PDEV's activity registry. For Phase 9, PDEV stays on its own path.

## 11 · End-of-phase note

Phase 9 collapses the last fragmentation in the authoring stack. After Phase 9 ships:
- Every section save anywhere in the app writes to `c2c_document_sections` and produces an audit chain.
- Every rule pack is a registry row, not editor code.
- Every regulator surfaces the same UX — Conversation for AnA-led drafting, Workbench for structured authoring — with the agency rule pack invisibly swapping the outline / validators / submit channel beneath.

Phase 10 (post-launch) addresses bulk import (legacy customer dossiers) and PDEV activity migration.
