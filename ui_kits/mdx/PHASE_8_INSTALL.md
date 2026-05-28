# PHASE 8 — install guide for Claude Code

> Cross-cutting surfaces — global search, onboarding importer, AnA conversation history. Read after Phase 4–7.

---

## 0 · Scope

| # | Surface              | Group         | Layout       | Endpoint                          |
|---|----------------------|---------------|--------------|-----------------------------------|
| 1 | Global search        | system        | search + facets | `GET /api/mdx/search?q=`        |
| 2 | Onboarding importer  | system        | 7-step wizard| `GET /api/mdx/onboarding/:tenantId` |
| 3 | AnA conversations    | intelligence  | threaded list| `GET /api/mdx/conversations`      |

## 1 · Files (6 total)

- `data/{search,onboarding,conversations}.js` → `mdx/data/*.ts`
- `surfaces/{Search,Onboarding,Conversations}.jsx` → `mdx/surfaces/*Surface.tsx`

## 2 · Hooks
- `useSearch({q, kind, surface, program, actor, from, to})`
- `useOnboarding(tenantId)` + `useOnboardingArtifacts(tenantId)`
- `useConversations({program, pinned, q})` + `useConversationDetail(id)`

## 3 · Nav additions
```ts
{ id: 'conversations', label: 'AnA Conversations', icon: 'chat',   group: 'intelligence' },
{ id: 'search',        label: 'Global Search',     icon: 'search', group: 'system' },
{ id: 'onboarding',    label: 'Onboarding',        icon: 'upload', group: 'system' },
```

## 4 · ⌘K integration
`<CmdK>` already exists in the codebase shell. Phase 8 extends it: when the user types in ⌘K, dispatch to `useSearch` and render the first 6 search results inline above the navigate-to commands. Selecting a search result opens that artifact / section / audit entry / conversation in its native surface.

## 5 · Database deltas

```sql
-- Search index (materialized view, rebuilt every 4h)
CREATE MATERIALIZED VIEW c2c_search_index AS
  SELECT 'artifact'     AS kind, id AS ref_id, org_id, program_code AS program, 'engineering' AS surface, title, body AS snippet, author_id, updated_at FROM c2c_artifacts
  UNION ALL
  SELECT 'section',     id::text, org_id, program_code, surface, label, content_excerpt, author_id, updated_at FROM cerv2_510k_sections
  UNION ALL
  SELECT 'audit',       id::text, org_id, '—', 'admin', action || ' · ' || target, target, actor_id, occurred_at FROM audit_logs
  UNION ALL
  SELECT 'conversation', id, org_id, program_code, surface, topic, summary, owner_id, last_active FROM c2c_ana_conversations
  UNION ALL
  SELECT 'memory',      id, org_id, NULL, 'memory', title, body, NULL, updated_at FROM c2c_memory_atoms
  UNION ALL
  SELECT 'notification', id, org_id, NULL, surface, title, body, NULL, created_at FROM c2c_notifications;
CREATE INDEX c2c_search_index_q_idx ON c2c_search_index USING gin (to_tsvector('english', title || ' ' || snippet));

-- Onboarding ingestion jobs
CREATE TABLE c2c_onboarding_imports (
  id              text PRIMARY KEY,
  tenant_id       uuid NOT NULL,
  step            text NOT NULL,    -- connect | ingest | extract | map | validate | seed | go-live
  legacy_path     text NOT NULL,
  mapped_to       text,             -- canonical section/artifact id
  ana_confidence  numeric(3,2),
  state           text NOT NULL,    -- mapped | review | unmappable
  issues          integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- AnA conversation archive
CREATE TABLE c2c_ana_conversations (
  id              text PRIMARY KEY,
  org_id          uuid NOT NULL,
  program_code    text,
  surface         text NOT NULL,
  topic           text NOT NULL,
  summary         text,
  turns           integer NOT NULL DEFAULT 0,
  participants    text[] NOT NULL DEFAULT '{}',
  pinned          boolean NOT NULL DEFAULT false,
  drafted_docs    integer NOT NULL DEFAULT 0,
  last_active     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE c2c_ana_conversation_turns (
  id              bigserial PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES c2c_ana_conversations(id),
  turn_idx        integer NOT NULL,
  role            text NOT NULL,    -- user | assistant
  body            text NOT NULL,
  produced_draft  text,             -- artifact id if this turn produced one
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
```

## 6 · Acceptance

- [ ] Global search returns results across all 6 kinds within 200ms p50.
- [ ] ⌘K palette dispatches to global search inline.
- [ ] Saved queries pin per-team, recall by clicking the query card.
- [ ] Onboarding pipeline renders 7 steps; current step gets accent rail.
- [ ] Onboarding artifact mapping shows AnA confidence per row + remap action.
- [ ] Conversation archive search filters by program / pinned / today / drafted.
- [ ] Conversation detail panel surfaces the produced-drafts count + lineage CTA.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

---

## 7 · End of roadmap

Phase 8 closes the original 25-surface gap inventory. The kit now covers every "must-have for beta", "strong-need for beta", "diagnostic clients", and "post-beta" tier item. Open a Phase 9 ticket only if new surfaces emerge from beta client feedback.
