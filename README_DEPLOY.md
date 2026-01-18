# ClinicalSage Deployment Guide

This application is architected as a **Multi-Tenant SaaS**. 
It is currently running in "Simulation Mode" using a Mock Database (`src/lib/database.js`).

## 1. Production Build
Run the build command to generate the static artifacts in `dist/`.
```bash
npm run build

```

## 2. Going Live (Replacing the Mock DB)

To move to production, you must replace the Mock DB with a real PostgreSQL connection (Neon recommended).

### Step A: Database Schema

Create the following tables in your Postgres DB:

* `tenants` (id, name, plan)
* `users` (id, email, tenant_id, role)
* `documents` (id, tenant_id, title, content_json, status)
* `artifacts` (id, tenant_id, source_data_json)
* `smart_tags` (id, doc_id, artifact_id, variable, status)

### Step B: Update `src/lib/database.js`

Replace the `SaaSDatabase` class with actual API calls.

**Example (Postgres/Neon-backed API):**

```javascript
class RealDatabase {
  async getProjects(tenantId) {
    const res = await fetch(`/api/projects?tenantId=${tenantId}`);
    return res.json();
  }
}
export const db = new RealDatabase();

```

## 3. Environment Variables

Configure your CI/CD (Vercel/Netlify) with:

* `NEON_DATABASE_URL`
* `DATABASE_URL` (fallback for local/dev)
* `VITE_ENABLE_TIPTAP_EDITOR=true`

## 4. Security Note

The current `SaaSLayout` simulates authentication. Integrate **Clerk** or **Auth0** in `App.jsx` to replace the `useEffect` simulation.
