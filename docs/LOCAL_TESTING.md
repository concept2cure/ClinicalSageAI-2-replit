# Testing this branch by hand

Everything is on `concept2cure-v2`. Nothing is on any other branch — see
"Branch state" at the end.

Every command below was run end to end on 2026-09-08 and the results are what
this document claims. The one thing it cannot give you is a live AnA: see
"What will not work without a key".

---

## 1. A database worth testing against

The app reads a large schema. A partial one is worse than none — surfaces render
their honest empty states and you will think features are broken when the
schema is simply absent. Provision it properly, once:

```bash
# pgvector is required; four migrations and several tables need it.
apt-get install -y postgresql-16-pgvector
psql -h 127.0.0.1 -U postgres -d <yourdb> -c 'CREATE EXTENSION IF NOT EXISTS vector'   # needs superuser

export DATABASE_URL='postgresql://<user>:<pass>@127.0.0.1:5432/<yourdb>'

# From-scratch provisioning: drizzle push, the raw migration overlay, the
# authoring subsystem, the RLS migrations, the governed-content tree, then a
# verification pass. Idempotent.
node scripts/db/install-fresh.mjs

# The out-of-band migration set on top (what deploy-migrate runs).
APPLY_C2C_MIGRATIONS=true node scripts/db/apply-c2c-migrations.mjs
```

Measured on a clean database: **794 tables, 806 RLS policies**, every
required-object capability complete, then **259 of 259 migrations applied, zero
failures**.

`install-fresh` will report the governed-content tree as incomplete (6 of 43
files) unless the `gcc_*` roles exist and you own the `vector` extension. That
is a container-permissions limitation, not a defect, and nothing in the flows
below depends on it.

## 2. An account and something to look at

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<pick one>' node scripts/seed-admin.mjs
npx tsx scripts/seed-local-testing.ts
```

The first creates the organization, your sign-in account and its membership.
The second adds the smallest realistic workspace: one program (BX-301 Oncology
IND), two study designs written through the product's own persist path — one
complete enough for the engine to size, one with blocking gaps so the refusal is
testable — and two conversations on that program. Both are idempotent.

Seed data reaches a **deployed** database only through a migration
(CLAUDE.md RULE 1). These scripts are laptop-only and are on no applier.

## 3. Run it

```bash
DATABASE_URL=... NODE_ENV=development PORT=5000 npx tsx server/index.ts
```

Open `http://localhost:5000`, which redirects to the sign-in form. Sign in with
the account from step 2.

---

## What to exercise

The work on this branch, in the order it is easiest to see.

### The project conversation loop
1. **Projects** → click **BX-301 Oncology IND**. This publishes the open program
   and lands you on the project home.
2. The landing is conversation-first: the composer leads the main column, the
   readiness ring sits in the aside, and **Conversations** lists that program's
   two threads, newest first, each titled by its first message.
3. Click a conversation. It resumes with its transcript restored — both turns.
   (Until this branch, resume restored nothing: the messages endpoint verified
   the thread against one store and read the transcript from another.)
4. Send from the project composer. The request carries the program, so the new
   conversation appears in this project's list rather than vanishing.

### `@app` and `/command` in any composer
- Type `@bio` in the rail, the thread, or the front-door composer. A list of
  callable apps opens; ↑/↓ move, Enter or Tab inserts, Escape closes.
- `@biostats`, `@biostat-workbench` and `@Biostatistics workbench` all resolve
  to the same app, anywhere in the message — one vocabulary, shared by the
  composer and the server.
- Type `/` as the **first** character of a draft: the commands the server
  actually parses, with a line of copy each. `/pow` → `/power`. A `/` later in
  the message offers nothing, because the server only reads it at the start.
- The `+` menu's **Slash commands** entry now starts a `/` in the composer
  instead of sending a message about commands.

### Biostatistics
1. **Biostatistics** lists the program's designs with live readiness (60% and
   90% on the seeded pair) and the engine's verdict.
2. Select the 90% design. The assessment loads: gaps, filing placements for the
   IND, proposed tasks, and the statistical review table.
3. **Raise tasks** → give a reason → confirm. Tasks are created and the button
   relabels, because the panel re-reads its state rather than assuming it.
4. **Apply sample size to design** → reason → confirm. The computed size is
   written to the design with an audit record. The toast names the number.
5. Select the 60% design and try to apply: it refuses with the exact field and
   design path that is missing. That refusal is the feature.

---

## What will not work without a key

**AnA will not answer.** `POST /api/ana-ri/stream` returns 503
`GATEWAY_UNAVAILABLE` when no model provider is configured. The composer, the
menus, attachment upload, thread creation and resume all work without one — only
the model's reply is missing. Set `ANTHROPIC_API_KEY` in the environment to get
real answers.

---

## Branch state, verified 2026-09-08

| | |
|---|---|
| Working tree | clean |
| `concept2cure-v2` vs `origin/concept2cure-v2` | identical, 0 ahead / 0 behind |
| `codex/*` (8 branches) | 0 commits not already on `concept2cure-v2` |
| `claude/ui-design-kit-review-tpsb71` | its 13 accessibility fixes are already on `concept2cure-v2`, verbatim |
| `claude/biotech-market-readiness-review-rnyc6u` | a stale August fork. Its own last commit is a merge **from** `concept2cure-v2`, and merging it back would **delete 237,642 lines** of current work. Do not merge it; delete it when convenient |
| Local agent branches | none (the stale pointer was deleted; it held no unique commits) |
