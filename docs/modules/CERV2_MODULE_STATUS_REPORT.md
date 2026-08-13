# CERV2 Module Status Report (Tombstone)

**Status:** Obsolete. Retained for repository history only.

This report described a legacy `/cerv2` UI (134 components, including 88 CER
components) and endpoints such as `/api/cer/generate-section`,
`/api/cer/export-pdf`, and `/api/cer/preview`. That UI and those endpoints have
been deleted and do not exist in the codebase. Nothing in this report should be
read as a claim about current functionality.

Current CER surface:

- **UI:** `client/src/concept2cure/mdx/surfaces/CerSurface.tsx`
- **API:** `/api/cerv2/*` routes (mounted in
  `server/bootstrap/register-regulatory-routes.ts`), plus
  `/api/cerv2-sections` and `/api/cerv2-versions` (mounted in
  `server/bootstrap/register-document-routes.ts`)
