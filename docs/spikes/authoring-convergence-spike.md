# Spike: Authoring Convergence — route the real editor + unify the three backends

**Status:** design spike (not yet implemented). **Why a spike, not a PR:** the
work changes the on-disk content format of a **21 CFR Part 11 governed** document
store and merges three live schemas. That must be verified against a running app
and a real database — implementing it blind (no runtime, no data to migrate
against) would risk silent data corruption in a regulated feature. This document
specifies the exact seams so a follow-up PR can be executed and tested safely.

---

## 1. The problem

Three parallel, non-interoperable authoring stacks exist. A document authored in
one is invisible to the other two.

| Stack | API | Tables | Editor in the routed UI | Notable |
|---|---|---|---|---|
| Authoring | `/api/authoring` (`server/routes/authoring.router.ts`) | `authoring_sections`, `doc_revisions`, `frozen_documents` | `DocumentAuthoring.tsx:635` — `<textarea>` (content = **plain string**) | history, comments, cite-source, e-sign approve/revert; 6 `authoring_*` tables unbacked |
| Co-author (eCTD) | `/api/coauthor` (`server/routes/coauthor.ts`) | `coauthor_documents`, `coauthor_sections` | `EctdCoauthor.tsx:366` — `<textarea>` (AnA prompt only); body is read-only `dangerouslySetInnerHTML` | real eCTD `validate`/`compile`/`compliance` |
| C2C documents | `/api/c2c/documents` (`server/routes/c2c/documents.ts`) | `c2c_documents`, `c2c_document_sections` | none routed; the **`DocCanvas`** primitive (`surfaces/EditorCanvas.tsx`) persists here | **BEFORE-UPDATE version-snapshot trigger** driven by Part-11 GUCs (`app.actor_id`, `app.reason`); lock/submit |

The best editor (`DocCanvas` — contentEditable, formatting toolbar, inline
claim-highlight, real `onSave(html)` + `onAsk` seams; already used by
`DeviceSubmission`/`ProtocolWorkspace`) writes to the **c2c_documents** store,
which is also the only one with a Part-11 version-snapshot trigger. That makes
c2c_documents the natural canonical model.

## 2. Target architecture

**Canonical document model = `c2c_documents` / `c2c_document_sections`** (it
already has the version trigger + DocCanvas integration + lock/submit). The other
two become adapters, not separate schemas:

- `/api/authoring` → keep its value-adds (comments, cite-source, e-sign, history)
  but persist section bodies in `c2c_document_sections`; `doc_revisions` folds
  into the existing version-snapshot trigger.
- `/api/coauthor` → keep the eCTD structural `validate`/`compile`/`compliance`
  logic (real, deterministic, worth keeping) but read/write document content from
  the canonical store instead of `coauthor_sections`.

Net: one content of record, three capability layers (governed edit, eCTD
compile/validate, comments/e-sign) over it.

## 3. The content-format migration (the risky part)

`authoring_sections.content` and `coauthor_sections` bodies are **plain
text/markdown-ish strings**; `DocCanvas` reads/writes **HTML**. Converging means
a one-time, reversible format migration:

1. Add `content_format` (`'text' | 'html'`) to `c2c_document_sections` (default `'text'`).
2. Backfill: wrap legacy text as `<p>…</p>` (deterministic, lossless) and stamp `content_format='html'` only on rows edited through the new canvas.
3. Render path: DocCanvas already accepts `blocks` and `blocksToHtml()` — feed a legacy text row as a single block; new saves come back as HTML via `onSave`.
4. Keep a `raw_text` shadow column during rollout so eCTD validate/compile (which parse text) and full-text search keep working while the canvas rolls out.
5. **Verify against a snapshot of real data** that the version trigger fires correctly with the new format and that e-sign content-hashes (`server/routes/esignature.ts` §11.70 digest) are computed over a stable canonical serialization — this is the single most important correctness check and cannot be validated without a running DB.

## 4. Route the real editor (the visible win)

In `DocumentAuthoring.tsx`, replace the section `<textarea>` (line ~635) with
`DocCanvas`, wiring its existing seams:

```
<DocCanvas
  sec={{ id: activeSection.id, num: activeSection.number, title: activeSection.title }}
  blocks={[{ p: activeSection.content }]}         // legacy text → one block
  onAsk={onAsk}                                    // streams the real AnA co-author
  onSave={(html) => apiRequest('PATCH', `/api/authoring/sections/${activeSection.id}`, { content: html, content_format: 'html' })}
/>
```

Gate behind a feature flag (`ENABLE_ANA_DOCUMENT_STUDIO` already exists in
`client/src/flags/featureFlags.ts`) so it can be dark-launched and A/B'd against
the textarea before it becomes default. Then do the same for `EctdCoauthor.tsx`,
additionally making the pane consume `/api/ana-ri/stream` **inline** so drafts
land in the section instead of the side chat (the file's own comment at `:276`
flags this as the missing step).

## 5. Explicit per-draft grounding

Today `/generate` grounds on `conversationContext.slice(-20)`
(`server/services/ana-ri/artifact-generator.ts:417`) — the chat, not the
selected Vault sources. Add a `sourceIds: string[]` to the draft request; the
server prefetches those atoms from `lumen_data_atoms` (real pgvector) and passes
them as grounded context, so "these data-room sources → this draft" is guaranteed
and provenance-linkable, not incidental.

## 6. Phased implementation (for the follow-up PR, run against a live app)

1. **Read-only unify** — point `/api/coauthor` and `/api/authoring` *reads* at the
   canonical store behind a flag; diff output vs legacy. No writes change yet.
2. **Editor route** — flag-gated `DocCanvas` in `DocumentAuthoring`; textarea stays default.
3. **Write unify + format migration** — §3, with `raw_text` shadow + backfill.
4. **Inline AnA drafting + per-draft grounding** — §4/§5.
5. **Flip defaults, retire textareas + `coauthor_sections`/`doc_revisions`**, keep adapters.

## 7. Acceptance criteria

- One document is readable/editable identically through all three APIs.
- Editing in `DocumentAuthoring` uses `DocCanvas`; a save produces a real
  `c2c_document_sections` version-trigger snapshot.
- e-sign content-hash is stable across format migration (signed docs re-verify).
- eCTD `validate`/`compile` still pass on migrated content.
- AnA "draft/tighten/cite this section" streams into the section, grounded on the
  Vault sources the user selected.
- No surface in this flow renders a fixture (`SampleTag` absent on the path).

## 8. Safe first step already shippable

The segment-axis unification (Phase 1) is done and independent. The lowest-risk
first move here is step 1 (read-only unify behind a flag) — it changes no writes
and no formats, so it can land and be validated before any migration.
