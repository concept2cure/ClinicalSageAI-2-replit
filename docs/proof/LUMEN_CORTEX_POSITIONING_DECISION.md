# Task I — Lumen Cortex Product Positioning Decision

**Date**: 2026-03-11
**Branch**: `concept2cure-v2`
**Decision**: **HIDE_FOR_NOW**

---

## Audit Summary

### What Lumen Cortex Is

- A Claude-like conversational AI chat interface (`LumenCortexChat.tsx`, 672 lines)
- Calls `/api/cortex/chat` (primary), `/api/lumen-cortex-ft/inference`, auto-enriches with `/api/precedent-engine/search` and `/api/foresight/score`
- Thread-based, ephemeral chat outputs — no persistence beyond conversation history
- Self-contained component with no ZenApp dependencies

### Why It Duplicates RI Copilot

| Capability                 | RI Copilot                              | Lumen Cortex           |
| -------------------------- | --------------------------------------- | ---------------------- |
| Precedent Intelligence     | ✅ calls `/api/precedent-engine/search` | ✅ calls same endpoint |
| Foresight scoring          | ✅ calls `/api/foresight/score`         | ✅ calls same endpoint |
| Creates governed artifacts | ✅ → EditorPanel → DB                   | ❌ chat-only           |
| Emits provenance events    | ✅ on every draft                       | ❌ none                |
| Requires active project    | ✅ enforced                             | ❌ optional            |
| CTD section binding        | ✅ via ctdSection                       | ❌ N/A                 |

### Why HIDE_FOR_NOW (Not DELETE)

1. **Duplicate intelligence surface**: RI Copilot already provides evidence→document flow with governance
2. **No governed output**: Chat responses are ephemeral; users may assume they're governed when they're not
3. **Shell breakout**: `window.location.href = '/client-portal/lumen-cortex'` was a full-page redirect breaking the unified shell
4. **Demo leakage risk**: Responses expose internal strategy logic without audit trail
5. **Technically embeddable**: Self-contained component (HIGH feasibility) — can be brought back in-shell as "Quick Chat" if needed

### What Was Changed

1. **Removed** Lumen Cortex `NavItem` from `ZenSidebar.tsx` Intelligence group
2. **Removed** `Cpu` icon import (no longer used)
3. **Removed** `case 'lumen-cortex'` shell-breakout navigation in `ZenApp.tsx`
4. **Preserved** all Lumen Cortex source files (`LumenCortexChat.tsx`, `LumenCortex.tsx`, server routes) — no deletion

### Re-enablement Path

To bring Lumen Cortex back as an in-shell panel:

1. Add `'lumen-cortex'` to `LayoutMode` type
2. Import `LumenCortexChat` in ZenApp main content renderer
3. Render with active project context injection
4. Ensure any document outputs route through EditorPanel → governed artifact creation

---

## Verdict

| Check                                                       | Result |
| ----------------------------------------------------------- | ------ |
| Shell breakout eliminated                                   | ✅     |
| Sidebar cleaned up                                          | ✅     |
| Source files preserved                                      | ✅     |
| No feature regression (RI Copilot covers same intelligence) | ✅     |
| Re-enablement path documented                               | ✅     |

**PASS** — Lumen Cortex hidden from product surface. RI Copilot is the single intelligence interface.
