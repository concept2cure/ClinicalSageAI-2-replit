# MDX backend-wiring audit — for Claude Design

**From:** Claude Code (implementation seat)
**Date:** 2026-06-02
**Default branch state:** `concept2cure-v2` @ `6bc17f5` (includes #677, #678, #679)
**Purpose:** ground-truth of what the MDX pathway panes/surfaces now pull from the
real backend vs. fixtures, so Claude Design can plan the next cycle. Honest about
what is *not* done and what can only be confirmed on deploy.

> Per the backlog's policy 3 ("installed = merged + deployed"): everything below
> is **merged** on the default branch but **not yet deployed**. The real data is
> dormant until the Replit pipeline deploys `concept2cure-v2`. There is no GitHub
> Actions deploy job — deploy is a Replit step the operator owns.

---

## 1. Executive summary

This cycle wired the pathway sub-tab panes to the real backend while keeping the
kit UI byte-identical, with kit fixtures as the fallback. **Reads are wired;
governed writes are not.** Every pane *displays* real data on deploy, but every
mutation (e-sign, reject, section save, attach, issue review, lock/submit) still
writes to local/in-memory state — the endpoints and mutation hooks exist and are
unused. Closing that read/write gap is the recommended next cycle.

No kit component's markup changed. One behavioral consequence of async data is
flagged in §4.

---

## 2. What shipped this cycle

| PR | Pane(s) | Read endpoint | Hook |
| --- | --- | --- | --- |
| #678 (merged) | Audit trail | `GET /api/mdx/audit` | `usePathwayTabsData` → `useAuditTrail` |
| #678 (merged) | Correspondence | `GET /api/regulatory-correspondence/correspondence?projectId=` | `usePathwayTabsData` → `useCorrespondence` |
| #678 (merged) | Approvals (list) | `GET /api/approval-workflows/pending` | `usePathwayTabsData` → `useApprovalsPending` |
| #679 (merged) | Files tree + Dossier drawer | `GET /api/c2c/documents?projectId=` → `/:id/outline` → `/:id/sections/:key` | `useDossierHydration` (async-seeds `dossierStore`) |

- Reuses the codebase's existing react-query service layer (`hooks/useProgramTabs`
  + `services/programTabsService`) — no new fetch infrastructure for the list panes.
- `programId` is threaded `K510/Pma/CerSurface → PathwayPanes`. It is treated as the
  canonical **project id** (anchors audit, scopes correspondence + documents).
- Fallback: when there is no `programId`, no matching record, or a request fails,
  the panes render the kit fixtures (`PATHWAY_TABS_DATA`, `dossierStore` seed).
- Tests: `mdx-pathway-panes-smoke` (17) + `design-system-surfaces-smoke` (8) green;
  includes live-data tests that mock each endpoint and assert the kit UI renders
  backend rows, plus the fixture-fallback path (`fetch`→404).

---

## 3. The read/write gap (the headline finding)

The panes are **read-only against the backend.** Every governed mutation is
present in the API and (mostly) in the hook layer, but is **not called** from the
kit UI — it mutates local state instead:

| Action | Kit affordance | Backend endpoint (exists) | Hook (exists) | Wired? |
| --- | --- | --- | --- | --- |
| Approve / reject approval | ApprovalsPane e-sign | `POST /api/approval-workflows/:id/{approve,reject}` | `useApproveWorkflow` / `useRejectWorkflow` | **No** — local optimistic only |
| Review correspondence issue | (drawer / issue list) | `PATCH /api/regulatory-correspondence/issues/:id/review` | `useReviewIssue` | **No** |
| Save section body | DossierDrawer editor | `PATCH /api/c2c/documents/:id/sections/:key` (Part-11 versioned) | — | **No** — `DossierStore.writeSectionBody` (in-memory) |
| Attach evidence | DossierDrawer attach | `POST /api/c2c/documents/:id/sections/:key/evidence` | — | **No** — `DossierStore.attachFile` (in-memory) |
| Lock / submit document | (drawer / pane) | `POST /api/c2c/documents/:id/{lock,submit}` | — | **No** |

`useDossierHydration` already records the backend `documentId` per pathway
(`DossierStore.getBackendDocId`), so the write hooks have the id they need — the
plumbing is half-built. The shared `EsignModal` (HANDOFF phase 16) +
`MUTATION_PRIMITIVES_BRIEF` are the design inputs for wiring these as governed,
reason-for-change-captured actions.

---

## 4. Kit fidelity

- **No markup/visual/structural change** to any kit component: `AuditTrailPane`,
  `CorrespondencePane`, `ApprovalsPane`, `FilesTreePane`, `DossierDrawer` are
  byte-identical to the kit. Wiring lives in hooks + `PathwayPanes` only.
- `PathwayPanes` gained a `programId` prop, two hook calls, and a `key` on
  `FilesTreePane` — no visual change.
- `dossierStore` gained **additive** functions (`hydratePathway`, `clearPathway`,
  `getBackendDocId`); the existing seed + public API are unchanged.

**One behavioral note for the designer.** The kit's `dossierStore` assumed a
synchronous fixture seed, so `FilesTreePane` memoizes its tree on `[pathway]`.
Live data arrives async, so the tree must rebuild when hydration completes. This
is done by bumping a version and re-keying `FilesTreePane` from the parent (no kit
edit). Side effect: **the Files tree's expand/selection state resets once** when
hydration lands (initial program load). If that flash is undesirable, the kit
should specify a loading state or a stable-identity tree. Minor, but it's a real
deviation from the kit's static-seed assumption.

---

## 5. Deploy-verification risk register

These adapters are tested against **mocked** envelopes in CI but their real-shape
correctness can only be confirmed against the running backend. All degrade
defensively (placeholders, never throw), so a mismatch shows wrong/blank fields,
not a crash.

1. **Approvals field mapping (highest risk).** `/api/approval-workflows/pending`
   returns loosely-typed rows (`{ id, ...}`). The adapter guesses field names
   (`target`/`artifact_name`/`assigned_to`/`requested_by`/…). Likely needs
   correction against the real row shape.
2. **Approvals "Signed" history has no source.** The kit's Approvals pane has a
   Signed section, but the only read endpoint is `/pending`. Live approvals
   therefore show **pending only**; Signed is empty. **Design/backend decision:**
   is there a signed/decided-approvals read endpoint, or should that section be
   hidden when live?
3. **Audit `action` → `AuditKind`.** `ACTION_TO_KIND` maps known verbs; unknown
   actions fall back to `access`. Confirm the real action vocabulary.
4. **Dossier program→document association.** Assumes `program.id === c2c_documents.project_id`
   (`?projectId=`), and `pickDoc` selects by `doc_type` hint else most-recent.
   Confirm a program maps to exactly one document and the selection is right.
5. **Section content shape.** `content.paragraphs[].text` → markdown body, with
   string/markdown fallbacks. Confirm the real `content` JSON shape.

---

## 6. Surface inventory (data source, current)

Live-wired reads (pre-existing + this cycle), all with fixture fallback:

- **Pathway surfaces** `K510 / Pma / Cer`: workspace content live
  (`useK510EstarSections`, predicate/SE hooks, `useProgramExtras`) **and** panes
  live (this cycle).
- **Phase-4 cluster:** `Admin` (`useAdmin`), `Analytics` (`useAnalytics`),
  `Engineering` (`useEngineering`), `Udi` (`useUdi`), `Postmarket` (`usePostmarket`),
  `Precedent` (`useSavedPrecedentQueries`).

Appear **fixture-only** (no live read hook detected — confirm before relying):
`MemorySurface`, `Overview`. AnA chat (`AskAnaChip`/`useAnaChat`) streams from its
own endpoint and is out of scope of this audit.

---

## 7. Open decisions for Claude Design

1. **Wire the governed writes? (recommended next cycle.)** §3 is the biggest gap.
   Decide scope/order: e-sign approve/reject first (most visible), then dossier
   save/attach (Part-11 versioned), then lock/submit + issue review. Confirm these
   all route through the shared `EsignModal` + reason-for-change capture.
2. **Approvals "Signed" history** (§5.2) — endpoint or hide-when-live?
3. **Dossier tree remount UX** (§4) — accept the one-time state reset, or specify
   a loading/stable-tree treatment?
4. **Route flip** (from `CLAUDE.md`): `/` and `/concept2cure` still resolve to
   legacy `ZenApp`; the new MDX shell is reachable only at `/concept2cure/mdx`.
   Flipping the catch-all is gated on Phase 3 (Projects shell). Still open.
5. **CMC rail ownership** — unresolved from HANDOFF "Open questions" (CC,
   2026-05-29): standalone `cmc/` module vs Intelligence-cluster CMC tab.

---

## 8. Suggested next-cycle entry point

If Claude Design greenlights write-wiring, the cleanest first slice is **approvals
e-sign** — the mutation hooks (`useApproveWorkflow`/`useRejectWorkflow`) and the
`EsignModal` already exist, the pending list is already live, and it exercises the
full governed-action path (reason capture → ledger → list invalidation) end to
end. That validates the pattern before the dossier Part-11 save/attach follows.
