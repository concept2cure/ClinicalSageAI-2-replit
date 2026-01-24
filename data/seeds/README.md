# Seed Data

This directory contains demo seed data for various tenants/customers.

## Available Seeds

| Directory | Description |
|-----------|-------------|
| `lumen-demo/` | Lumen demo tenant seed data |
| `orthofix-demo/` | Orthofix demo tenant seed data |

## Using Seeds

Each seed kit contains:
- `README.md` - Setup instructions
- `seed-data/` - JSON/SQL seed files
- `scripts/` - Import scripts
- `AGENT_RUNBOOK.md` - AI agent setup
- `DEMO_PRESSURE_TEST_PLAN.md` - Test scenarios

## Running Seeds

```bash
# Import Lumen demo data
node data/seeds/lumen-demo/scripts/import.js

# Import Orthofix demo data
node data/seeds/orthofix-demo/scripts/import.js
```

## Creating New Seeds

1. Copy an existing seed kit directory
2. Update the README with tenant-specific info
3. Modify seed-data files for the new tenant
4. Test import scripts
