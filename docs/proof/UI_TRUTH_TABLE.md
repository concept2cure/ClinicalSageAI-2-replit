# Task L — Left Rail UX Truth Check

**Date**: 2026-03-11
**Branch**: `concept2cure-v2`

---

## Sidebar Structure (ZenSidebar.tsx)

### Module Rail Groups

| Group             | Items                                                                         | Nav Targets                                                             | All Routed? |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- | :---------: |
| **Workspaces**    | RI Copilot, IND Workspace\*, eCTD Co-Author, CMC Platform, Clinical Trial Hub | `ai-copilot`, `ind-workspace`, `ectd-coauthor`, `cmc`, `clinical-trial` |     ✅      |
| **Evidence**      | Evidence Search, CSR Repository, Historical Outcomes, Precedent Intelligence  | `evidence-search`, `evidence-search`, `evidence-search`, `ai-copilot`   |     ✅      |
| **Documents**     | Document Vault, Active Dossier, Drafts                                        | `document-vault`, `ind-workspace`, `document-vault`                     |     ✅      |
| **Governance**    | Provenance, Version Compare, Review Comments, Signatures, Audit Reports       | All → `ai-copilot` (RI Copilot)                                         |     ✅      |
| **Conversations** | Dynamic conversation list                                                     | Direct select                                                           |     ✅      |

\*IND Workspace label adapts: "IND Submission", "510(k) Workspace", etc. based on project type

### Dead Links Check

| Nav Target        | Case Handler in ZenApp                     | Verdict |
| ----------------- | ------------------------------------------ | :-----: |
| `ai-copilot`      | ✅ `setLayoutMode('regulatory-workspace')` |  PASS   |
| `ind-workspace`   | ✅ `setLayoutMode('ind-workspace')`        |  PASS   |
| `ectd-coauthor`   | ✅ `setLayoutMode('ectd-coauthor')`        |  PASS   |
| `cmc`             | ✅ `setLayoutMode('cmc')`                  |  PASS   |
| `clinical-trial`  | ✅ `setLayoutMode('clinical-trial')`       |  PASS   |
| `evidence-search` | ✅ `setLayoutMode('regulatory-workspace')` |  PASS   |
| `document-vault`  | ✅ `setLayoutMode('document-vault')`       |  PASS   |
| `510k-workspace`  | ✅ `setLayoutMode('ind-workspace')`        |  PASS   |
| `cer-generator`   | ✅ (exists in case switch)                 |  PASS   |

**0 dead links. 0 shell breakouts.**

---

## Scroll Behavior

```tsx
<div className="flex-1 overflow-y-auto min-h-0 zen-scroll"
     style={{ scrollbarWidth: 'thin' }}>
```

- `flex-1`: Takes remaining space after header
- `overflow-y-auto`: Vertical scroll when content overflows
- `min-h-0`: Prevents flex item from refusing to shrink
- `zen-scroll`: Custom scrollbar styling
- `scrollbarWidth: 'thin'`: Browser-native thin scrollbar

**PASS** — Scroll works for any number of nav items + conversations.

---

## RI vs IND Visual Differentiation

| Property         | RI Copilot                        | IND Workspace                                                    |
| ---------------- | --------------------------------- | ---------------------------------------------------------------- |
| **Icon**         | Brain (🧠)                        | ShieldAlert (⚠️)                                                 |
| **Accent Color** | `blue` (bg-blue-50/text-blue-700) | Default (bg-zinc-200/text-zinc-900)                              |
| **Label**        | "RI Copilot"                      | Dynamic ("IND Submission" / "510(k) Workspace" / "De Novo" etc.) |
| **Active State** | Blue highlight                    | Neutral zinc highlight                                           |

**PASS** — Visually distinct icons, colors, and labels.

---

## Lumen Cortex Status

- **REMOVED** from sidebar (see `docs/proof/LUMEN_CORTEX_POSITIONING_DECISION.md`)
- Comment preserves rationale in source
- No emerald accent orphaned

---

## Verdict

| Check                                     | Result                         |
| ----------------------------------------- | ------------------------------ |
| All nav items have handlers               | ✅ 9/9                         |
| No dead links                             | ✅                             |
| No shell breakouts (window.location.href) | ✅                             |
| Scroll works                              | ✅ (overflow-y-auto + min-h-0) |
| RI vs IND visually distinct               | ✅                             |
| Lumen Cortex removed                      | ✅                             |
| Unused import cleaned                     | ✅ (Cpu removed)               |

**PASS**
