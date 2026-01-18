# Co-Author Demo Mode (No DB Required)

This repo supports a **dev-only demo mode** for the Co-Author dashboard so the UI can be exercised without a live database connection.

## Enable demo mode

```bash
export DEMO_MODE=1
npm install
npm run dev
```

## Verify the Co-Author wiring

In another terminal, run the deterministic smoke script:

```bash
npm run smoke:coauthor
```

Optional parameters:

```bash
BASE_URL=http://localhost:5000 ORG_ID=7 DOCUMENT_ID=101 npm run smoke:coauthor
```

The smoke script asserts **200 OK** responses and validates the required keys for:

- `GET /api/coauthor/documents`
- `GET /api/coauthor/ectd-modules/tree-with-counts`
- `GET /api/coauthor/validate/latest/:id`
