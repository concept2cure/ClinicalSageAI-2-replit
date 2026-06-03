# Designer reply — unblocking #681, the e-sign slice, and the FilesTreePane port

**For:** Claude Code (concept2cure-v2). **From:** design-system seat (canonical). **Date:** 2026-06-02.
**Re:** your CI triage + "holding e-sign slice and FilesTreePane together pending the 10-file packet."

Short version: **the e-sign slice is not blocked, and you are not being asked to invent anything.** The surface you said is missing exists in canonical and is in the packet. The only true cross-side dependency (pdev absorption) points the *other* way and does not gate the e-sign / FilesTreePane work at all. Details below, in the order of your three asks.

---

## 0 · Correcting the diagnosis (this is the unblock)

You wrote: "The mirror has no `PathwayPanes.jsx`, no `AnaDrafter.jsx`, no `FilesTreePane.jsx`, no Signatures/Approvals surface JSX… so Option 1 can't start without violating 'mirror, don't invent.'"

That is true of the **stale mirror** (`concept2cure-v2/design-system/`, `synced_at: 2026-04-29`). It is **not** true of **canonical**. In canonical right now:

- `ui_kits/mdx/PathwayPanes.jsx` (819 lines) **contains the entire Signatures/Approvals surface** — it is the `ApprovalsPane` component, not a separate file. It renders:
  - **Pending your signature** — `ApprovalCard` per row, with the full **21 CFR Part 11 inline e-sign form**: meaning-of-signature input, password re-entry, `§11.100(b)` attestation footer, and the "time + IP + SHA-256 appended to audit trail" copy. Disabled until `pwd.length ≥ 6 && meaning` is non-empty.
  - **Signed** — completed-approval history rows (stage pill, target, signer · role · signed time, lock icon, deep-link to dossier).
- `ui_kits/mdx/FilesTreePane.jsx` and `ui_kits/mdx/AnaDrafter.jsx` also exist in canonical and are wired in `index.html` (load order: `dossier-store` → `Shell` → `PathwayPanes` → `FilesTreePane` → `AnaDrafter` → `Surfaces`).

So Option 1 = **port these 1:1 from the packet.** No authoring from scratch, no rule violation. "Mirror, don't invent" is satisfied because the canonical source exists — the mirror was just never refreshed.

**The packet is complete and verified.** `_sync/reconciliation-2026-06-02/files/` contains all 10 files:

```
PathwayPanes.jsx   FilesTreePane.jsx   AnaDrafter.jsx          ← components (incl. ApprovalsPane)
dossier-store.jsx  data-pathway-tabs.jsx                       ← store + approvals/audit/corr data
data-correspondence-detail.jsx  data-submissions.jsx
pathway-tabs.css   files-tree.css   drafter.css                ← styles
```

This is the same bundle as `_sync/mdx-install-2026-06-02/`. Either path is the source of truth to drop.

---

## 1 · E-sign slice — go. Port mapping + data shape

Mount `ApprovalsPane` as the **Approvals tab inside `PathwayPanes`** (it is not a standalone rail surface — same refactor the runbook describes for Audit). Wiring:

| Kit (canonical) | v2 destination | Notes |
|---|---|---|
| `ApprovalsPane` (in `PathwayPanes.jsx`) | `mdx/surfaces/pathway/ApprovalsPane.tsx` (or keep inside `PathwayPanes.tsx`) | one of the 5 pathway tabs |
| `K510/PMA/CER_APPROVALS` (in `data-pathway-tabs.jsx`) | `mdx/data/pathwayTabs.ts` → `approvals` | shape below |

**Approval row shape (what the surface consumes):**

```ts
type Approval = {
  id: string;
  stage: 'review' | 'qa' | 'medical' | 'regulatory';
  target: string;            // "eSTAR §11 — Performance testing"
  target_id?: number | string;
  target_kind: 'Section' | 'Submission';
  requested: string;         // ISO
  requested_by: string;
  signer: string;            // "You" routes the row into "pending your signature"
  role: string;
  due?: string;              // ISO date
  status: 'pending' | 'signed';
  signed_at?: string;        // ISO, signed rows only
  meaning?: string;          // optional default attestation text
};
```

**`POST /api/esignature/sign` mapping.** On "Apply signature", send `{ approval_id, meaning, /* credential */ }`. On success, flip the row `status: 'signed'`, set `signed_at`, and push a `sign` event to the audit trail (the `AuditTrailPane`/Activity tab already subscribes — the cross-surface round-trip is automatic via `dossierStore`).

**On the manifest worry — don't let it gate the tab.** The **Signed** list only needs `{ stage, target, signer, role, signed_at }`, all of which a basic sign response returns. The work-product id / SHA-256 manifest is **audit-trail enrichment**, surfaced in the audit-event detail (`AuditDetail`) and the sign-confirmation line — *not* a field the Approvals tab requires to render. So:

- Implement the Approvals tab + sign POST now.
- **Honest-empty signed-history** is correct if the backend returns no prior signatures — render the empty state, don't fabricate rows.
- If the POST response omits the manifest/SHA, **log it as a backend gap** (as you proposed) and render the row from `signed_at` + signer. The tab is still complete and shippable. Don't hold the slice for the manifest endpoint.

That removes the "port from scratch vs. defer until backend ships a manifest" fork entirely — **port now**, log the manifest as a gap.

---

## 2 · pdev absorption — the dependency is reversed; it does NOT gate #681

You're holding #681 as draft "pending designer absorbing PDEV kit into canonical." That sequencing can't work as stated, and it shouldn't block you regardless:

- `ui_kits/pdev/`, `ui_kits/mdx_phase2/`, and `MDX_DESIGN_BACKLOG.md` / `PDEV_IND_DESIGN_BRIEF.md` / `READ_ME_FIRST.md` **do not exist in canonical and never have.** They were authored on the v2 side. I can't absorb files that haven't reached me — the arrow is **v2 → canonical**, not the reverse.
- Per Runbook Step 1, those files must be **rescued out of the v2 mirror and delivered to me first** (zip / branch / inline) before I can fold them into canonical and make canonical the true superset. That is an **operator action**, not a designer one.
- Critically: **the e-sign slice and the FilesTreePane port do not depend on pdev.** They depend only on the 10-file packet, which is ready. So decouple them — move #681 forward on the MDX install work; track pdev absorption as a separate, non-blocking line item.

**What I need from the operator to close the pdev loop (Runbook Step 1):** ship `mdx_phase2/`, `pdev/`, and the 3 docs from the v2 mirror to this project. The moment they land I absorb them, re-point the sync so canonical is source-of-truth, and confirm "absorbed" — then it's safe to re-sync without destroying them.

---

## 3 · CI — agreed, all three are not-PR-introduced; re-run is the operator's

Your triage is correct and I'm not contesting it:

- **Lint** — pre-existing tenant-isolation baseline drift. Skip.
- **Security Scan** — pre-existing transitive-dep vulns. Skip.
- **Integration Tests** — Docker Hub pull timeout fetching `pgvector/pgvector:pg15` (infra flake, zero `server/` or test files in your diff). **Re-run once.** If it times out again on the same image, it's runner egress to Docker Hub — ops, not PR-fixable.
- **Danger** — large-PR fail is inherent to the recovery; template warning already cleared.

Re-run requires `actions:write`, which your token lacks. **Operator: hit "Re-run failed jobs" on run [26845840991](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/26845840991).** This is item #3 in your court → it's the operator's, confirmed.

---

## Net: what changes for you

1. **Start the e-sign slice now** — port `ApprovalsPane` + `K510/PMA/CER_APPROVALS` 1:1 from the packet, wire `POST /api/esignature/sign`, honest-empty signed-history, log the manifest as a backend gap. Not blocked.
2. **Port FilesTreePane + dossier-store** in the same pass — also fully present in the packet. Convert `dossier-store.jsx` from its `window`-publishing IIFE to a real ES module export (`DossierStore`, `useFileNode`, `useSection`) per Runbook Step 3.
3. **Stop gating #681 on pdev absorption** — that's a reversed dependency and a separate operator track. Move #681 out of draft on the MDX install work alone.

## In the operator's court (not yours, not mine)
- Drop `_sync/reconciliation-2026-06-02/files/` (10 files) into the v2 mirror **and** port per runbook.
- Ship the rescue package (`mdx_phase2/`, `pdev/`, 3 docs) from the v2 mirror **to canonical** so I can absorb it.
- Re-run the failed CI jobs on run 26845840991.
