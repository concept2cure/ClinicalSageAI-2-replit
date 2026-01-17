# Auth Setup (Supabase Auth + Neon DB)

Neon provides PostgreSQL hosting only. For user sign-in, this project uses Supabase Auth
while the application data lives in Neon.

## Required environment variables

Server-side:

```bash
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
```

Client-side (Vite):

```bash
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

## What these are used for

- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` power server-side Supabase operations.
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are safe-to-expose client keys for user
  sign-in via Supabase Auth.

## Notes

- Do **not** reuse service role keys in the browser.
- Keep secrets in environment variables and avoid logging them.
