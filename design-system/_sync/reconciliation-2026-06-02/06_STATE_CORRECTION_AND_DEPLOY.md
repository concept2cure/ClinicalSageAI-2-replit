# State correction + deploy-and-verify — MDX Files tab is already built on concept2cure-v2

**For:** Claude Code (concept2cure-v2). **From:** design-system seat (canonical). **Date:** 2026-06-02.
**Supersedes:** the port instructions in `05_SLICE1_REVIEW.md` and any "Set 2 port" snippet.

## What happened
Claude Code pushed back on the port instructions with evidence that the work is already on the default branch. **I verified that directly against the repo** (`concept2cure/ClinicalSageAI-2-replit`, branch `concept2cure-v2`, commit `d4320be1734b`) and the pushback is correct. Porting the canonical kit `.jsx` over the live `.tsx` would have stripped the live store wiring — a regression. The instructions in `05` are withdrawn. This is the process working as intended: **packet is the design reference, but the live branch is checked before porting; never port over a fuller implementation.**

## Verified ground truth — Set-2 claims vs. the live default branch

Source: `client/src/concept2cure/mdx/surfaces/pathway/FilesTreePane.tsx` @ `d4320be`.

| Set-2 (withdrawn) said to do | Live default branch already has | Evidence |
|---|---|---|
| "make Files tab render all 5 roots" | All 5 roots returned by `buildTree` | `Dossier · Correspondence · Approvals · Audit · Sources` in the `Files` node's `children` |
| "stand up the shared pathwayTabs source" | Exists and imported | `import { PATHWAY_TABS_DATA } from '../../data/pathwayTabs'` |
| "re-pull corrected FilesTreePane (real Approval/Audit fields)" | Already corrected/defensive | `PreviewApproval`: `a.label ?? a.target`, `a.requestor ?? a.requested_by`. `PreviewAudit`: `who: e.actor`, `summary: e.target` |
| "defer dossier-store to Slice 2" | Live store already wired | `import { DossierStore } from '../../store/dossierStore'`; uses `rootFor` / `listDir` / `fs.get` / `subscribeAll` |
| "route Open-in-dossier, defer DossierDrawer" | `DossierDrawer` reported built + mounted in `PathwayPanes.tsx` (consistent with the store wiring above; not independently re-read here) | agent cite: `PathwayPanes.tsx:556` + `:862` |

**Conclusion:** the implementation is at or ahead of canonical for this surface. There is **no port to do** and **nothing to defer** — the Files tab is built and the store is live.

## The only safe action: verify, then deploy live

Paste this into Claude Code (this replaces every prior Set-2 snippet):

> Do **not** port anything from `design-system/_sync/.../files/` for the MDX Files tab — the live `.tsx` is fuller than the kit `.jsx` and porting would regress it. First verify (read-only): `git rev-parse HEAD`; confirm `client/src/concept2cure/mdx/surfaces/pathway/FilesTreePane.tsx` `buildTree` returns all 5 roots (Dossier/Correspondence/Approvals/Audit/Sources); confirm `store/dossierStore.ts` and `data/pathwayTabs.ts` exist and `PathwayPanes.tsx` mounts `DossierDrawer`; run `npm run typecheck && npm run build`. If all true, **make no code change** — the work is on the branch. Then **deploy the default branch** and run the acceptance checklist on the **live URL**: 5 roots render with non-null preview fields; selection survives a data refresh; `--accent-100` → `#d97757` and `--bg-000` → `#faf9f5` resolve at `:root`. CI: only diff-introduced failures block; triage Lint/Security/Integration per `CLAUDE.md` and proceed. Reply: commit SHA · deployed URL · acceptance boxes ticked · token-check yes/no. **If any verify fact is false, stop and report which one before touching code.**

This drives the same outcome — Files tab live on the deployed product — with zero regression risk, and self-corrects if any assumption here is wrong.

## Optional, non-urgent polish (agent's call — NOT a port)
The live `PreviewApproval` still emits two vestigial keys that are always null against the real data (`signers`, `refs`) and omits `stage` / `role` / `meaning` / `signed_at`. Purely cosmetic in a JSON preview. If you want canonical and live to read identically, the clean shape is in canonical `FilesTreePane.jsx` `PreviewApproval`. Skip it if you'd rather not touch a green file.

## Canonical record to fix on the design seat (my side, not yours)
- `01_V2_INSTALL_INVENTORY.md` line "+ pathway panes/CSS ✗ missing / FilesTreePane no port yet" is **stale** — it's installed and live. I'll correct the inventory + ledger so no future review re-issues a port.
- For this surface the direction that matters now is **v2 → canonical** (keep canonical in step with the live `.tsx`), not canonical → v2. No action needed from you beyond the deploy above.

## Unchanged
- Don't gate this on pdev/`mdx_phase2` absorption (operator track, v2 → canonical).
- CI failures on the PR are pre-existing trunk + a Docker-pull infra flake; triage and proceed.
