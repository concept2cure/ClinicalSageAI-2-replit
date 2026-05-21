# PHASE 7 — PDEV install guide for Claude Code

> Companion to `PDEV_IND_DESIGN_BRIEF.md` (project root) and `PHASE_4_INSTALL.md` through `PHASE_8_INSTALL.md`. Phase 7 lands the PDEV (Pharmaceutical Development) workstream — the IND-program counterpart to MDX. Read after Phases 4–8.

---

## 0 · Scope

Phase 7 ships **8 PDEV surfaces** + **3 governed-action overlays** (activity detail sheet, AI drafting workbench, evidence picker) + **1 universal modal** (reason-for-change dialog).

| # | Surface              | Group       | Layout            | Endpoint                              |
|---|----------------------|-------------|-------------------|---------------------------------------|
| 1 | Program dashboard    | overview    | 3-column shell    | `GET /api/pdev/programs/:id`          |
| 2 | Workstream drill     | workstream  | stage strip + grid| `GET /api/pdev/programs/:id/workstreams/:ws` |
| 3 | Activity detail      | sheet       | 6-tab right sheet | `GET /api/pdev/.../activities/:key/*` |
| 4 | IND assembly         | workspace   | 5-module grid     | `GET /api/pdev/programs/:id/ind-assembly` |
| 5 | FDA interactions     | workspace   | timeline + rollup | `GET /api/pdev/programs/:id/fda-interactions` |
| 6 | Contradictions       | workspace   | 2-pane registry   | `GET /api/pdev/programs/:id/contradictions` |
| 7 | AI drafting workbench| modal       | 2-pane streaming  | `POST /api/pdev/.../ai-draft`         |
| 8 | Evidence picker      | sheet       | search + link form| `POST /api/pdev/.../evidence`         |
| 9 | Approval chain       | tab in #3   | step list         | `GET /api/pdev/.../workflow`          |
|10 | Provenance trace     | tab in #3   | 6-section dossier | `GET /api/pdev/.../provenance`        |
|11 | Reason-for-change    | universal modal | gates every governed mutation | (client-only — wraps every mutation route) |

---

## 1 · Files (11 source files in `ui_kits/pdev/`)

| Kit source                          | Lands at                                                  |
|-------------------------------------|-----------------------------------------------------------|
| `data.jsx`                          | `client/src/concept2cure/pdev/data.ts`                    |
| `Icons.jsx`                         | (reuse codebase's `icons.tsx` — Lucide already wired)     |
| `Shell.jsx`                         | `client/src/concept2cure/pdev/shell/{Rail,TopBar,AnaDock}.tsx` |
| `Confirm.jsx`                       | `client/src/concept2cure/pdev/components/ConfirmDialog.tsx` (shared with other modules) |
| `Surfaces.jsx`                      | `client/src/concept2cure/pdev/surfaces/{Overview,Workstream,Assembly,FdaStream,Contradictions}.tsx` |
| `ActivityDetail.jsx`                | `client/src/concept2cure/pdev/surfaces/ActivityDetail.tsx` |
| `AiDraft.jsx`                       | `client/src/concept2cure/pdev/surfaces/AiDraftWorkbench.tsx` |
| `Evidence.jsx`                      | `client/src/concept2cure/pdev/surfaces/EvidencePicker.tsx`|
| `App.jsx`                           | `client/src/concept2cure/pdev/App.tsx`                    |
| `index.html`                        | (harness only — codebase uses `pdev/PdevRoute.tsx` to mount under `/pdev`) |
| `styles.css`                        | `client/src/concept2cure/pdev/app.css` (one file — keep `pdev-` prefixes) |

## 2 · Hooks Phase 7 introduces

```ts
// Program-level
usePdevProgram(programId)                  // GET /api/pdev/programs/:id
usePdevReadiness(programId)                // GET /api/pdev/programs/:id/readiness
usePdevReadinessSnapshot()                 // POST /api/pdev/programs/:id/readiness/snapshot
usePdevFdaInteractions(programId)          // GET /api/pdev/programs/:id/fda-interactions
usePdevFdaFeedbackProposals(programId)     // GET /api/pdev/programs/:id/fda-feedback/proposals
usePdevFdaFeedbackApply()                  // POST /api/pdev/programs/:id/fda-feedback/apply
usePdevContradictions(programId)           // GET /api/pdev/programs/:id/contradictions
usePdevIndAssembly(programId)              // GET /api/pdev/programs/:id/ind-assembly
usePdevCompileIndAssembly()                // POST /api/pdev/programs/:id/ind-assembly/compile

// Workstream + activity
usePdevWorkstream(programId, ws)           // GET /api/pdev/programs/:id/workstreams/:ws
usePdevActivityEvidence(programId, key)    // GET /api/pdev/.../activities/:key/evidence
usePdevActivityWorkflow(programId, key)    // GET /api/pdev/.../activities/:key/workflow
usePdevActivityProvenance(programId, key)  // GET /api/pdev/.../activities/:key/provenance
usePdevActivityStateChange()               // POST /api/pdev/.../activities/:key/state
usePdevActivityAiDraft()                   // POST /api/pdev/.../activities/:key/ai-draft
usePdevActivityEvidenceAttach()            // POST /api/pdev/.../activities/:key/evidence
usePdevActivityEvidenceDetach()            // DELETE /api/pdev/.../activities/:key/evidence/:evId
usePdevWorkflowKickoff()                   // POST /api/pdev/.../activities/:key/workflow/kickoff
usePdevWorkflowDecide()                    // POST /api/pdev/workflow-runs/:runId/checkpoints/:cpId/decision

// Registry (cached — call once at app boot)
usePdevRegistry()                          // GET /api/pdev/registry → { activities, workstreams, stages, states }
```

Every mutation hook MUST receive a `reason: string` parameter and forward it to the route — the codebase's existing audit middleware writes the SHA-256 chain entry with that reason.

## 3 · Nav additions (`mdx/data/nav.ts` or wherever rail config lives)

Per brief §1.1, PDEV is a Domain-tier rail item alongside `mdx` and `biopharma`:

```ts
{ id: 'pdev', label: 'PDEV', icon: 'Beaker', group: 'Domain' },
```

When `pdev` is selected from the home rail, the sub-drawer reveals PDEV's internal nav (8 items grouped Workstream + Workspace + System) — see `ui_kits/pdev/data.jsx > PDEV_NAV_ITEMS` for the verbatim list.

## 4 · ProjectHome integration

PDEV programs are `regulatoryPrograms` rows with `type='IND'`. ProjectHome tile dispatch (per the CONNECTION_PASS.md pattern) should add:

```tsx
{program.type === 'IND' && <Tile to="pdev/overview" />}
{program.type === 'IND' && <Tile to="pdev/ind_assembly" />}
{program.type === 'IND' && <Tile to="pdev/fda_interactions" />}
```

## 5 · Backend — endpoints are already merged

Per the PDEV brief: "The backend is in place — registry, schema, services, routes (14), AnA commands (20), audit, and governance." Phase 7 wires the UI to existing endpoints. No new DB tables, no new server-side code.

The 14 routes:
- `GET    /api/pdev/registry`
- `GET    /api/pdev/programs/:id`
- `GET    /api/pdev/programs/:id/readiness`
- `POST   /api/pdev/programs/:id/readiness/snapshot`
- `GET    /api/pdev/programs/:id/workstreams/:ws`
- `GET    /api/pdev/programs/:id/ind-assembly`
- `POST   /api/pdev/programs/:id/ind-assembly/compile`
- `GET    /api/pdev/programs/:id/fda-interactions`
- `GET    /api/pdev/programs/:id/fda-feedback/proposals`
- `POST   /api/pdev/programs/:id/fda-feedback/apply`
- `GET    /api/pdev/programs/:id/contradictions`
- `GET    /api/pdev/programs/:id/activities/:key/evidence`
- `GET    /api/pdev/programs/:id/activities/:key/workflow`
- `GET    /api/pdev/programs/:id/activities/:key/provenance`

The 20 AnA commands are exposed through the existing tool-use pipeline; the kit's `data.jsx > PDEV_COMMANDS` mirrors the metadata for the slash-menu surface.

## 6 · 8 open questions — accepted recommendations (per brief §9)

All 8 open questions in the brief were answered **yes to all recommended defaults**:

1. **Rail position** — Standalone Domain item (not nested under `biopharma`).
2. **Workstream default** — Grid for ≤ 12 activities, list otherwise. Persist preference in `localStorage` as `pdev.viewMode`.
3. **Provenance export** — Backend job that returns a download link. Surface CTA only in this phase; endpoint lands later.
4. **Approval chain config** — Read-only in Phase 7. Tenant-admin configuration is a Phase 6 (Admin) concern.
5. **Reason-min-length affordance** — Live char count + minimum shown next to the field. Implemented in `Confirm.jsx`.
6. **AnA suggestion ranking** — Source of truth is `PDEV_COMMAND_METADATA.example` strings in registry order, capped at 3 per view.
7. **`superseded` pill** — Neutral muted (drop strikethrough — not in canonical tokens). Implemented as `state-neutral`.
8. **Overview empty state** — Suggest `regulatory.strategy_memo` (kit harness does not show empty state because fixture has activities; production should surface this when `activities=[]`).

## 7 · Editor variants

No new editor variants required for Phase 7. Every PDEV artifact routes to the existing `DocumentEditor` (rebrand for PDEV context to `PdevArtifactEditor` if desired, but the underlying ProseMirror surface is shared) or the `DataSubmissionViewer` for IND assembly file viewing.

## 8 · Acceptance checklist

Mirrors brief §8 with one consolidated pass:

**Token surface:**
- [ ] `colors_and_type.css` imported once at app root, before `pdev/app.css`.
- [ ] `--accent-100` resolves to `#d97757`; `--bg-000` to `#faf9f5`.
- [ ] No hex / font-family / spacing literals in any `pdev-*` component.

**Phase 7.1 — Overview + workstream:**
- [ ] All 4 workstream rollup cards render with mini-bars (complete + blocked) and readiness percent.
- [ ] Stage strip shows `done / active / idle / blocked` against PDEV_STAGES order.
- [ ] Activity grid / list toggle persists in `localStorage` as `pdev.viewMode`.
- [ ] State pills use the 14-state color map from brief §5 (kit's `statePillClass()` helper).
- [ ] AnA dock context block pins program + active activity on every PDEV URL.
- [ ] Suggestion chips swap when nav changes (verify all 8 surfaces against `PDEV_SUGGESTIONS`).

**Phase 7.2 — Activity detail + governed mutations:**
- [ ] All 6 activity tabs render in order: State · Documents · Evidence · Workflow · Provenance · Audit.
- [ ] Every governed action triggers `<PdevConfirmDialog>` with the action's correct `minReason` and `confirmWord`.
- [ ] Confirm dialog disables submit until reason ≥ minimum AND confirm word matches exactly.
- [ ] State change refuses promotion when dependencies aren't satisfied; force-with-reason override is audit-flagged.
- [ ] AI drafting workbench shows quality grade + citations + model attribution.

**Phase 7.3 — IND assembly + FDA + contradictions:**
- [ ] IND assembly 5-module grid uses `grid-template-columns: repeat(5, 1fr)`.
- [ ] Compile CTA disabled when readiness < threshold; force option requires reason ≥ 30 chars + `yes-transmit` confirm word.
- [ ] FDA interaction stream renders all 6 kinds with correct chip colors.
- [ ] FDA feedback rollup shows proposed match confidence; "Apply" opens governed confirmation.
- [ ] Contradiction registry 2-pane layout; selecting a row updates the right detail panel.
- [ ] `blocks_promotion` contradictions surface the "Execute consequence" action with 30-char reason floor.

**Phase 7.4 — Workflow / approval chain:**
- [ ] Approval chain renders every checkpoint in stepIndex order.
- [ ] Approve / Reject buttons gated on role (read from JWT claims).
- [ ] Approval records list shows approver / role / when / comment.
- [ ] On rejection, activity moves to `revision_required` and reason is captured in the audit.

**Cleanup:**
- [ ] Sentence case everywhere. No emoji. No exclamation marks. 13px body. 200ms ease-out.
- [ ] AnA naming consistent (`AnA`, never `Claude` outside model attribution chrome).
- [ ] No legacy PDEV components left in `client/src/concept2cure/`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 9 · Sequence

1. **Database / backend** — already done. Skip.
2. **Tokens + shell** — port `colors_and_type.css` (already there), drop `pdev/app.css`, mount `<PdevRoute>` under `/pdev`.
3. **Registry hook** — `usePdevRegistry()` cached at app boot. Every surface reads from it.
4. **Overview** — read-only, no mutations. First sub-phase to ship.
5. **Workstream drill** — read-only.
6. **Confirm dialog + Activity detail (read tabs only)** — State / Documents / Audit tabs ship before mutations.
7. **Governed mutations** — state change → evidence attach/detach → AI drafting → workflow decisions. Each uses `<PdevConfirmDialog>`.
8. **IND assembly + Compile** — most consequential action; ships after the mutation pipeline is proven.
9. **FDA interactions + feedback rollup**.
10. **Contradictions**.
11. **Provenance** (in Activity detail + standalone deep-link).
12. **New PDEV program wizard** (extends Phase 3 `NewProjectDialog`).

Each sub-phase is independently shippable behind a feature flag.

---

## 10 · End of Phase 7

When the acceptance checklist passes:
- The 14-route PDEV backend is reachable from the UI.
- Every PDEV mutation goes through the reason-for-change confirmation dialog and writes an audit-log entry.
- The AnA dock can drive every PDEV action through natural conversation (the CIRM brief promise).
- IND filings can be assembled, the readiness threshold gated, the compile transmitted to the eCTD pipeline.

Phase 7 closes the open-question list and brings PDEV to feature parity with MDX on the dimensions the brief specifies. Beyond this, the kit awaits Phase 9+ for items emerging from beta client feedback.
