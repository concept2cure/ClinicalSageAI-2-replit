# ClinicalSage Deployment Guide

This application is architected as a **Multi-Tenant SaaS**. 
It is currently running in "Simulation Mode" using a Mock Database (`src/lib/database.js`).

## 1. Production Build
Run the build command to generate the static artifacts in `dist/`.
```bash
npm run build

```

## 2. Going Live (Replacing the Mock DB)

To move to production, you must replace the Mock DB with a real PostgreSQL connection (e.g., Supabase).

### Step A: Database Schema

Create the following tables in your Postgres DB:

* `tenants` (id, name, plan)
* `users` (id, email, tenant_id, role)
* `documents` (id, tenant_id, title, content_json, status)
* `artifacts` (id, tenant_id, source_data_json)
* `smart_tags` (id, doc_id, artifact_id, variable, status)

### Step B: Update `src/lib/database.js`

Replace the `SaaSDatabase` class with actual API calls.

**Example (Supabase):**

```javascript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(URL, KEY);

class RealDatabase {
  async getProjects(tenantId) {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('tenant_id', tenantId); // RLS Enforcement
    return data;
  }
}
export const db = new RealDatabase();

```

## 3. Environment Variables

Configure your CI/CD (Vercel/Netlify) with:

* `VITE_SUPABASE_URL`
* `VITE_SUPABASE_ANON_KEY`
* `VITE_ENABLE_TIPTAP_EDITOR=true`

## 4. Security Note

The current `SaaSLayout` simulates authentication. Integrate **Clerk** or **Auth0** in `App.jsx` to replace the `useEffect` simulation.
