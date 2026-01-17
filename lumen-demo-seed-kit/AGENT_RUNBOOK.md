# Codespace AI dev agent runbook: seed Lumen Bioscience demo tenant

Goal: create a demo tenant/client "Lumen Bioscience" in the platform, add Brian Finrow as a licensed user, complete onboarding, and populate a pipeline of programs + studies for demo intelligence.

## Inputs

- Seed payload: `seed-data/lumen_bioscience.seed.json`
- Seeder script: `scripts/seed_demo_client.py`
- API mapping template: `scripts/api_map.example.json`

## What you must do in the product codebase

1. Identify the **admin/seed API** (REST or GraphQL) already used for creating:
   - clients/tenants
   - users
   - license assignments
   - programs
   - studies
   - documents

2. Update `scripts/api_map.example.json` to match the existing endpoints and response shapes.
   - If the API uses GraphQL, either:
     - create a minimal REST wrapper endpoint for seeding, OR
     - adapt `seed_demo_client.py` to call GraphQL mutations.

3. Run the seed in **dry-run** first.

4. Run the seed for real and capture the created IDs.

5. Verify in UI:
   - Tenant exists
   - User exists and is licensed
   - Onboarding stage shows completed
   - Pipeline view shows the programs and studies
   - Documents are visible and link to the public protocol PDFs

## Environment variables

Required:

- `PLATFORM_BASE_URL`
- `PLATFORM_ADMIN_TOKEN`
- `PRIMARY_USER_EMAIL` (use a demo alias by default)

Optional:

- `PRIMARY_USER_TEMP_PASSWORD` (if your user-create endpoint requires it)

## Command sequence

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt

python scripts/seed_demo_client.py \
  --seed-file seed-data/lumen_bioscience.seed.json \
  --api-map scripts/api_map.example.json \
  --dry-run

python scripts/seed_demo_client.py \
  --seed-file seed-data/lumen_bioscience.seed.json \
  --api-map scripts/api_map.example.json
```

## Idempotency requirement

The seed must be safe to run multiple times.

Natural keys used:
- Client: `slug` = `lumen-bioscience`
- User: `email`
- Program: `code`
- Study: `registry_id`
- Document: `source_url`
