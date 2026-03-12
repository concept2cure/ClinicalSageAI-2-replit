# Phase 2 Dossier Discovery — Factual State

Base commit: `1ead5e51` on `concept2cure-v2`

---

## 1. What Is Live

| Component                  | File                                                                     | Lines | Status                                                |
| -------------------------- | ------------------------------------------------------------------------ | ----- | ----------------------------------------------------- |
| CTD Hierarchy Model        | `client/src/concept2cure/models/ctdHierarchy.ts`                         | 910   | Live — ICH CTD Modules 1-5, 100+ nodes                |
| DossierTree                | `client/src/concept2cure/components/workspace/DossierTree.tsx`           | 368   | Live — renders in left rail "Dossier" mode            |
| TemplateTree               | `client/src/concept2cure/components/workspace/TemplateTree.tsx`          | 160   | Live — renders in left rail "Templates" mode          |
| DocumentOutlineTree        | `client/src/concept2cure/components/workspace/DocumentOutlineTree.tsx`   | 258   | Built but NOT wired into shell                        |
| PlacementDialog            | `client/src/concept2cure/components/workspace/PlacementDialog.tsx`       | 354   | Live — opens on dossier context menu                  |
| ProjectWorkspaceShell      | `client/src/concept2cure/components/workspace/ProjectWorkspaceShell.tsx` | 555   | Live — 3-pane shell with Files/Dossier/Templates tabs |
| ProjectFileTree            | `client/src/concept2cure/components/workspace/ProjectFileTree.tsx`       | 265   | Live — Codespaces-style folder explorer               |
| DocumentListPane           | `client/src/concept2cure/components/workspace/DocumentListPane.tsx`      | 154   | Live — table view of docs in selected folder/section  |
| EditorPanel                | `client/src/concept2cure/components/editor/EditorPanel.tsx`              | 1205  | Live — full document editor with inspector drawers    |
| Backend placement endpoint | `server/routes/concept2cure.ts` L2166                                    | ~120  | Live — PUT placement with audit + provenance          |
| Backend concept2cure route | `server/routes/concept2cure.ts`                                          | 4127  | Live — full CRUD, signatures, provenance, audit       |

## 2. What Is Synthetic / Not Yet Real

| Item                                               | Status                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Dossier rollup metrics                             | Not computed — no endpoint, no aggregation                                             |
| Completion percentages                             | Not computed — no backend logic                                                        |
| Evidence linkage counts                            | No formal linkage model. Provenance events exist but no CSR evidence count per section |
| Precedent counts                                   | Not modeled                                                                            |
| Document Outline Tree wiring                       | Component built, not rendered in workspace                                             |
| Cut/paste move                                     | Not implemented                                                                        |
| Drag/drop                                          | Explicitly deferred                                                                    |
| Section requirements view                          | Not implemented                                                                        |
| Document tree-awareness (CTD breadcrumb in editor) | Not implemented                                                                        |

## 3. Artifact Fields on `concept2cure_artifacts` Table

| Column            | Type          | Notes                                   |
| ----------------- | ------------- | --------------------------------------- |
| `id`              | serial PK     | Internal DB id                          |
| `artifact_id`     | text unique   | External id (`artifact_xxx`)            |
| `project_id`      | int FK        | Links to project                        |
| `organization_id` | int FK        | Tenant isolation                        |
| `type`            | text          | e.g. `regulatory_document`, `markdown`  |
| `category`        | text          | e.g. `document`, `interactive`          |
| `title`           | text          | Document title                          |
| `content`         | text          | HTML content                            |
| `content_hash`    | text          | SHA-256 integrity                       |
| `version`         | int           | Version number                          |
| `ctd_section`     | text nullable | eCTD section reference (e.g. `3.2.S.1`) |
| `template_id`     | text nullable | Source template key                     |
| `status`          | text          | `draft`, `review`, `approved`, `locked` |
| `locked_at`       | timestamp     | When locked                             |
| `locked_by_id`    | int FK        | Who locked                              |
| `created_by_id`   | int FK        | Creator                                 |
| `metadata`        | json          | Flexible metadata                       |
| `created_at`      | timestamp     | Creation time                           |
| `updated_at`      | timestamp     | Last update                             |

## 4. Evidence Linkage — What Exists Today

- **Provenance events table** (`concept2cure_provenance_events`) — tracks `eventType` including `placement`, `generation`, `edit`, `source_input`, etc.
- **No dedicated evidence linkage table**. CSR evidence is not formally linked per CTD section.
- **Provenance events with `eventType='placement'`** record placement operations with `fromSection`, `toSection`, `reason`. These can be queried per section.
- **Provenance events with `eventType='source_input'`** could indicate evidence source but are not aggregated by CTD section today.

## 5. Template Groups (IND_TEMPLATES)

| Template Group          | CTD Section     | Sub-templates                                                                                                                   |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Clinical Overview       | 2.5             | Benefit-Risk, Clinical Context, Key Studies, Regulatory Positioning, Regional Differences                                       |
| Clinical Summary        | 2.7             | Biopharm Summary (2.7.1), PK Summary (2.7.2), Efficacy Summary (2.7.3), Safety Summary (2.7.4)                                  |
| Drug Substance          | 3.2.S           | Gen Info (S.1), Manufacture (S.2), Characterisation (S.3), Control (S.4), Ref Standards (S.5), Container (S.6), Stability (S.7) |
| Drug Product            | 3.2.P           | Desc (P.1), Dev (P.2), Mfg (P.3), Excipients (P.4), Control (P.5), Ref Standards (P.6), Container (P.7), Stability (P.8)        |
| Nonclinical Overview    | 2.4             | Pharmacology, PK, Toxicology                                                                                                    |
| Cover Letter            | 1.2             | Initial IND, Amendment                                                                                                          |
| Clinical Study Report   | 5.3.5           | Synopsis, Protocol, SAP, Efficacy Results, Safety Results                                                                       |
| Quality Overall Summary | Not defined yet | —                                                                                                                               |

### CTD Sections WITHOUT Template Coverage

Priority gaps:

- `1.1` Forms — no template
- `1.3` Administrative Info — no template
- `1.6` (not in hierarchy) — N/A
- `1.7` (not in hierarchy) — N/A
- `2.3` Quality Overall Summary — no dedicated template group
- `2.6` Nonclinical Written/Tabulated Summaries — no template
- `4.2` Nonclinical Study Reports — no template
- `4.3` Literature References — no template
- `5.2` Tabular Listing — no template
- `5.3.7` Case Report Forms — no template

## 6. Drag-and-Drop Status

**Explicitly deferred in Phase 1.** Phase 2 will implement cut/paste first. Drag-and-drop only after:

- Locked documents reject movement ✓ (done in Phase 1)
- Provenance fires on every move ✓ (done in Phase 1)
- Audit entries queryable ✓ (done in Phase 1)
- Cut/paste flow proven (Phase 2 deliverable)
- Status impacts visible (Phase 2 deliverable)
