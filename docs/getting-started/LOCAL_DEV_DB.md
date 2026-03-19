# Local Development Database Setup

This guide provides a working database bootstrap so `DATABASE_URL` exists in a clean checkout.

## Option A: Local Postgres via Docker

1. Start Postgres:

   ```bash
   docker run --name concept2cure-ri-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=concept2cure-ri -p 5432:5432 -d postgres:16
   ```

2. Copy `.env.example` to `.env` and set:

   ```bash
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/concept2cure-ri
   ```

3. Apply migrations / schema:

   ```bash
   npm run db:push
   ```

4. Validate the connection and migration status:

   ```bash
   npm run db:check
   npm run db:status
   ```

## Option B: Neon (Hosted Postgres)

1. Create a Neon project and obtain the connection string.
2. Set `DATABASE_URL` in `.env` (include any required SSL params from Neon):

   ```bash
   DATABASE_URL=postgres://<user>:<password>@<host>/<db>?sslmode=require
   ```

3. Apply migrations and verify status:

   ```bash
   npm run db:push
   npm run db:check
   npm run db:status
   ```

## Running the app locally

```bash
npm run dev
```

Once the server is running, a health endpoint should return 200:

```bash
curl -i http://localhost:3000/healthz
# or
curl -i http://localhost:3000/api/health
```

## CERV2 workbench smoke test

Set `CERV2_PROGRAM_ID` in `.env` (or pass `--programId` directly) and run:

```bash
npm run smoke:cerv2-workbench
# or
node scripts/smoke_cerv2_workbench.js --programId your-program-id
```

If you don't have a program ID yet, generate a demo ID and store it locally:

```bash
npm run cerv2:seed-demo
```

This writes a `.cerv2_program_id` file in the repo root which the smoke script will read by default.

## Preflight verification

Before the full smoke suite, you can run the preflight to confirm DB/env/health readiness:

```bash
npm run cerv2:verify
```
