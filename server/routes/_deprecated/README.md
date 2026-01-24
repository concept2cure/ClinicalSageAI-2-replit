# ⛔ DEPRECATED ROUTES - DO NOT USE

> **Last Updated:** January 24, 2026  
> **Status:** FROZEN - No new code allowed

---

## 🚫 This folder is deprecated

**DO NOT:**
- Import from this folder
- Add new files to this folder
- Modify existing files
- Use these routes in new features

**Instead:**
- See [docs/ARCHITECTURE.md](/docs/ARCHITECTURE.md) for the new module structure
- Create new routes in the appropriate `modules/` directory
- Follow the naming conventions in the architecture guide

---

## Why are these files here?

These routes contain legacy API endpoints that have been superseded by the new modular architecture. They remain for backward compatibility but will be removed in a future release.

---

## Migration Status

| Route | Replacement | Status |
|-------|-------------|--------|
| `cer.js` | `modules/cer/routes/cerRoutes.ts` | 🟡 Pending |
| `510k-*.js` | `modules/510k/routes/510kRoutes.ts` | 🟡 Pending |
| `ai-*.js` | `server/routes/aiRoutes.ts` | 🟡 Pending |

---

## Removal Timeline

- **Q2 2026:** Final migration of all API consumers
- **Q3 2026:** Removal of deprecated folder

---

*If you need to use functionality from this folder, please create a ticket to prioritize its migration.*
