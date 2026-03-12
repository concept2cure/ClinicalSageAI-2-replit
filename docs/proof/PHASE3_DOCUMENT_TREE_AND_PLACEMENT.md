# Phase 3 — Document-Centric Workspace: Build Proof

**Date**: 2026-02-14  
**Branch**: `concept2cure-v2`  
**Base commit**: `ec0959bd` (Phase 2 complete)

---

## What Was Built

### 3A — Document Tree Awareness
1. **Active document context band** — Persistent strip above the tree area showing the
   currently-open document's title, CTD section badge, template ID badge, status pill,
   and version tag. Persists across Files/Dossier/Templates/Outline mode switches.
   (`data-testid="active-doc-context"`)
2. **Outline alignment signals** — `DocumentOutlineTree` now fuzzy-matches each heading
   against the source template structure and CTD section keywords, tagging rows with
   violet `Tpl` or blue `CTD` alignment tags.
3. **Template structure subview** — Segmented toggle (Outline | Structure) shows expected
   subsections from the template. Each subsection shows ✓ present, ⚠ missing required,
   or ○ optional status. Summary footer shows `present/total` and missing count.

### 3B — Template Hierarchy Expansion
4. **TEMPLATE_STRUCTURE_MAP** — 14 template keys mapped to expected subsections
   (tpl-ds-gen-info, tpl-ds-manufacture, tpl-m2-2.3, tpl-m2-2.5, tpl-m5-csr, etc.).
5. **Enriched TemplateNode** — `appliesTo`, `suggestedChildren`, `requiredBlocks`,
   `optionalBlocks` added to 8 major template entries.
6. **Enriched SectionRequirement** — `requiredChildren`, `optionalChildren`,
   `commonMissingBlocks`, `starterTemplatesAvailable`, `templateKeys`.
7. **Create missing subsection** — `+` button in template structure view scaffolds
   missing content into the active document via version endpoint.

### 3C — Movement/Placement UX
8. **Enhanced pending move banner** — Shows destination preview (from → to) with
   approved document warning and locked document blocking.
9. **DnD feature flag** — `ENABLE_GOVERNED_DND = false` groundwork constant placed.

### 3D — Dossier Intelligence
10. **DossierTree warning signals** — Amber alert icon for sections with docs but no
    evidence/precedents. Blue `T` chip for sections with templates but no documents.
11. **Upgraded section requirements panel** — Extracted `SectionRequirementsPanel`
    component showing expected documents, starter templates, common missing blocks,
    expandable child sections, and color-coded completion bar with warning signals.

### 3E — Explorer & Polish
12. **Expandable document rows** — DocumentListPane rows have a chevron toggle revealing
    CTD path with label, template ID, and full timestamp.
13. **PlacementDialog impact statement** — Regulatory placement impact warning shown on
    relocate operations, with special messaging for approved and locked documents.
14. **Scale fixes** — All tree/list headers tightened from h-9/h-10 to h-8 (breadcrumb,
    explorer, dossier, templates, document list).

## What Was Deferred

- Drag-and-drop implementation (flag placed, behind `ENABLE_GOVERNED_DND = false`)
- Backend missing-subsection enumeration in dossier-metrics (frontend uses client-side
  template structure comparison instead)
- Versioned subsection scaffolding via dedicated backend endpoint (uses existing
  `/versions` POST endpoint instead)

## Runtime Proof

### E2E: `document-focus-view.spec.ts`
```
2 passed (29.7s)
```
- 1366×768: ✓ all assertions passed, `active-doc-context` visible in testid log
- 1440×900: ✓ all assertions passed, `active-doc-context` visible in testid log
- No React errors, no HTTP 500s

## Risks

1. `handleCreateSubsection` appends HTML to `activeDocContent` — may need editor
   refresh hook to sync TipTap state (currently relies on re-load).
2. Fuzzy match threshold (50% token overlap) may produce false positives on very
   short headings (e.g., single-word labels).
3. DnD flag is `false` — no runtime impact, but will need event handlers once enabled.

## Files Changed

| File | Lines | Summary |
|------|-------|---------|
| `ctdHierarchy.ts` | +316 | TEMPLATE_STRUCTURE_MAP, enriched templates, structure API |
| `DocumentOutlineTree.tsx` | +325/-106 | Alignment signals, structure view, create subsection |
| `ProjectWorkspaceShell.tsx` | +421/-207 | Context band, wiring, enhanced panel, DnD flag |
| `DossierTree.tsx` | +27 | Warning signals, templateCoverage type |
| `DocumentListPane.tsx` | +214/-103 | Expandable rows with detail band |
| `PlacementDialog.tsx` | +23 | Impact statement, status/version display |
| `ProjectFileTree.tsx` | +2/-2 | Scale fix (h-9 → h-8) |
| `TemplateTree.tsx` | +2/-2 | Scale fix (h-9 → h-8) |

**Total**: 9 files, +1208/-219 lines
