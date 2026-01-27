# 🤖 CODESPACE & COPILOT AGENT RULES

## ⚠️ CRITICAL: SINGLE BRANCH DEVELOPMENT ONLY

**ALL development work MUST happen on this branch:**
```
concept2cure-v2
```

### What This Means:
- ✅ **DO**: Work ONLY on `concept2cure-v2`
- ✅ **DO**: Commit all changes to `concept2cure-v2`
- ✅ **DO**: Push updates to `concept2cure-v2`
- ❌ **DO NOT**: Create new feature branches
- ❌ **DO NOT**: Create `copilot/*`, `codex/*`, or any other branches
- ❌ **DO NOT**: Work on `main` directly
- ❌ **DO NOT**: Suggest branching strategies unless explicitly asked

### Development Flow:
1. Always verify you're on `concept2cure-v2`: `git branch`
2. If not, switch immediately: `git checkout concept2cure-v2`
3. Pull latest: `git pull origin concept2cure-v2`
4. Do your work
5. Commit and push to `concept2cure-v2`

### Exception Handling:
- If asked to create a branch, **ASK THE USER FIRST** why they don't want to use `concept2cure-v2`
- If a hotfix is needed, branch FROM `concept2cure-v2` and merge BACK to `concept2cure-v2`

## 🚫 DO NOT REBUILD AUTHENTICATION OR PORTAL

**Existing, working implementations:**
- Auth API: `client/src/lib/authClient.ts`
- Auth Hook: `client/src/hooks/use-auth.tsx`
- Login UI: `client/src/components/auth/Login.jsx`
- Portal V2: `client/src/components/client-portal/`
- Cortex AI: `client/src/components/ai/LumenAiAssistant.jsx`

**If you think something needs to be rebuilt, STOP and ASK THE USER.**

## 📍 Component & Feature Locations

### Authentication (DO NOT RECREATE)
- **API Client**: `client/src/lib/authClient.ts`
- **React Hook**: `client/src/hooks/use-auth.tsx`
- **Login Page**: `client/src/components/auth/Login.jsx`
- **Backend**: `server/auth.ts`, `server/routes/auth/`
- **Route Guard**: `client/src/utils/withAuthGuard.jsx`

### Client Portal V2 (DO NOT RECREATE)
- **Main Entry**: `client/src/pages/ClientPortal.jsx`
- **Components**: `client/src/components/client-portal/`
- **Portal Shell**: `client/src/portal/` (if exists)

### Project Cortex / LUMEN AI (DO NOT RECREATE)
- **Backend Services**: `server/services/cortexPrimeService.ts`, `server/services/lumen-cortex-service.ts`
- **UI Components**: `client/src/components/ai/LumenAiAssistant.jsx`
- **Context**: `client/src/contexts/LumenAiAssistantContext.jsx`

## 🎯 User Flow (DO NOT BREAK)
1. User visits `/login` or `/auth`
2. Logs in using `Login.jsx` → `authClient.ts`
3. On success, redirected to `/client-portal` (V2)
4. Portal loads with Cortex AI panel available
5. User is authenticated throughout session

## 🔥 If You're About To:
- Create a new auth system → **STOP, USE EXISTING AT `client/src/lib/authClient.ts`**
- Create a new login page → **STOP, USE `client/src/components/auth/Login.jsx`**
- Create a new portal → **STOP, USE V2 PORTAL AT `client/src/components/client-portal/`**
- Rebuild Cortex integration → **STOP, IT EXISTS AT `client/src/components/ai/`**
- Create a new branch → **STOP, USE `concept2cure-v2` ONLY**

## ❓ Questions?
- If unsure, **ASK THE USER** before making changes
- When in doubt, **DO NOTHING** rather than break working code
- Never assume you should rebuild something that already exists

---

**Last Updated**: January 26, 2026  
**Enforcement**: Mandatory for all AI agents, Codespace bots, and developers
