# D2 — AnA searches and reads the client's Vault with no AI key and no feature flag

**Row:** D2 (launch catalog: Vault, and AnA over it). **Date:** 2026-10-01.
**Direction:** the founder, 2026-10-01: *"Vault search should not depend on an
OpenAI key or a Claude key or any key as Anna should have the capability to do
that search on her own."*

## What was true

| Path | Before |
|---|---|
| A user's Vault search (`GET /api/c2c/project-vault/search`, `/:id/search`) | Postgres full text. **No key.** |
| AnA's `list_project_documents`, `read_project_document`, `search_project_documents` | Behind `ana.document_catalog`, which is **off for every organisation**. So in production AnA could not list, read or search a client's Vault at all, key or no key. |
| `search_project_documents` with the catalog on | **Semantic only.** It needed an embedding (OpenAI by default) and answered "unavailable" without one. |
| The connector's `c2c_search_vault_documents` | Semantic only. Refused without a key. |

## The change

1. **The three Vault tools leave the catalog gate.** `list_project_documents`,
   `read_project_document` and `search_project_documents` now need only the
   tenant (`requireDocumentAccess`), so the toolset offers them to every
   organisation.
   - What costs an embedding or files into the Vault stays behind the flag:
     cataloging, passage search, chat-upload filing, placement.
   - `CATALOG_GATED_TOOLS` and its handler-derived test agree.
2. **One assistant search** (`server/services/vault/vault-assistant-search.ts`),
   used by AnA's tool and by the connector's tool.
   - **Text arm, always.** It is the same ranked full-text query the Vault
     surface gives users (`searchVaultDocuments`), over title, file name and the
     full extracted text. Current versions only, and the tenant boundary is in
     every statement.
     - For a question it matches **any** of its words (`match: 'any'`), and
       documents matching more words rank higher. Requiring every word of a
       sentence answers nothing.
     - The user-facing search box keeps every-word matching.
   - **Meaning arm, when available.** The catalog's semantic index is added when
     the organisation's catalog is on and an embedding provider answers. A
     document found both ways is one hit, `matchedBy: ['text','meaning']`, with
     the summary and key data AnA recorded.
     - Its absence is reported in `semantic: {available:false, reason}`.
     - It narrows the search; it never empties it.

## The proof

| File | Shows |
|---|---|
| `red/unit-before.txt` | The new unit file on the old code: **0 of 6.** The three tools are gated; search refuses with the catalog off; search fails with no embedding provider. |
| `red/postgres-before.txt` | `tests/db/ana-vault-search-no-key.dbtest.ts` on the old server code. PostgreSQL 16, as `app_service` with RLS enforcing, `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` unset, catalog off: **1 of 5** (only "the catalog is off"). AnA answers *"access is not enabled for the organization"*. |
| `green/postgres-after.txt` | The same contract with the change: **5 of 5.** A plain-English question finds the current version (not the superseded one) by its text. The other organisation's document is never a hit, from either side. List and read work. A question nothing answers is said as nothing found. |
| `green/unit-after.txt` | The unit suites: the new file, any-term matching, project scope, the gated-tools list, and the toolset gate. |

**Also run:**

- **AnA, MCP and Vault unit directories:** 304 files pass.
- **Vault and catalog DB contracts** (`document-catalog`, `document-catalog-role`,
  `vault-library-search`): pass.
- **`document-catalog-recall`:** two of its cases asserted the old contract
  (semantic only; an embedding failure refuses the whole search). They now
  assert the new one:
  - the cataloged document is found by meaning, with its key data;
  - an embedding failure keeps the text hits, and says the meaning arm is
    unavailable.

  8 of 8.

## Honest limits of text matching

- **English stemming, no synonyms.** "PK" does not find "pharmacokinetics".
- **No partial words.** "stab" does not find "stability".
- **Indexing stops at 900,000 characters.** Body text past that point is not
  indexed.
- **A text hit means the words appear.** It does not mean the document answers
  the question. The tool tells AnA to read before relying on a hit.
- **Semantic recall is still better.** It remains available as an enhancement:
  set the catalog on and configure an embedding provider (OpenAI, or a
  self-hosted endpoint).
