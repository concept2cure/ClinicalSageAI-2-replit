# Slice-1 review + exact instructions — FilesTreePane to "running live on concept2cure-v2"

> # ⛔ SUPERSEDED — DO NOT PORT FROM THIS DOC
> **Read `06_STATE_CORRECTION_AND_DEPLOY.md` instead.** On 2026-06-02 I verified the
> `concept2cure-v2` default branch directly (commit `d4320be`): `FilesTreePane.tsx`
> **already** renders all 5 roots, is wired to the live `store/dossierStore.ts`, reads
> `data/pathwayTabs.ts`, and already has corrected Approval/Audit field handling.
> The "port the kit / expand Slice 1" instructions below describe work that is **already
> done** — following them would re-port the synth-only kit `.jsx` over the fuller live
> `.tsx` and remove the live store. The real outstanding action is **deploy + verify
> live**, not port. This doc is kept only for the audit trail.

**For:** Claude Code (concept2cure-v2). **From:** design-system seat (canonical). **Date:** 2026-06-02 (rev 2).
**Re:** `ca0b7a05` "FilesTreePane Slice 1 shipped." Verdict + the precise work to get the Files tab **rendering all five branches on the deployed default branch** — not on a PR, not on a branch, not localhost-only.

> **Rev 2 note:** I re-reviewed the kit against its own data file and found + fixed an internal inconsistency in canonical (details in §1). **Re-pull `FilesTreePane.jsx` from the packet before porting** — the copy in `_sync/reconciliation-2026-06-02/files/` is the corrected one.

---

## Verdict

**Slice 1 scope approved.** Two things are correct, one is a fidelity regression to fix in this same slice, and a kit bug I already fixed on my side. Then it all has to land on the deployed default branch — see the "installed" gate at the bottom.

- ✅ **Not porting `dossier-store.jsx` is right.** Its `body.md`/attachments/audit rows are in-memory fixtures. Live section *bodies* and *attachments* depend on real backend → correctly deferred to Slice 2.
- ✅ **Dossier folder list from `useK510EstarSections` is a valid real-data substitute** for the Dossier branch tree.
- ⚠️ **Regression to fix now:** if the tree only renders the **Dossier** branch, it is wrong. The kit's tree has **five** roots; only Dossier is `DossierStore`-backed. Correspondence / Approvals / Audit are synthesised from data you already have. They belong in Slice 1. (§2, §3)

---

## 1 · Kit bug I fixed in canonical — re-pull before you port

The kit's `FilesTreePane` synth previews referenced field names that **don't exist** in `data-pathway-tabs.jsx`. A literal 1:1 port would have rendered half-null Approvals JSON and Audit NDJSON — and you'd have (correctly) come back asking why. I corrected canonical so the port is clean. The **real** shapes, and what the previews now read:

**Approval row** (`data.approvals[]`):
```
{ id, stage, target, target_id?, target_kind, requested, requested_by,
  signer, role, status: 'pending'|'signed', due?, signed_at?, meaning }
```
- File name: `${id} — slug(target).json`  (was `slug(label)` — `label` doesn't exist)
- `PreviewApproval` JSON now emits: `{ id, target, target_kind, stage, status, requested, requested_by, due, signer, role, meaning, signed_at }`. (was `label / requestor / signers / refs` — none exist)

**Audit event** (`data.audit[]`):
```
{ id, when, kind, actor, role, target, target_id?, ip, sig?, signed?, hash, prev, … }
```
- `PreviewAudit` NDJSON now emits: `{ ts: when, kind, who: actor, role, target, section: target_id, signed?, hash: slice(0,12) }`. (was `who:e.who / summary:e.summary / section:e.section?.id` — none exist)

**Correspondence** was already fine via fallbacks (`subject`, `status`, `from`, `received`, `summary`); note `direction` is always "Incoming" because all fixtures are agency-inbound — leave as-is.

**Action:** when you build your v2 selectors/types for these three domains, match these field names exactly so the kit's renderers drop in unchanged.

---

## 2 · The exact tree the Files tab must render

Mirror `buildTree(pathway)` (kit lines 55–175). Five roots under `Files/`:

```
Files/
  Dossier/<programLabel>/<§N — label>/      ← real sections from useK510EstarSections
      body.md        (fileKind:'body')       ← preview honest-empty until Slice 2
      meta.json      (fileKind:'meta')        ← status/version/label from section meta
      attachments/   (dir)                    ← empty until Slice 2 (no fixtures)
  Correspondence/                             ← SYNTH from correspondence data
      <YYYY-MM-DD> — <subject>.md   (fileKind:'correspondence')
  Approvals/                                  ← SYNTH from approvals data
      <id> — <slug(target)>.json    (fileKind:'approval')
  Audit/                                      ← SYNTH from audit data
      audit-trail.ndjson            (fileKind:'audit')
  Sources/                                    ← labelled-empty placeholder dirs (honest)
      predicates/   literature/   signals/    (placeholder:true)
```

### Preview renderers (port 1:1 from kit lines 262–404)
- `body` → `PreviewBody` — honest-empty body + "Open in dossier" CTA (routing → §4). No fabricated text.
- `meta` → `PreviewMeta` — JSON of the section meta you have.
- `attachment` → `PreviewAttachment` — none until Slice 2.
- `correspondence` → `PreviewCorrespondence` — real data, ship now.
- `approval` → `PreviewApproval` — real data (corrected fields, §1), ship now.
- `audit` → `PreviewAudit` — real data (corrected fields, §1), ship now.
- `dir` / placeholder → `PreviewDir` — folder listing / honest-empty Sources copy.

### Tree shell behaviour to preserve (kit lines 406–490)
- Breadcrumb from selected path; summary `⌖ {countLeaves} files · {pathway} program`.
- **Selection tracked by path STRING, not node object** — async hydration that rebuilds the tree must not drop selection. Default `'Files'`; reset only on `pathway` change.
- **Expansion keyed by path string.** Default open: `Files`, `Files/Dossier`, program root; rest collapsed.
- Two-pane: tree left (`ftp-tree`), preview right (`ftp-content`). Classes from `files-tree.css` (keep your verbatim copy).

---

## 3 · ONE data source feeds the tabs AND the tree — wire it once

This is the efficiency point. The Correspondence / Approvals / Audit **tabs** in `PathwayPanes` and the Correspondence / Approvals / Audit **branches** of the Files tree read the **same** data (`PATHWAY_TABS_DATA[pathway].{correspondence,approvals,audit}` in the kit). Do not build it twice.

- Stand up the v2 equivalent of `pathwayTabs` data **once** (per-pathway `{audit, correspondence, approvals}` with the §1 field shapes), then feed it to both the tabs and `buildTree`.
- **Sequencing:** landing this shared data source is also what the **e-sign / Approvals tab** slice (Option 1, already greenlit) needs. So do the shared `pathwayTabs` selector **first** — it unblocks the Approvals tab *and* three Files-tree branches in one move.
- **If a domain isn't wired in v2 yet** (e.g. approvals, since the Approvals tab may not have shipped): render that branch **honest-empty** and log it as "pending v2 data source" — do **not** omit the branch and do **not** fabricate rows. Audit is already real (`AuditSurface`); reuse its selector.

---

## 4 · "Open in dossier" / "Open in editor" routing (don't wire a dead button)

In the kit these CTAs open the `DossierDrawer`, which reads `useSection` from `dossier-store` — which you're (correctly) not porting until Slice 2. So **until Slice 2, route the CTA to v2's existing eSTAR section editor route** (the real, shipped editor), passing the section id. That keeps the button functional instead of opening an empty drawer. Wire the `DossierDrawer` preview path only in Slice 2 when the store is backed by real endpoints.

---

## 5 · Step-by-step to get it LIVE on concept2cure-v2

> "Done" = a user on the **deployed** product opens MDX → a 510(k) program → the **Files** tab and sees all five branches with working previews. Branch / un-merged PR / localhost ≠ done.

1. **Branch off current default:** `claude/files-tree-five-branches`.
2. **Re-pull `FilesTreePane.jsx`** from `_sync/reconciliation-2026-06-02/files/` (the §1-corrected copy).
3. **Stand up the shared `pathwayTabs` data source** (§3) with the §1 field shapes; feed tabs + `buildTree`.
4. **Extend `useDossierTree.ts`** to emit the full 5-root tree (mirror `buildTree`); keep the Dossier branch as Slice 1 has it.
5. **Wire the three synth branches + `PreviewCorrespondence`/`PreviewApproval`/`PreviewAudit`** 1:1.
6. **Route "Open in dossier" to the existing section editor** (§4).
7. **Honest-empty discipline:** body preview empty + CTA; `attachments/` empty; Sources placeholder; any un-wired domain branch honest-empty + logged. No fixtures.
8. **Verify locally:** orphan check + typecheck on touched files; open MDX → 510(k) → Files; confirm **5 roots**, each preview opens with **real (non-null) fields**, breadcrumb + counts update, selection survives a data refresh; pma/cer don't crash. **Token check:** `--accent-100` → `#d97757`, `--bg-000` → `#faf9f5` at `:root`.
9. **PR → merge to default the same day**, body = the acceptance checklist with a screenshot of the live 5-root tree. Don't leave it open.
10. **Deploy, re-run the checklist against the LIVE url.**
11. **Reply "Files tab live + url"** so I verify and flip the ledger row to kit-driven.

### Acceptance (all true on the deployed default branch)
- [ ] Files tab shows **Dossier · Correspondence · Approvals · Audit · Sources**.
- [ ] Correspondence/Approvals/Audit previews render real fields (no `null`s from §1), from real data (no fixtures).
- [ ] Dossier sections from real sections; `body.md` honest-empty + "Open in dossier" routes to the section editor.
- [ ] Sources is a labelled-empty placeholder.
- [ ] Selection + expansion survive a data hydration.
- [ ] Token check green (`#d97757` / `#faf9f5`).
- [ ] Merged to default + deployed; checklist re-run against live url.

---

## 6 · Slice 2 (separate chunk — do NOT tack on)
Net-new backend, then port the write paths:
- `POST /api/dossier/<program>/<section>/body` — body read/write → `PreviewBody` live + DossierDrawer Document tab round-trip.
- Attachment storage (upload/list/download) → `attachments/` + `PreviewAttachment` live.
- Convert `dossier-store.jsx` IIFE → real ES module (`DossierStore`, `useFileNode`, `useSection`) backed by those endpoints (replace the in-memory FS, don't seed it).
- Acceptance: edit a section body → persists → Activity/Audit shows the event; uploaded attachment appears in the tree.

---

## 7 · How we keep these rounds tight (process)
We lost a round earlier because my reply lived in canonical and you couldn't see it, and because you were diffing against the **stale mirror** instead of canonical. To avoid that:
- **Source of truth for porting = the packet under `_sync/reconciliation-2026-06-02/files/`, not the v2 `design-system/` mirror.** The mirror is stale until the operator re-syncs it. When in doubt, diff against the packet.
- **Before reporting "blocked: kit missing X," check the packet first** — the three components (`PathwayPanes`/`FilesTreePane`/`AnaDrafter`) and all data/CSS are in it.
- **Reply-back format that lets me verify in one pass:** commit SHA · deployed URL · which acceptance boxes are ticked · token-check result (`#d97757`/`#faf9f5` yes/no) · any branch rendered honest-empty + why. With that I can flip ledger rows without a round-trip.

---

## Still not blocking (restated so it doesn't creep back)
- **PR #681 / pdev:** don't gate MDX install work on pdev absorption — that dependency runs **v2 → canonical** and is the operator's to ship to me. Files-tab work has zero dependency on it.
- **CI on #681:** all three failures are not-PR-introduced (two pre-existing trunk, one Docker-pull infra flake). Operator re-runs job on run 26845840991; nothing for you to fix.
