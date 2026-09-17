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

### The IND eCTD path (WO-9 Clicks 1-3)

This path uses the **GA demo seed**, not `seed-local-testing.ts` — a different,
larger workspace with the biotech IND programs the eCTD work is built on. It is
idempotent and safe to run alongside the seed above.

```bash
npm run db:seed          # org "Concept2Cure Therapeutics"; sign in as
                         # jm.smith@concept2cure.pro / pass-word
```

It provisions two IND programs (BX-256, and BX-512 **Vorelinib**), their
agency-assigned IND numbers, the canonical `submissions` row and eCTD sequence
`0000` for each, and one authored Module 3 document on BX-512.

Sign in, open **Projects**, open **Vorelinib · KIT-mutant GIST (IND)**, and all
three steps run on that one program.

**1 — the landing.** A "Program identity" row: Sponsor, Product, Indication and
**IND number 000512**. Every value is read from `regulatory_programs` and its
organisation. Nothing on it is a constant; a value the record does not hold
reads "not recorded" or "not assigned" rather than being filled in.

**2 — Module 1 forms.** Go to the **IND lifecycle** surface. Above the forms
table, the same four facts, marked as read from the program record — they are no
longer typed in. Each row states what the engine will produce *before* you click:
for 1571, "the official FDA form (edition 2025-03-28) with the program's values
written into it", the count of boxes left for you to complete in Acrobat, and
whether a named person has reviewed the asset. **Build & check** returns the
server's verdict (1571 reports 2 required fields missing — the record holds
neither a sponsor address nor an IND type; that is correct). **PDF** returns the
genuine FDA form with the program's values inside its XFA datasets.
**Attach completed form** files a signed PDF into sequence 0000 as a Module 1
leaf, and refuses a non-PDF, a blank template, or a program with no sequence.

**3 — CTD placement.** Go to **Document authoring**; the seeded document
(*Control of Drug Substance, CTD 3.2.S.4*) opens. Click **Place into filing**,
choose the Vorelinib submission and sequence 0000. The line under the section
box is the point of the step — it tells you the canonical code and the exact
folder the document will ship in, before anything is written:

| you type | it says |
|---|---|
| `3.2.S.4.2` | Files as 3.2.S.4.2 at `m3/3-2-s-4-2/` |
| `3.2.s.4.2` | the same — one CTD section, one folder |
| `m1.2` | Files as 1.2 in the regional Module 1 folder |
| `m1/us/1.2` | not a CTD section code — Place is disabled |
| `3` | a container, not a section — Place is disabled |

**On this sandbox only:** the placement's snapshot step needs
`coauthor_documents`, which carries an `embedding` column and so requires
pgvector. Without it the dialog reports "The filing snapshot could not be
created … Nothing was placed" and places nothing — which is the correct
refusal, not a failure of the step. With pgvector present (§1 above) the chain
completes.

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
