# Codespace AI dev agent runbook: seed Orthofix demo tenant

Goal: create a demo medical device tenant/client "Orthofix Medical Inc." in the platform, add a demo admin as a licensed user, complete onboarding, and populate a pipeline of products + studies + documents for demo intelligence.

## Inputs

- Seed payload: `seed-data/orthofix.seed.json`
- Seeder script: `scripts/seed_demo_client.py`
- API mapping template: `scripts/api_map.example.json`

## What you must do in the product codebase

1. Identify the **admin/seed API** (REST or GraphQL) already used for creating:
   - clients/tenants
   - users
   - license assignments
   - programs/products
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
   - Pipeline view shows the programs/products and studies
   - Documents are visible and link to public sources

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
  --seed-file seed-data/orthofix.seed.json \
  --api-map scripts/api_map.example.json \
  --dry-run

python scripts/seed_demo_client.py \
  --seed-file seed-data/orthofix.seed.json \
  --api-map scripts/api_map.example.json
```

## Idempotency requirement

The seed must be safe to run multiple times.

Natural keys used:
- Client: `slug` = `orthofix`
- User: `email`
- Program/Product: `code`
- Study: `registry_id`
- Document: `source_url`
