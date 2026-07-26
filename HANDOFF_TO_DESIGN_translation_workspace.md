# Handoff to Design — Translation Workspace (EN→JA regulatory translation)

> [!CAUTION]
> **RETRACTED AS EVIDENCE — 24 July 2026.**
> This brief is a historical record of what was believed on its authoring date. It is
> **not** evidence of what the code does and must not be cited as a reason to build,
> skip, or scope anything. At least one brief in this set was materially wrong about a
> live subsystem (`HANDOFF_TO_DESIGN_document_authoring.md` §2 — see
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md` §0.1).
>
> Verify every claim below against the code at the head of `concept2cure-v2`, or treat
> it as an open question. Authoritative scope lives in
> `_sync/CLAUDE_DESIGN_MASTER_WORK_ORDER_2026-07-24.md`.

**Status:** Backend engine + data contracts + a first functional UI exist; this document is the contract Claude Design renders against. The screen turns the platform's translation engine into a usable, governed surface for converting English regulatory content into the languages a market requires (Japanese first, for PMDA).

**Audience:** Claude Design + frontend building the Translation Workspace surface.

**Companion code (all on branch `claude/translation-pmda-pipeline`, PR #966):**
- Shared contract: `shared/types/translation.ts`
- UI (first pass, functional): `client/src/concept2cure/translation/` (`surfaces/Projects.tsx`, `surfaces/SegmentWorkspace.tsx`, `surfaces/GlossaryPanel.tsx`, `surfaces/QaFindingsPanel.tsx`, `hooks/useTranslation.ts`, `services/translationService.ts`)
- Engine: `server/services/translation/` (glossary/DNT masking, translation memory, hybrid workflow state machine, providers, QA engine, persistence repository, status mapper)
- QA findings contract: `server/services/translation/qa/types.ts`
- Terminology corpus (glossary seed): `server/services/translation/terminology/`

---

## 1. The one thing to internalize

This screen is **a regulated review workflow, not a text box.** Machine translation is a *draft accelerator only*. The UI's job is to make the human post-edit → back-translation → independent-review → approval path obvious and safe, and to make the guardrails legible:

- A `machine`-only segment can **never** be approved. Approval requires human post-edit **and** back-translation evidence **and** a named reviewer who is **not** the post-editor (two-person rule).
- Identifiers (21 CFR, ICH, eCTD M1–M5, gene symbols, units, INN/drug names, MedDRA terms) are **never translated** — they are masked and restored verbatim. The UI should visually distinguish do-not-translate spans.
- Every approval is a **governed action** (e-signature / reason-for-change), audit-trailed (21 CFR Part 11).

Everything below is the data the UI renders and the states it must represent.

---

## 2. Navigation / IA

The workspace has two levels plus two supporting panels:

```
Translation
 ├─ Projects (dashboard)            ← list + create; pick a project → workspace
 │    └─ Segment Workspace           ← bilingual EN/JA review + per-segment actions
 ├─ Glossary (panel)                 ← DNT + preferred-term registry (tenant-scoped)
 └─ QA Findings (panel/inline)       ← per-segment automated check results
```

Project context (`projectId`) is owned by the app shell and threaded into each surface (same pattern as the Labeling surfaces). Org/auth is implicit — the data layer injects the tenant + auth headers; surfaces never handle org/auth directly.

---

## 3. The data contract (what the UI renders)

All types are in `shared/types/translation.ts` — **import these, don't re-derive.**

### 3.1 TranslationProject
```ts
{
  id: number;
  organizationId: number;
  name: string;
  sourceLanguage: string;           // BCP-47, e.g. 'en' / 'en-US'
  targetLanguages: string[];        // e.g. ['ja-JP', 'zh-CN']
  status: 'draft' | 'in_translation' | 'in_review' | 'approved' | 'archived';
  submissionContext?: string | null; // soft link to a submission/sequence
  description?: string | null;
  createdBy: number; createdAt; updatedAt;
}
```

### 3.2 TranslationSegment (the heart of the workspace)
```ts
{
  id: number;
  projectId: number;
  targetLanguage: string;
  segmentKey: string;               // stable ordering address within the doc
  sourceText: string;               // English (DNT identifiers inline)
  targetText: string | null;        // Japanese (null until drafted)
  method: 'human' | 'mt_postedited' | 'machine';
  status: 'pending' | 'mt_draft' | 'in_progress' | 'back_translation' | 'review' | 'approved' | 'rejected';
  // Provenance (render as audit affordances):
  engine?: string | null;           // MT engine + version
  postEditor?: number | null;       // user id
  reviewer?: number | null;         // user id (must differ from postEditor)
  backTranslationVerified: boolean;
  backTranslationText?: string | null;
  approvedBy?: number | null;
  approvedAt?: string | null;
}
```

### 3.3 The status lifecycle (drive the workflow UI from this)
```
pending ──draft──▶ mt_draft ──post-edit──▶ in_progress ──run back-translation──▶ back_translation
   │                                                                                    │
   │                                                                            (submit for review)
   │                                                                                    ▼
   └──(human from scratch)──▶ in_progress ─────────────────────────────────────────▶ review
                                                                                        │
                                                                              approve / reject
                                                                                        ▼
                                                                              approved | rejected
```
Show this as a stepper/pipeline per segment. `APPROVABLE_METHODS = ['human','mt_postedited']` is exported — **`machine` is never approvable.**

### 3.4 GlossaryTerm
```ts
{
  id; organizationId; projectId?: number | null;  // null = org-wide
  sourceLanguage: string; sourceTerm: string;
  targetLanguage?: string | null; targetTerm?: string | null;  // null target for pure DNT
  doNotTranslate: boolean;
  category: GlossaryCategory;
  caseSensitive: boolean; notes?: string;
}
// GlossaryCategory: 'regulatory_citation' | 'agency_name' | 'evidence_label'
//   | 'slash_command' | 'json_block' | 'inn_drug_name' | 'meddra_term'
//   | 'code' | 'preferred_term'
```
Render DNT terms as a **locked/identifier chip** (target shown as “— (do not translate)”); preferred terms show source → target.

### 3.5 QaFinding / QaReport (automated pre-review checks)
```ts
QaFinding  = { checkId: string; severity: 'error' | 'warning' | 'info'; message: string;
               sourceExcerpt?: string; targetExcerpt?: string };
QaReport   = { segmentId?: number; findings: QaFinding[]; passed: boolean;
               summary: { error: number; warning: number; info: number } };
```
`passed === false` (any `error`) means the segment should **not** auto-advance — surface this prominently on the segment. Known `checkId`s the panel should group/iconize:
`dnt-identifier-preserved`, `placeholder-markup-preserved`, `placeholder-markup-added`, `untranslated-copy`, `empty-target`, `control-character`/`mojibake`/`replacement-character`/`stray-escape`, `numeric-number-consistency`, `numeric-unit-consistency`, `numeric-length-sanity`, `glossary-term-adherence`, `back-translation-drift`.

### 3.6 ProjectStatusSnapshot (the dashboard + readiness)
```ts
{ project; segments; segmentCounts: Record<TranslationStatus, number>; submissionReady: boolean }
```
`submissionReady` is the PMDA gate predicate — true only when every required segment is `approved` under the guardrails. Surface it as a clear “Submission ready / Not ready” badge with the blocking reasons (unapproved / un-back-translated / machine-only segments).

---

## 4. API (bind to these; do not invent endpoints)

Auth + tenant via the standard `apiRequest`. Uniform error envelope `{ error: { code, message? } }`.

| Action | Endpoint |
|---|---|
| Create project | `POST /api/translation/projects` |
| List projects | `GET /api/translation/projects` |
| Project status + segments | `GET /api/translation/projects/:id` |
| Draft a segment (MT) | `POST /api/translation/projects/:id/segments/draft` |
| Submit post-edit | `POST /api/translation/segments/:id/post-edit` |
| Run back-translation | `POST /api/translation/segments/:id/back-translation` |
| Approve segment (governed) | `POST /api/translation/segments/:id/approve` |
| List / upsert glossary | `GET` / `POST /api/translation/glossary` |

Hooks already exist (`hooks/useTranslation.ts`): `useTranslationProjects`, `useTranslationProject`, `useCreateProject`, `useDraftSegment`, `useSubmitPostEdit`, `useRunBackTranslation`, `useApproveSegment`, `useGlossary`, `useUpsertGlossaryTerm` — mutations invalidate the right query keys (segment + project, since project carries server-computed counts).

> **Wiring note:** the REST routes + AnA tool are the next backend slice. The engine, persistence, status mapping, glossary, and QA are built and tested; the routes are thin wiring over the existing `TranslationService` use-cases. Design can build against the contract now.

---

## 5. Screen-by-screen requirements

### 5.1 Projects dashboard (`Projects.tsx`)
- List: name, `sourceLanguage → targetLanguages`, project `status`, per-language progress (approved/total), and a **Submission-ready** badge.
- Create-project dialog: name, source language, target languages (multi), optional submission context + description.
- Empty / loading / error / no-project-selected states (reuse the shared state helpers).

### 5.2 Segment Workspace (`SegmentWorkspace.tsx`) — the core
- **Side-by-side**: left = source (EN), right = target (JA), per segment. Monospace/segment-keyed rows; CJK font via `:lang(ja)` (already in `index.css`).
- Per-segment **method + status badges** (color **and** text **and** icon — never color alone). Machine drafts visibly marked “unverified draft”.
- **Do-not-translate spans** in the source rendered as locked chips (so reviewers see what must survive verbatim).
- Per-segment **actions**, gated by status/guardrails:
  - Draft (MT) — when `pending`
  - Post-edit (editable target) — when `mt_draft` / `in_progress`
  - Run back-translation — when `in_progress`
  - **Approve** — DISABLED for a `machine`-only segment (no post-edit + back-translation), with an explanatory, **keyboard/SR-accessible** reason (not a bare `title` tooltip). Approving opens a **governed confirm** (password/TOTP re-verify + reason-for-change, mirroring `/api/esignature`).
- Per-segment **QA findings** strip (from `QaFindingsPanel`): error count blocks auto-advance.
- Back-translation evidence: show `backTranslationText` + a similarity/`verified` indicator next to the target.
- Filters: by target language, by status. Header summary: counts + submission-readiness.

### 5.3 Glossary panel (`GlossaryPanel.tsx`)
- Table: source term, target term (or locked-DNT chip), category, verification status, scope (org-wide vs project). Add/edit.

### 5.4 QA findings panel (`QaFindingsPanel.tsx`)
- Findings grouped by severity, each with icon + color + text. Errors flagged as blocking. (Currently prop-driven; a QA-findings endpoint is a near-term backend add.)

---

## 6. Cross-cutting design rules (gates)
- **Part 11 / governed actions** (`regulatory-compliance-ux` skill): approval = visible audit affordance + e-signature + reason-for-change; immutable history; role-scoped visibility.
- **Accessibility** (`accessibility-enforcement`, WCAG 2.2 AA): semantic markup, labelled controls, keyboard-operable, focus-visible, **color never the only signal**. The disabled-approve reason must reach SR/keyboard users (avoid `title`-only tooltips).
- **Microcopy** (`microcopy-tone`): calm, factual, restrained. No exclamations. Status and provenance stated plainly.
- **Motion** (`motion-discipline`): 200ms ease-out, no spring/bounce, respect `prefers-reduced-motion`.
- **Localization**: the product itself is already 19-language i18n (`i18next`), with Japanese era (和暦) + fiscal-year (年度) formatting in `client/src/i18n/format.ts`. A Japanese-speaking reviewer should see a Japanese UI; the *content* being translated is the segment data.

---

## 7. What exists vs. what design owns
- **Exists (backend, tested):** engine + guardrails (hybrid workflow), tenant-scoped persistence repository, DB↔DTO status/method mapping, glossary/DNT masking, translation-memory, QA engine (39 tests), EN↔JA terminology corpus (5 domains, ~280 sourced terms), shared DTO contract.
- **Exists (frontend, first pass):** the four surfaces + hooks/service above — functional, typecheck-clean, hook tests pass. **Needs a design-review + assistive-tech a11y pass** (the disabled-approve tooltip, contrast of inline status colors, and app-shell registration/`layoutMode` are open).
- **Design owns:** visual system, layout, the governed-approve modal, the segment stepper, the bilingual diff/edit affordance, empty/loading/error treatments, and the readiness/QA prominence.

---

## 8. Suggested build order for design
1. Segment Workspace (the differentiator) — bilingual rows + status stepper + guarded actions + QA strip.
2. Governed approve modal (reused from the e-sign affordance).
3. Projects dashboard + readiness badge.
4. Glossary + QA panels.

Run `design-brief` → `brief-to-tasks` → build → `design-review`, with `accessibility-enforcement` and `regulatory-compliance-ux` as gates throughout.
