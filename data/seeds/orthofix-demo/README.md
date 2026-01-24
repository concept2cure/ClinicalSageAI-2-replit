# Orthofix demo seed kit

This kit is intended to help you **seed a demo medical device client** in your platform for **Orthofix Medical Inc.** with:

- A **Client/Tenant** record
- A **primary user** (demo admin) with a **license assignment**
- A populated **product + study + document pipeline** aligned to public device data

The included seed data is sourced from **publicly available information** (company website and public materials). Use only in non-production/demo environments.

## Contents

- `seed-data/orthofix.seed.json` - the seed payload (client, users, pipeline)
- `scripts/seed_demo_client.py` - a configurable REST seeder (idempotent upserts)
- `scripts/api_map.example.json` - example endpoint mappings you should adapt to your platform
- `scripts/requirements.txt`

## Quick start (Codespace)

1. Set environment variables (example):

```bash
export PLATFORM_BASE_URL="https://your-platform.example"
export PLATFORM_ADMIN_TOKEN="<admin-or-seeding-token>"

# Use a demo email alias unless you have explicit permission to use a real email.
export PRIMARY_USER_EMAIL="orthofix.demo+admin@yourcompany.com"

# Optional: if your platform requires a password at creation time
export PRIMARY_USER_TEMP_PASSWORD="ChangeMe123!"
```

2. Create a venv and install deps:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
```

3. Dry run first:

```bash
python scripts/seed_demo_client.py \
  --seed-file seed-data/orthofix.seed.json \
  --api-map scripts/api_map.example.json \
  --dry-run
```

4. Run for real:

```bash
python scripts/seed_demo_client.py \
  --seed-file seed-data/orthofix.seed.json \
  --api-map scripts/api_map.example.json
```

## Adapting to your platform

The seeder assumes a typical **admin REST API** with endpoints that support:

- Upsert by a natural key (client `slug`, user `email`, program/product `code`, study `registry_id`, document `source_url`)
- `GET` list with query params
- `POST` create
- `PATCH` update

If your API differs, edit `scripts/api_map.example.json` (recommended) or modify `scripts/seed_demo_client.py`.

## Safety / compliance notes

- The primary user email in the seed file is a **placeholder** and is resolved from `PRIMARY_USER_EMAIL`.
- Do **not** use this in production.
- Do not ingest or store any PHI/PII beyond what is required for a demo.
