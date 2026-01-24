# ⛔ DEPRECATED SERVICES - DO NOT USE

> **Last Updated:** January 24, 2026  
> **Status:** FROZEN - No new code allowed

---

## 🚫 This folder is deprecated

**DO NOT:**
- Import from this folder
- Add new files to this folder
- Modify existing files
- Use these services in new features

**Instead:**
- See [docs/ARCHITECTURE.md](/docs/ARCHITECTURE.md) for the new module structure
- Create new services in the appropriate `modules/` directory
- Follow the naming conventions in the architecture guide

---

## Why are these files here?

These services contain legacy code that has been superseded by the new modular architecture. They remain for backward compatibility but will be removed in a future release.

---

## Migration Status

| Service | Replacement | Status |
|---------|-------------|--------|
| `cerService.js` | `modules/cer/services/cerService.ts` | 🟡 Pending |
| `aiService.js` | `server/services/core/aiService.ts` | 🟡 Pending |
| `regulatoryAIService.js` | `modules/510k/services/regulatoryAIService.ts` | 🟡 Pending |

---

## Removal Timeline

- **Q2 2026:** Final migration of all dependent code
- **Q3 2026:** Removal of deprecated folder

---

*If you need to use functionality from this folder, please create a ticket to prioritize its migration.*
