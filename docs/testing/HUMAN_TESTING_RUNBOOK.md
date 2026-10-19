# Human testing on `concept2cure-v2` — what runs, how to start, where the walls are

Written 2026-10-18 from verification actually performed on this branch, not from
intent. Every claim below was measured; where something could not be verified it
says so rather than guessing.

## It runs

| | Measured |
|---|---|
| Build | `npm run build` → exit 0, `dist/index.js` written, 4,329 modules. Only warning is Rollup's >500 kB chunk advisory (informational) |
| Typecheck | 0 errors. **Needs `TYPECHECK_HEAP_MB=11264`** — 20480 OOM-kills on this host |
| Gates | 41/41 of the `.husky/pre-push` battery pass |
| Server | `npm run dev` → listening ~35s later on **http://0.0.0.0:5000**; `/api/health` returns 200 and reports the running commit |
| Database | **375/375** migrations applied. `npm run db:migrate:deploy` exits 0: *"Schema migration complete — safe to roll services."* Readiness contract 19/19 tables policied |
| AnA's `project_setup` | Runs **end to end against the live database**: options drawn, validator genuinely refuses bad input, the configuration written, `audit.persisted: true, chained: true`, before/after per field in the audit row |

## Start it

```bash
npm run dev          # http://localhost:5000  — login at /auth
npm run db:migrate:deploy   # idempotent; run it after any pull
```

The database is local Postgres at `127.0.0.1:5432/clinicalsage` (credentials in
`.env`). Its unix socket lives in `/tmp`, so `pg_isready` on the default path
reports "no response" even though the server is fine — use TCP.

### Environment, as it stands on this container

| Setting | Value | What it means for you |
|---|---|---|
| `NODE_ENV` | `development` | dev behaviour |
| `ALLOW_DEV_AUTH` | `1` | dev auth is on, so you can get in without seeding a password |
| `RLS_ENFORCE` | `on` | tenant scoping is enforced, and it is fail-closed: a query outside a tenant scope throws rather than returning another tenant's rows. This is working as intended |
| `ANTHROPIC_API_KEY` | **empty** | **AI features are unavailable.** The interview engine is deterministic — the questions, positions, cautions and the Annex VIII verdicts all work without it — but anything that asks the model to narrate will not. Set it if you want AnA's conversational side |
| `REDIS_URL` | unset | scheduled jobs disabled; the digest heartbeat fallback runs instead |

### Why CI did not catch the two deploy defects (corrected 2026-10-19)

I first suggested the repo needed a CI lane that applies the whole set to a
blank database. **It already has one**, and it is required: `ci.yml`'s
`blank-db-provisioning`, `production-boot-smoke` and `production-image-boot`
are all in the gate job's `needs:`. That suggestion was redundant.

The actual gap is narrower and worth knowing. In every lane `deploy-migrate`
runs as `postgresql://postgres@localhost` — **the superuser**. The
"non-superuser role" in `production-boot-smoke`'s name is the *runtime* role
(`app_service`), which that job correctly asserts is NOSUPERUSER and
NOBYPASSRLS. So CI proves the set applies **as a superuser applier**, while
`deploy-migrate` also supports a plain non-superuser owner
(`DATABASE_OWNER_URL` split-role mode) — and applier-privilege defects are
invisible in that configuration. All three problems hit on this container were
of exactly that kind: `CREATEROLE`, `GRANT SET ON PARAMETER`, and the
`shared_preload_libraries` read. An RDS master is in `rds_superuser` and has
those privileges, so RDS is unaffected; a plain owner is not.

### A fresh container needs three things this one did not have

Found by applying the migration set here. Without them the deploy stops:

```bash
apt-get install -y postgresql-16-pgvector      # then, as a superuser:
psql -c 'CREATE EXTENSION IF NOT EXISTS vector'
psql -c 'ALTER ROLE c2c CREATEROLE'
psql -c 'GRANT SET ON PARAMETER "app.current_user_role" TO c2c'
```

The last two are what the migrations expect of the applier (the files say so:
`migrations/20260926_ana_turn_records.sql` and
`db/migrations/20260617_audit_logs_immutability.sql` both state a CREATEROLE
NOSUPERUSER applier).

## The database is EMPTY — do this first

Measured: **1 organisation, 1 user, 0 programmes, 0 documents.**

This matters because `project_setup` **configures a programme that already
exists** — it is the conversational alternative to the New Project wizard, not
a second way to create one. With zero programmes there is nothing for its
commit to write to.

So the first journey is:

1. Log in.
2. **Create a project** (the New Project wizard → `POST /api/c2c/projects`).
   This is what creates the programme, its document scaffold, its submission
   spine and its project anchor, in one transaction.
3. **Then** run AnA's `project_setup` interview against it. That is the work
   this batch did, and step 3 is what writes the configuration onto the
   programme from step 2.

If you want a populated estate instead, the seeds are `npm run db:seed`
(GA demo), `db:seed:admin`, `db:seed:mdx-templates`. A founder login is
`FOUNDER_EMAIL=… FOUNDER_PASSWORD='…' node scripts/seed-founder.mjs` — I did
**not** run it, because choosing your credentials is yours to do, not mine.

## What to exercise, and what you will see

The interview is the point. Verbatim from the live run:

**A European medical device programme** (`product_type: medical_device`,
agency `EU`) is offered, at `device_classification`:

```
class_i | class_ii | class_iii | not_classified
no_us_filing — "Not applicable / No US filing planned"
```

That last option is new: a European programme used to be forced to assert an
FDA class or claim it did not know one. The MDR conformity routes are offered
for the EU (not FDA's, marked inapplicable), the notified-body question appears
only when an MDR or IVDR class says there is an EU filing, and a Class III or
implantable device is told the clinical-investigation route.

**A US medicines programme** is offered `US_IND` labelled *"— not a route to
market"*, beside the frame's marketing routes. Before this batch a programme
that stated its modality was never offered the investigational filing at all.

The validator is not decoration: submitting `product_details` without a product
name comes back as the same question with *"Product Name is required"*, and
`primary_regulatory_agency: 'FDA'` is refused because the governed value is
`US`.

## Where the walls are

**Likely to look broken but is not:**

1. **AI narration is silent** — no `ANTHROPIC_API_KEY`. The deterministic parts
   work; the conversational parts do not.
2. **An empty product on first login** — see above; create a project first.
3. **A refused signature on a diverged filing.** Signing a document whose filed
   copy has changed elsewhere returns `409 FILING_DIVERGED` and refuses the
   whole signature, naming the section and how to recover. That is correct — a
   signature must not attest to text the submission does not contain — and the
   recovery it names (re-save that section, sign again) is now pinned by a test.
4. **"No MDR class on the program record" on the PMS/PMCF tab.** That tab now
   reports against the EU class the programme record holds — `eu_mdr_class` for
   a device, `eu_ivdr_class` for a diagnostic — and against nothing else. Until
   you answer the MDR or IVDR classification question in project setup, the
   record holds no EU class and the tab says so, with every class-dependent
   obligation undetermined. It is the honest answer, not a failure: until
   2026-10-19 the tab sent the US 21 CFR 860 class instead, and a European
   programme was told `"class II" is not an MDR device class`. Answer the
   classification question, commit, and the obligations resolve.

**Genuinely open, and in the task list:**

1. **Six questions the interview does not ask**, each keeping a written check
   silent: the biomarker strategy, orphan natural-history data, ethnic bridging
   (ICH E5/E17), human-factors validation (IEC 62366-1), the planned interim
   analysis, and the long-term stability months the ICH Q1E check needs.
2. **The predicate of record needs a trade name** the question does not ask, so
   a predicate identifier alone is reported rather than filed.
3. **No per-programme mutation authority on the profile write** — any editor can
   configure any programme in the tenant; every other programme mutation admits
   the programme lead or a manager. Tightening it changes who can use the device
   panel today, so it is a founder's call.
4. **The commit confirmation does not show the patch it will write** — you
   confirm a session id, not the columns.

## What I could not verify

- **The HTTP path through the interview** (draw a question, submit, commit over
  the API) needs a bearer token; the end-to-end run exercised the same engine,
  projection, write and audit functions the route calls, but not the route's own
  auth, entitlement and zod layers. A human with a session is the right way to
  close that, and it is the first thing worth doing.
- **The launch-scope gate's production behaviour.** In production
  `start_intelligence_flow` refuses a flow whose answers reach no record, and
  only `project_setup` and `cmc_specification` commit. This container is
  `NODE_ENV=development`, so that path was not exercised here.
- A full `server/services/**` suite run: it was killed by its time limit with no
  failures recorded, which is inconclusive, not green. The route suite (4,225
  tests) and the question-engine suites did pass.
