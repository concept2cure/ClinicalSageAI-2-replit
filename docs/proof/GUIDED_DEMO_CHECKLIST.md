# Guided Demo Checklist — ClinicalSageAI

> **Purpose**: Approved click paths for demonstrating the document loop.
> **Date**: 2026-03-22

---

## Pre-Demo Environment Checks

- [ ] `ANTHROPIC_API_KEY` is set (Claude is primary AI provider)
- [ ] `DATABASE_URL` is set and PostgreSQL is reachable
- [ ] At least one project exists with `organizationId` matching the logged-in user
- [ ] Server is running (`npm run dev`)
- [ ] Browser is logged in with valid JWT token

### Health Check Commands
```bash
curl -s http://localhost:5000/api/health | jq .
curl -s http://localhost:5000/api/cortex/health | jq .
```

---

## Approved Demo Paths

### 1. Chat → Artifact (Primary)

1. Navigate to **Regulatory Workspace** (main screen)
2. In the AnA chat panel, type: *"Draft a 510(k) device description for a cardiac monitor"*
3. Wait for AI response
4. Click the **Save to Vault** button (download icon) on the response
5. Verify: "Saved" label appears
6. Navigate to **Files** panel (left rail) → artifact appears
7. Click artifact → opens in editor with content

### 2. IND Section Draft

1. Navigate to **IND Workspace**
2. Find a section marked "AI Draftable" (e.g., 2.5 Clinical Overview)
3. Click **Draft with RI**
4. Wait for AI generation
5. Editor opens with populated content
6. Navigate to **Files** panel → artifact appears
7. Verify: artifact has CTD section code, status = "draft"

### 3. eCTD Co-Author Draft

1. Navigate to **eCTD Co-Author** mode
2. Select a section from the outline tree
3. Click **Draft with RI** (or "Regenerate" if already drafted)
4. Content appears in the section editor
5. Artifact created in project (check Files panel)

### 4. Document Lifecycle

1. Open any artifact in the editor
2. Click **Status** dropdown → change to "In Review"
3. Verify: status badge updates
4. If reviewer role: approve → verify attestation dialog appears
5. After approval: verify locked state prevents editing

### 5. Feedback Loop

1. In any chat, hover over an AI response
2. Click thumbs up or thumbs down
3. Verify: no console.info (F12 console) — feedback goes to DB

---

## What NOT to Click During Demo

| Surface | Why |
|---------|-----|
| **Mission Control** (if visible) | In-memory experimental — data lost on restart |
| **SnowGlobe** | Uses `DEMO_PROGRAM_ID` — not real project data |
| **Legacy routes** (`/v3`, `/client-portal`) | Deleted — will 404 |
| **eCTD Co-Author Standalone** (without project selected) | Shows empty ZeroState — expected behavior, not a bug |

---

## Fallback Plan

### If AI generation fails (503 / timeout)
- Verify `ANTHROPIC_API_KEY` is valid
- Check `OPENAI_API_KEY` as fallback
- Chat will show error message — retry is safe
- IND/eCTD will fall back to scaffold template (structural, not demo)

### If database is unreachable
- Artifact creation will fail with 503
- Chat still works (messages in `ai_messages` via pool.query)
- No demo fallback — system honestly reports the error

### If editor opens empty
- This should NOT happen — file a bug
- Check: was `initialContent` passed? Was artifact API response OK?
- Workaround: create new document manually via "+" button

---

## Post-Demo Verification

After demo, verify these in the database:

```sql
-- Artifacts created during demo
SELECT artifact_id, title, type, status, version, created_at
FROM concept2cure_artifacts
WHERE organization_id = <org_id>
ORDER BY created_at DESC LIMIT 10;

-- Provenance events
SELECT event_type, event_action, source_description, created_at
FROM concept2cure_provenance_events
WHERE organization_id = <org_id>
ORDER BY created_at DESC LIMIT 10;

-- Feedback recorded
SELECT message_id, positive, created_at
FROM ai_feedback
WHERE organization_id = <org_id>
ORDER BY created_at DESC LIMIT 10;
```
