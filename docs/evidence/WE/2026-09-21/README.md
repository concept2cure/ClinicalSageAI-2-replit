# WE — 2026-09-21 — D4 validation package: product fixes for VSR-001 §8 F-10 and F-11

Row moved: **D4** (validation package). Two findings from
`docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md` §8 dispositioned in the
product. Launch apps touched: Authoring (F-10) and Vault (F-11). No new
capability; both are defect fixes on existing surfaces.

Git was not run by this session; the control tower commits these files.

## F-10 — the authoring AI-draft route returned content without a provider

### Root cause

`POST /api/authoring/sections/:id/ai/draft` (`server/routes/authoring.router.ts`)
wrapped the gateway call in `try { if (providers > 0) {…} } catch {}` and then
fell through, on every path that produced no model content, to a hardcoded
section skeleton, answering HTTP 200 `success:false, degraded:true,
source:'template'` with a full template body. The client panel
(`client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx`) keyed on the
draft body and rendered it as a "scaffold". A deployment with no AI provider
therefore handed the author fabricated section text.

### Fix

- **Server** — the template fallback is deleted from the route. The route now:
  - refuses with **503 `GATEWAY_UNAVAILABLE`** (the code AnA already answers
    with, `server/routes/ana-ri/stream.ts`, rendered by `useAnaChat`) and no
    `draft`/`degraded`/`source` key when `getGateway().getEnabledProviders()`
    is empty;
  - refuses with the gateway's classified code and status (`RATE_LIMITED` 429,
    `OVERLOADED` 503, `TOKEN_LIMIT_EXCEEDED` 413, `PROVIDER_UNAVAILABLE` 503)
    via the existing `server/services/ai-gateway/gateway-error-map.ts`
    (`isGatewayError` / `classifyGatewayError` / `GATEWAY_ERROR_HTTP_STATUS`)
    when the provider call throws;
  - refuses with **502 `INVALID_AI_RESPONSE`** when the provider answers with
    no content;
  - answers a fault of ours through `serverError` (500 `INTERNAL_ERROR`);
  - on success declares `source: 'model'` on the envelope and in
    `draft.metadata`.
- **Client** — `AuthoringAiDraft.tsx` no longer has a `degraded`/template
  concept. A `GATEWAY_UNAVAILABLE` refusal is rendered in the panel's
  persistent alert (`data-testid="ai-draft-refusal"`, `role="alert"`) with the
  copy AnA uses: "No AI provider is configured for this deployment, so this
  section cannot be drafted. This is a server setting, not your connection.
  Nothing was changed." No draft body, grounding note or accept control is
  rendered. Other failures keep the existing toast.

### Tests (fail-proof)

- `server/routes/__tests__/authoringAiDraftNoProvider.test.ts` (new, 5 tests;
  replaces the deleted `authoringAiDraftFallback.test.ts`, which pinned the
  template contract): no provider → 503 GATEWAY_UNAVAILABLE and no `draft`;
  provider throws `GatewayAllProvidersFailedError('… 429 …')` → 429
  RATE_LIMITED; empty content → 502 INVALID_AI_RESPONSE; TypeError → 500
  INTERNAL_ERROR; provider drafts → 200 with `source:'model'`. All five assert
  no template marker anywhere in the body.
  - before fix: `f10-server-test-before-fix.txt` — 5/5 fail (`expected 200 to
    be 503 / 429 / 502 / 500`, `expected undefined to be 'model'`).
  - after fix: `f10-server-test-after-fix.txt` — 22/22 pass across this file
    plus `authoringAiDraftStructured`, `authoringAiDraftAccept` and
    `ai-draft-retrieval-honesty`.
- `client/src/concept2cure/v2/__tests__/authoringAiDraft.test.tsx` — the two
  template tests replaced by "a deployment with no AI provider is refused on
  the panel: no draft body, no accept, a refusal that stays".
  - before fix: `f10-client-test-before-fix.txt` — 1 fail (`Unable to find an
    element by: [data-testid="ai-draft-refusal"]`), 18 pass.
  - after fix: `f10-client-test-after-fix.txt` — 19/19 pass.

### Live proof (server on :5800, every provider variable unset)

`f10-readyz-no-provider.json` — `/readyz` reports `anaState: "no_provider"`.
`f10-step1-create-doc.json`, `f10-step2-create-section.json` — document and
section created over the API (dev-login identity, bearer redacted).
`f10-step3-ai-draft-no-provider.json`:

```
POST /api/authoring/sections/98de1665-6e75-49d5-adbd-3062a4a3f687/ai/draft
{"prompt":"Draft a one-paragraph summary.","region":"FDA"}
→ 503 application/json
{"success":false,"error":{"code":"GATEWAY_UNAVAILABLE","message":"No AI provider is configured for this deployment, so this section cannot be drafted. Nothing was changed."}}
```

`f10-verdict.json` — `hasDraftKey:false, hasDegradedKey:false,
bodyMentionsTemplate:false, pass:true`.

## F-11 — Vault surface did not show the filed document

### Root cause

Same store, wrong projection. The write path (`POST /api/vault/ingest`, then
`POST /api/c2c/project-vault/:id/file`) and the read model
(`GET /api/c2c/project-vault/:id`, `server/routes/c2c/project-vault.ts`) both
use `vault.documents`, and the read model carries the document as a leaf of the
`cabinet` branch (`cabinet › cab-<folder> › up-<uuid>`) — OQ-VAULT-04's
capture already showed `up-7ab9a621…` "OQ-002 Protocol 20260921011458" under
`cabinet › cab-unfiled`. The surface (`client/src/concept2cure/v2/surfaces/
Vault.tsx`) browses one folder at a time, defaults to `tree[0]` (the governed
CTD spine, 72 section leaves), and the cabinet is the **last** top-level node,
collapsed below the fold; the tree aside draws folders only. So the filed
document's title rendered nowhere on the page until a person found and clicked
the cabinet branch. Not a store mismatch, not org/program scoping, not
pagination (`uploadsWindow {shown:1,total:1,truncated:false}`), not a stale
query. OQ-VAULT-09's "73 documents" was `allDocs.length`, which included it.

A second inaccuracy on the same strip: the Data room lane's empty state said
files "uploaded here all pass through the data room". Vault ingest writes
`vault.documents` only (no `cre_evidence_sources` row), so that sentence was
false for exactly the document under test. Corrected.

### Fix

`Vault.tsx` gains an **Uploaded files** lane (`data-testid="vault-uploads-lane"`)
rendered directly under the Data room lane, before the folder grid. It is a
projection of the same read (the `cabinet` branch of the vault payload) — no
second store, no second request — listing every upload with its type, size,
time, owner, the cabinet folder it sits in (its filing decision) and its status
chip; the count is the server's programme-wide `uploadsWindow.total`, never the
rows shown. A row opens that cabinet folder in the browse view (breadcrumb,
list) and selects the document in the detail pane; "Open filing cabinet"
opens the branch. An empty cabinet says so. The `cabinet` lookup is one memo
shared with the existing "Move to…" folder list.

### Tests (fail-proof)

- `client/src/concept2cure/v2/__tests__/vaultFiledDocumentVisible.test.tsx`
  (new, 3 tests) seeds the read model in the server's real shape — spine
  first, cabinet last, the filed upload under `cab-module-5` — and asserts the
  title is on the page once the read settles, that the row opens `Module 5 ·
  Clinical` and selects the document, and that an empty cabinet is said.
  - before fix: `f11-client-test-before-fix.txt` — 3/3 fail (`Unable to find
    an element by: [data-testid="vault-uploads-lane"]`).
  - after fix: `f11-client-test-after-fix.txt` — 41/41 pass across this file
    and the existing `vaultSurface`, `vaultOpenInEditorCarriesDoc`,
    `vaultPlaceIntoSubmission`, `vaultPlaceIntoSubmissionDialog`,
    `useVaultUpload` tests.

### Live proof (headless Chromium, program selected via `c2c.shell-project`)

`f11-step1-create-program.json` → program `02ed9f66-…`;
`f11-step2-ingest.json` → `POST /api/vault/ingest` 201, document
`4c7aa54f-…` "WE F-11 Protocol 20260921015253", SHA-256 matches the bytes;
`f11-step3-file-into-module-5.json` → `POST …/file {folderId:"module-5"}`;
`f11-step4-read-model.json` → `GET /api/c2c/project-vault/:id` carries the
leaf at `cabinet › cab-module-5 › up-4c7aa54f-…` (status `confirmed`).

`f11-vault-after-filing.png` — `/concept2cure/vault` after navigation only:
the Uploaded files lane shows "PROTOCOL · WE F-11 Protocol 20260921015253 ·
612 B · just now · JM Smith · → Module 5 · Clinical · FILED" while the spine
remains the open folder. `f11-vault-after-filing.fullpage.png` — full page.
`f11-vault-row-opened.png` — after clicking the row: breadcrumb "WE F-11 Vault
program … › Module 5 · Clinical", the list carries the row, the detail pane
shows the document with its dossier filing. `f11-verdict.json` —
`pageTextContainsTitle:true, uploadsLaneContainsTitle:true, browser429:0,
consoleErrors:[], pass:true`.

## Gates

| Gate | Result | File |
|---|---|---|
| `npx eslint` on every changed file | 0 errors; 52 warnings, all pre-existing (function length / complexity on the two large surfaces and the router) | `gate-eslint.txt` |
| `check-eslint-warning-ratchet.mjs --since HEAD` | net −1 across the tree; `authoring.router.ts` 43 → 41; no WE file adds a warning. The `+1` (`audit-trail-ledger.routes.ts:338 '_tenants' unused`) is another worker's file, outside WE scope | `gate-eslint-ratchet.txt` |
| `npm run typecheck:fast` | pass — 0 errors, exit 0 (fourth run; see note) | `gate-typecheck-fast.txt`, `gate-typecheck-scoped-we.txt` |
| `npm run ci:launch-scope` | pass — 6 apps · 41 surfaces · 21 modules, fixture-free | `gate-launch-scope.txt` |
| `npm run ci:ana-surface-context` | OK — 114 of 120 publish, baseline exact | `gate-ana-surface-context.txt` |
| `npm run ci:undefined-css-classes` | OK — every static className defined (the lane reuses `vd-dr-*`, `vd-crumb`, `rd-chip`) | `gate-undefined-css-classes.txt` |

Typecheck note: the gate passed on its fourth run, once no other `tsc` was
running in the shared tree. Run 1 finished with 14 `TS6053 File
'…/__eslint_ratchet_prev__.<name>' not found` diagnostics — scratch files
another worker's concurrent eslint-ratchet run created and deleted while
`tsc` was enumerating the program; not type errors, none in a WE file. Runs 2
and 3 were killed by the memory cgroup (`dmesg`: "Memory cgroup out of memory:
Killed process … node", exit 137) while another worker's full-program `tsc`
ran alongside. In the meantime a scoped `tsc` over the six WE files plus the
repo's ambient `.d.ts` files (`gate-typecheck-scoped-we.txt`) reported no
diagnostic on any WE-changed line; its 23 diagnostics elsewhere are artefacts
of the scoped program resolving a different `req.user` augmentation than the
full program, and the full gate's 0 errors is the authoritative result.

## Files changed by WE

- `server/routes/authoring.router.ts` — AI-draft route: refusals, template fallback deleted
- `server/routes/__tests__/authoringAiDraftNoProvider.test.ts` — new
- `server/routes/__tests__/authoringAiDraftFallback.test.ts` — deleted (pinned the template contract)
- `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx` — refusal rendering, degraded/template removed
- `client/src/concept2cure/v2/__tests__/authoringAiDraft.test.tsx` — template tests replaced by the refusal test
- `client/src/concept2cure/v2/surfaces/Vault.tsx` — Uploaded files lane; data-room copy corrected
- `client/src/concept2cure/v2/__tests__/vaultFiledDocumentVisible.test.tsx` — new
- `docs/evidence/WE/2026-09-21/**` — this evidence

## Left open (outside WE scope)

- `docs/validation/*` (VSR-001 F-10/F-11 dispositions, OQ-002/OQ-003 re-execution, TM-001) are not edited by WE; OQ-AUTH-15 and OQ-VAULT-09 should be re-executed against these fixes by the validation owner.
- The OQ-VAULT-09 protocol locator ("data room") can stay: the document is now on the page; the Data room lane itself still lists `cre_evidence_sources` captures only, by design.
- Ratchet `+1` in `server/routes/audit-trail-ledger.routes.ts` belongs to another workstream.
