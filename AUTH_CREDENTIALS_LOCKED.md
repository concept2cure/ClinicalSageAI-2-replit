# 🔐 AUTHENTICATION CREDENTIALS - LOCKED & VERIFIED

## ⚠️ DO NOT MODIFY - WORKING CONFIGURATION

**Last Verified:** January 23, 2026
**Status:** ✅ WORKING - TESTED & CONFIRMED

---

## Login Credentials

| Field | Value |
|-------|-------|
| **Email** | `jm.smith@concept2cure.pro` |
| **Password** | `demo123` |
| **User ID** | 2 |
| **Organization** | Concept2Cure (ID: 2) |
| **Role** | admin |

---

## Database Connection

```
DATABASE_NEON_NEW_SECRET=postgresql://neondb_owner:npg_bMoSyf2sDq6r@ep-wild-forest-ahbojhu4-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require
```

**Host:** `ep-wild-forest-ahbojhu4-pooler.c-3.us-east-1.aws.neon.tech`
**Database:** `neondb`
**User:** `neondb_owner`
**Password:** `npg_bMoSyf2sDq6r`

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | User login |
| `/api/projects?org_id=2` | GET | Get projects |
| `/api/clients/all` | GET | Get all client workspaces |
| `/auth` | GET | Login page |
| `/client-portal` | GET | Client portal (post-login) |

---

## Test Command (Copy & Paste)

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jm.smith@concept2cure.pro","password":"demo123"}'
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
