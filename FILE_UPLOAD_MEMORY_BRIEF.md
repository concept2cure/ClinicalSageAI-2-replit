# File Upload → Project Memory · backend brief

> Companion to `MUTATION_PRIMITIVES_BRIEF.md`. Specifies the one endpoint every AnA paperclip across the product depends on. Whenever AnA appears, a paperclip appears; every upload saves to the active project's vault and writes a project-memory atom so AnA grounds on it thereafter. ~2 days backend.

---

## 0 · The contract (hard rule)

**Wherever AnA is, a paperclip is. Every upload:**
1. Stores the file in the active **project's** vault (not a global drop).
2. Runs AnA classification (document type → suggested section anchor).
3. Writes a **project-memory atom** so AnA grounds on the file in every future turn for that project.
4. Confirms in the thread: `Saved → <project> · stored in project vault` + `Project memory updated`.

No upload anywhere in the product is allowed to land outside a project, and none may skip the memory write. This is what makes the next AnA turn smarter than the last.

---

## 1 · Endpoint

```
POST /api/c2c/projects/:projectId/files     (multipart; audited)
```

Request: `files[]`, plus `{ scope, surface, reason }` where `scope` is the surface id (e.g. `ind`, `submission`, `risk`) so the classifier knows the context.

Response:
```jsonc
{
  "files": [
    {
      "id": "file_…",
      "name": "ravi-tox-summary.pdf",
      "vaultId": "vault_…",                    // stored in the project vault
      "classification": { "docType": "nonclinical_tox_summary", "confidence": 0.91, "suggestedSection": "m2.6.6" },
      "memoryAtomId": "mem_…"                   // the atom written so AnA grounds on it
    }
  ],
  "memoryUpdated": true
}
```

Writes one `audit_logs` row (`c2c.project.file.upload`) and one `c2c_ana_actions` row per the Mutation Primitives pattern.

---

## 2 · Memory atom

Each upload writes a row to `c2c_memory_atoms` (the Phase 8 table) scoped to the project:

```sql
INSERT INTO c2c_memory_atoms (id, org_id, project_id, kind, title, body, source_ref, confidence, scope, verified, created_at)
VALUES (
  'mem_…', :orgId, :projectId, 'uploaded_document',
  :fileName,                                   -- 'Ravi tox summary'
  :extractedSummary,                           -- AnA's 1-paragraph extraction
  :vaultId,                                    -- back-link to the stored file
  :classificationConfidence,
  'project',                                   -- project-scoped, not org-wide
  false,                                       -- unverified until a human confirms the classification
  now()
);
```

`useAnaChat`'s `moduleContext` already carries `projectId`; the orchestrator joins `c2c_memory_atoms WHERE project_id = :projectId AND scope = 'project'` into grounding context. No client change needed for grounding — the atom existing is enough.

---

## 3 · Client hook

```ts
// client/src/concept2cure/_shared/hooks/useProjectUpload.ts
export function useProjectUpload(projectId: string) {
  return {
    upload: (files: File[], opts: { scope: string; reason?: string }) => Promise<UploadResult>,
    pending: boolean,
  };
}
```

Every composer's paperclip calls this with the active `projectId` + the surface `scope`. The confirmation lines in the thread render from the response (`Saved →` + `Project memory updated`).

---

## 4 · Where the paperclip must exist (audit list)

Every one of these already has the paperclip in the kits; this brief makes the save+memory real:

- AnA dock (persistent, every biopharma/MDX surface)
- Biopharma Overview + every SurfaceComposer (IND/NDA/BLA/MAA/JNDA/Lifecycle/Pediatric/Orphan/PV/Meetings)
- Submission Center composer
- Risk Management composer
- Pathway sub-tabs program bar
- Tasking composer + each message thread
- Authoring conversation composer + Word-style doc toolbar

If a new surface adds an AnA composer, the paperclip + `useProjectUpload` is non-optional. Add it to the surface's acceptance checklist.

---

## 5 · Acceptance

- [ ] `POST /api/c2c/projects/:projectId/files` stores to the project vault, classifies, writes a `c2c_memory_atoms` row, returns the contract shape.
- [ ] Upload writes `audit_logs` (`c2c.project.file.upload`) + `c2c_ana_actions`.
- [ ] No upload path lands a file outside a project.
- [ ] The next `useAnaChat` turn for that project grounds on the new atom (verifiable: upload a doc, ask AnA about it, it cites the upload).
- [ ] Every composer's paperclip calls `useProjectUpload({ projectId, scope })`.
- [ ] Confirmation lines render from the response, not hard-coded.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.
