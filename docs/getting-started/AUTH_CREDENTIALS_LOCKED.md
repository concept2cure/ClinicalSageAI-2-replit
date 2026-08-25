# 🔐 AUTHENTICATION CREDENTIALS - LOCKED & VERIFIED

## ⚠️ DO NOT MODIFY - WORKING CONFIGURATION

**Last Verified:** January 23, 2026
**Status:** ✅ WORKING - TESTED & CONFIRMED

---

## Login Credentials

| Field            | Value                        |
| ---------------- | ---------------------------- |
| **Email**        | `jonmichaelpsmith@gmail.com` |
| **Password**     | `demo123`                    |
| **User ID**      | 2                            |
| **Organization** | Concept2Cure (ID: 2)         |
| **Role**         | admin                        |

---

## Database Connection

> **The connection string is a secret and is no longer recorded here.** A live
> `neondb_owner` password sat in this file in plaintext (both as a URL and on its
> own line) from 2026-01-23 until it was removed. `neondb_owner` is the _owner_
> role — strictly above the non-superuser `app_service` role that the tenant-RLS
> program depends on — so anyone who read this file could bypass row-level
> security entirely.
>
> **Removing it here does not un-leak it.** It remains in git history, so the
> credential must be treated as compromised and **rotated in the Neon console**;
> deletion from the working tree is cleanup, not remediation.

Take the connection string from the environment, never from a document:

```bash
# Provided by the deployment environment / your local .env (which is gitignored).
# Application runtime uses the restricted role; see scripts/db/provision-app-role.mjs.
echo "$DATABASE_URL"        # migrations / tooling
echo "$APP_DATABASE_URL"    # application runtime (app_service, non-superuser)
```

**Host / database / role** are discoverable from that value at runtime and are
deliberately not duplicated here — a second copy is a second thing to rotate.

---

## API Endpoints

| Endpoint                 | Method | Purpose                    |
| ------------------------ | ------ | -------------------------- |
| `/api/auth/login`        | POST   | User login                 |
| `/api/projects?org_id=2` | GET    | Get projects               |
| `/api/clients/all`       | GET    | Get all client workspaces  |
| `/auth`                  | GET    | Login page                 |
| `/client-portal`         | GET    | Client portal (post-login) |

---

## Test Command (Copy & Paste)

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jonmichaelpsmith@gmail.com","password":"demo123"}'
```

Expected Response: `{"success":true,"token":"...","user":{...}}`

---

## Demo Data Available

### Organization

- **Name:** Concept2Cure
- **ID:** 2
- **Type:** CONSULTING_FIRM

### Client Workspace

- **Name:** Demo Pharma Client
- **ID:** 4
- **Organization ID:** 2

### Projects (4 total)

1. Enzymax Forte IND Submission (65% complete)
2. CardioZen Phase 2 Protocol (42% complete)
3. MedDevice 510(k) Submission (78% complete)
4. NeuroClear CER Report (92% complete, in review)

---

## ⛔ NEVER DO THE FOLLOWING

1. ❌ Change the email format (keep the dot: jm.smith)
2. ❌ Modify the password hash in database
3. ❌ Change DATABASE_NEON_NEW_SECRET format
4. ❌ Add mock/demo authentication fallbacks
5. ❌ Use hardcoded admin/admin123 anywhere

---

## Files That Must Not Change

- `server/routes/auth.js` - Database-only authentication
- `client/src/hooks/use-auth.jsx` - Real API calls only
- `client/src/pages/AuthPage.jsx` - Concept2Cure branded login
- `server/db/index.ts` - Neon connection

---

**THIS CONFIGURATION IS PRODUCTION-READY AND VERIFIED WORKING**
