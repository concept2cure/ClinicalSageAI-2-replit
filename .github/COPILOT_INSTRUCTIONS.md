# 🤖 CODESPACE & COPILOT AGENT RULES

## RULE 5 — one design, one plan, absolute (see `CLAUDE.md`)

The founder decided on 2026-10-31 (P-78) that Concept2Cure is **Claude for life sciences**. It looks and works like
Claude (claude.ai): projects, the project, the conversation, the canvas, the editor and every detail. Every
capability beneath the UI is brought to life inside that UI.

**What the product is (P-79, 2026-11-01).** The centre is the document and its filing: build it, format it correctly
and file it in eCTD (3.2.2 and 4.0), with Vault (to compete with Veeva) and AnA doing the work in conversation.
Everything starts in a project with a goal. Then come:
1. the project's data room: an immutable catalog with lineage kept in perpetuity;
2. the protocol: hypothesis and endpoints;
3. the engines' evidence: biostatistics and safety;
4. AnA's narrative, which a person edits or directs, and where AnA pushes back when the data do not support a claim;
5. the one editor;
6. eCTD filing.

CMC and risk-based monitoring are the featured work areas. Clients are device and diagnostics, biotech and big
pharma, in the US, EU, Japan, Canada and Australia. The plan's §1a lists what already exists for each step, and its
packages S1–S8 are the work.

**The plan is `docs/design/ONE_DESIGN_PLAN.md`, and its ledger is `docs/design/one-design-plan.json`.** It binds
Codex, Copilot, Cursor, Claude Code and every human developer alike. Nobody builds anything outside it.

- **Name the package.** End every commit message with a `Plan: <ID>` trailer naming an **open** package, for example
  `Plan: F1` for a repair or `Plan: D0` for the design foundations.
- **Stay inside it.** Change only files inside that package's `paths`. Tests, `docs/evidence/**` and `.design/**` are
  always allowed.
- **Add nothing unapproved.** Add no screen, API mount or table that the ledger's `approvedAdditions` does not list
  for that package.
- **Leave the plan to the founder.** Never change the plan, its ledger, its gate or this rule. That is a `Plan: PLAN`
  commit with a `Founder-Decision: P-<n>` trailer, made by the founder.

`npm run ci:one-design-plan` in `.husky/pre-push` refuses anything else. There is no bypass.



## RULE 6 — nothing new; finish what exists (see `CLAUDE.md`)

The founder decided on 2026-11-01 (P-80) that **no agent builds anything new**. Work continues and finishes what is
in place, with working UI in the Claude design. The vision is Veeva, Weave Bio, Artos and Certara merged as one and
built by Anthropic as Claude for life sciences, and the code for it already exists here.

- **Name what you finish.** End every commit with a `Completes: <path>` trailer, next to `Plan: <ID>`. The path is
  an existing file or folder, found by searching first.
- **Add nothing new.** Add no screen, route file, service, table, mount or AnA tool. `ci:one-design-plan` refuses
  them unless the founder approved them in the ledger.
- **Split inside the folder.** A file split out of a large one goes inside the folder it came from.

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

1. Always verify you're on `concept2cure-v2`: `git branch --show-current`
2. If not, switch immediately: `git checkout concept2cure-v2`
3. Pull latest: `git pull origin concept2cure-v2`
4. Do your work
5. Commit and push to `concept2cure-v2`

### Exception Handling:

- There are no branch exceptions. Do not create a branch for a hotfix, review,
  delegation, or any other purpose.
- If a review artifact is required, it must describe changes already committed
  on `concept2cure-v2`.

### 🤖 GitHub Copilot Agent Delegation

**CRITICAL for Copilot Workspace/Agent Users:**

When using GitHub Copilot's delegation features:

1. **BEFORE starting**: Ensure you're on `concept2cure-v2` branch
2. **DO NOT** allow Copilot to create `copilot/*` branches automatically
3. **ALL delegated work** must happen on `concept2cure-v2`
4. If Copilot creates a `copilot/*` branch by mistake:
   - Immediately switch to `concept2cure-v2`: `git checkout concept2cure-v2`
   - Cherry-pick any changes: `git cherry-pick <commit-hash>`
   - Delete the copilot branch: `git branch -D copilot/<branch-name>`
   - Push to origin: `git push origin --delete copilot/<branch-name>` (if pushed)
5. Do not create a PR or branch workflow via delegation; delegated work belongs
   directly on `concept2cure-v2`.

**Why This Matters:**

- The repository has strict branch governance for regulatory compliance
- Multiple `copilot/*` branches create chaos and violate audit requirements
- PRs from `copilot/*` branches may be rejected or not findable after delegation
- All work must be traceable to `concept2cure-v2` for compliance

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
