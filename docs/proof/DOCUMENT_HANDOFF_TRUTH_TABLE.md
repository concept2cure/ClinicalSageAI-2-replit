# Task J — Document Handoff Truth Table

**Date**: 2026-03-11
**Branch**: `concept2cure-v2`
**Methodology**: Static code trace of all `setPendingEditorContent` calls in `ZenApp.tsx` and `EditorPanel.tsx` auto-create flow

---

## Architecture

```
Module Button Click
    → setPendingEditorContent({ content, title, ctdSection })
    → setLayoutMode('regulatory-workspace')
    → EditorPanel receives initialContent, initialTitle, initialCtdSection
    → Auto-create useEffect fires POST /api/concept2cure/projects/:projectId/artifacts
    → Server inserts artifact row + version row + provenance event
```

---

## Truth Table — All Entry Points

| #   | Module        | Entry Point            | ctdSection                     | → EditorPanel | → API | → DB | Verdict |
| --- | ------------- | ---------------------- | ------------------------------ | :-----------: | :---: | :--: | :-----: |
| 1   | IND Workspace | `onOpenSection`        | `sectionCode.replace(/^m/,'')` |      ✅       |  ✅   |  ✅  |  PASS   |
| 2   | IND Workspace | `onDraftWithAI`        | `sectionCode.replace(/^m/,'')` |      ✅       |  ✅   |  ✅  |  PASS   |
| 3   | eCTD CoAuthor | `onOpenInEditor`       | `section.number`               |      ✅       |  ✅   |  ✅  |  PASS   |
| 4   | CMC Platform  | Draft 3.2.S            | `'3.2.S'`                      |      ✅       |  ✅   |  ✅  |  PASS   |
| 5   | CMC Platform  | Draft 3.2.P            | `'3.2.P'`                      |      ✅       |  ✅   |  ✅  |  PASS   |
| 6   | CMC Platform  | Draft 3.2.A            | `'3.2.A'`                      |      ✅       |  ✅   |  ✅  |  PASS   |
| 7   | RI Copilot    | `onDraftFromPrecedent` | ✅ (from callback)             |      ✅       |  ✅   |  ✅  |  PASS   |
| 8   | RI Panel      | `onCreateDocument`     | ✅ (from callback)             |      ✅       |  ✅   |  ✅  |  PASS   |
| 9   | RI Copilot    | Evidence Analysis CTA  | `undefined` (correct)          |      ✅       |  ✅   |  ✅  | PASS\*  |

\*Entry #9: `ctdSection: undefined` is intentional — this is a general evidence summary document, not tied to a specific CTD section.

---

## Governance Guarantees

| Property                  | Enforced? | How                                                                           |
| ------------------------- | :-------: | ----------------------------------------------------------------------------- |
| Active project required   |    ✅     | `projectId` required by EditorPanel auto-create; API validates project access |
| Artifact persisted to DB  |    ✅     | `concept2cure_artifacts` table, `concept2cureArtifactVersions` table          |
| Provenance event emitted  |    ✅     | `emitProvenanceEvent()` called after every insert                             |
| Content hash computed     |    ✅     | SHA-256 stored in artifact + version + provenance                             |
| Version history immutable |    ✅     | Version records are insert-only, never updated                                |
| Actor attribution         |    ✅     | `created_by_id`, `actor_email` from JWT                                       |
| ctdSection stored         |    ✅     | Top-level `ctdSection` in Zod schema + DB column                              |

---

## Ungoverned Flows

| Check                                   | Result                                                           |
| --------------------------------------- | ---------------------------------------------------------------- |
| Chat-only flows that bypass EditorPanel | None — Lumen Cortex (the only chat-only surface) has been hidden |
| Direct content export without artifact  | None found                                                       |
| Modules that skip provenance            | None found                                                       |

---

## Verdict

**9/9 entry points verified** — all document creation flows route through EditorPanel → governed artifact with provenance.

**PASS**
