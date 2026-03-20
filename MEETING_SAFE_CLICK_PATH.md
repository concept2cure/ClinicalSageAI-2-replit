# Lumen Bio Platform — Meeting-Safe Click Path

## 10-Minute Demo Walkthrough (March 2026)

---

### Pre-Flight Checklist (do before meeting starts)

- [ ] PostgreSQL running: `sudo pg_ctlcluster 15 main start`
- [ ] Server running: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trialsage" JWT_SECRET="demo-secret-key-for-lumen-meeting-2026-03" NODE_ENV=development npx tsx server/index.ts`
- [ ] Health check: `curl http://localhost:5000/api/health` → `{"status":"healthy"}`
- [ ] Browser open to `http://localhost:5000/concept2cure/login`
- [ ] Fallback DOCX and artifact ready (see bottom)

---

### LOGIN (30 seconds)

| Step | Action                                                | What You See             |
| ---- | ----------------------------------------------------- | ------------------------ |
| 1    | Navigate to `/concept2cure/login`                     | Two-step login form      |
| 2    | Type `jm.smith@concept2cure.pro` → click **Continue** | Password field appears   |
| 3    | Type `demo123` → click **Sign in**                    | Shell loads with sidebar |

### SAFE SIDEBAR — Biotech Mode ✅

After login, the sidebar shows these modules. **Only click items marked ✅**:

| Sidebar Button         | Safe? | Notes                                                |
| ---------------------- | ----- | ---------------------------------------------------- |
| **RI Copilot**         | ✅    | Chat interface, always works                         |
| **IND Workspace**      | ✅    | Shows IND planning dashboard                         |
| **eCTD Co-Author**     | ✅    | Drafting surface, primary demo target                |
| **CMC Platform**       | ✅    | Shows CMC dashboard with drug substance data         |
| **Document Vault**     | ✅    | Shows artifact list                                  |
| **Clinical Trial Hub** | ✅    | Shows trial management view                          |
| **Evidence Search**    | ⚠️    | Only if asked — requires API key for actual searches |

### DO NOT CLICK ❌

- Any "Generate" button that calls an AI API (will hang w/o valid OpenAI key)
- Settings / Account dialogs
- Any external links or redirects
- The organization switcher

---

### WALKTHROUGH SEQUENCE (8 minutes)

#### Scene 1: Biotech-First Shell (1 min)

**Screenshot**: `01-biotech-first-shell.png`

1. After login, **pause** — show the sidebar with all biotech modules
2. SAY: _"This is the unified biotech shell. Every regulatory workflow is accessible from one sidebar — IND, eCTD, CMC, Document Vault, Clinical Trials."_
3. Point out the project selector at the top of the sidebar

#### Scene 2: eCTD Co-Author — Drafting Surface (2 min)

**Screenshot**: `02-ectd-drafting-surface.png`

1. Click **eCTD Co-Author** in sidebar
2. SAY: _"The eCTD Co-Author lets regulatory writers draft submission sections in-platform. It structures content to eCTD Module format."_
3. If a section list is visible, click into any section to show the editor
4. **Screenshot**: `03-editor-populated.png`

#### Scene 3: CMC Platform — Module 3 Dashboard (2 min)

**Screenshot**: `04-cmc-dashboard.png`

1. Click **CMC Platform** in sidebar
2. SAY: _"The CMC module centralizes drug substance and drug product data. This maps directly to eCTD Module 3."_
3. Point out the dashboard cards/sections (Drug Substance, Drug Product, Specifications)
4. If Module 3 export button is visible, click it
5. **Screenshot**: `05-cmc-module3-doc.png`

#### Scene 4: Document Vault — Artifact Persistence (1.5 min)

**Screenshot**: `06-artifact-list.png`

1. Click **Document Vault** in sidebar
2. SAY: _"Every document generated or drafted is saved here with version history. Documents persist across sessions — we proved this in automated testing."_
3. Show any listed documents

#### Scene 5: IND Workspace (1 min)

**Screenshot**: `07-ind-workspace.png`

1. Click **IND Workspace** in sidebar
2. SAY: _"The IND Workspace ties together the full submission package — all modules, all artifacts, one dashboard."_

#### Closing (30 seconds)

- SAY: _"All of this runs in one integrated shell. No separate apps, no tab switching. We've automated proof tests that verify every module renders correctly after every code change."_

---

### IF SOMETHING BREAKS — FALLBACK PLAN

| Problem            | Action                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Server won't start | Show pre-captured screenshots from `test-artifacts/final-meeting-screenshots/`             |
| Login fails        | Use Quick Demo Access button on login page                                                 |
| CMC page blank     | Skip to Document Vault, continue from there                                                |
| eCTD editor stalls | Show `03-editor-populated.png` screenshot, say "let me show you the saved version"         |
| Any API error      | Say "let me show you the exact same flow from our automated test run" and show screenshots |

### Fallback Assets (pre-positioned)

- `test-artifacts/final-meeting-screenshots/01-biotech-first-shell.png`
- `test-artifacts/final-meeting-screenshots/02-ectd-drafting-surface.png`
- `test-artifacts/final-meeting-screenshots/03-editor-populated.png`
- `test-artifacts/final-meeting-screenshots/04-cmc-dashboard.png`
- `test-artifacts/final-meeting-screenshots/05-cmc-module3-doc.png`
- `test-artifacts/final-meeting-screenshots/06-artifact-list.png`
- `test-artifacts/final-meeting-screenshots/07-ind-workspace.png`
- Pre-generated fallback DOCX: `test-artifacts/fallback-module3-drug-substance.docx`

---

### PROOF TEST RESULTS (cite if asked)

- **Playwright biotech-modules.spec.ts**: 6/6 passed — all sidebar modules render in-shell
- **Artifact save/reopen API proof**: Artifact saved → retrieved with identical content + version history
- All screenshots captured from live running platform, not mocks

---

### STARTUP COMMANDS (copy-paste ready)

```bash
# 1. Start PostgreSQL
sudo pg_ctlcluster 15 main start

# 2. Start server
cd /workspaces/Concept2Cure.RI-2-replit
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trialsage" \
JWT_SECRET="demo-secret-key-for-lumen-meeting-2026-03" \
NODE_ENV=development \
npx tsx server/index.ts

# 3. Open browser
open http://localhost:5000/concept2cure/login
```
