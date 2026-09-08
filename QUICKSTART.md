# Running Concept2Cure locally

Two commands. The first provisions a database and seeds an account; the second
starts the app.

```bash
npm install
npm run up      # provisions Postgres, seeds an admin, prints your credentials
npm run dev     # starts the server on http://localhost:5000
```

Then open **http://localhost:5000/auth** and sign in with the email and password
`npm run up` printed.

---

## What `npm run up` does

It runs the scripts that already existed, in the one order that works, and then
verifies the result rather than assuming it:

| Step | What it does |
| --- | --- |
| 1 | Checks Postgres is reachable; if not, prints the exact command to start one |
| 2 | Creates the database if it does not exist |
| 3 | `scripts/db/install-fresh.mjs` — schemas, extensions, 480 tables, the raw-migration overlay, the authoring subsystem, and row-level security |
| 4 | `scripts/db/deploy-migrate.mjs` — migrations and the readiness contract |
| 5 | **Verifies the runtime role can actually read the schema** |
| 6 | Writes `.env.local` with `APP_DATABASE_URL` — the variable the server connects as |
| 7 | Seeds an administrator and prints the credentials |

It is idempotent. Re-run it whenever something looks wrong; it repairs rather
than duplicates.

## Why step 5 exists

The committed `.env` pointed `DATABASE_URL` at a role with no grants on any of
the 963 application tables. A completely correct install still failed every
query, and the app looked broken for a reason that had nothing to do with the
application code. Step 5 fails loudly on that instead of leaving you to find it
from a 500.

The server connects as `APP_DATABASE_URL` when it is set, falling back to
`DATABASE_URL`. `.env.local` is read before `.env` by both `server/index.ts` and
`scripts/startup.sh`, so what `npm run up` writes wins over the committed
default without touching your `.env` or the keys in it.

## No Postgres yet?

```bash
docker run -d --name c2c-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clinicalsage postgres:16
npm run up
```

## Pointing at a different database

```bash
DATABASE_URL=postgresql://user:pass@host:5432/mydb npm run up
```

Other variables `npm run up` accepts, all optional:

| Variable | Default |
| --- | --- |
| `ADMIN_EMAIL` | `jm.smith@concept2cure.pro` |
| `ADMIN_PASSWORD` | generated and printed |
| `C2C_DB_NAME` | `clinicalsage` |
| `PORT` | `5000` |

`.env.example` lists 222 variables. None of the rest are needed to sign in and
use the product; they configure AI providers, external integrations and
production hardening. Set them when you need what they switch on.

## Verifying it worked

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5000/api/health
curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | head -c 80
```

`200` and a response beginning `{"success":true,"accessToken":` means the whole
path — database, role, grants, schema, auth — is working.
