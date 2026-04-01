# Human Beta Test Script

**Generated:** 2026-04-01
**Audience:** Founder + first human beta testers
**Prerequisite:** App running at `http://localhost:5000` (or deployed URL), with `DATABASE_URL` configured

---

## Before You Start

1. Ensure the app is running: `npm run dev`
2. Ensure at least one test user exists in the database
3. Have a project available (or the demo flow will create one)

---

## Path 1: Core Beta Journey (10 minutes)

### Step 1 — Enter the product

1. Open `http://localhost:5000` in your browser
2. **Expected:** Redirects to `/concept2cure` (or `/concept2cure/login` if not authenticated)
3. **Verify:** You do NOT land on `/client-portal` or a blank page

### Step 2 — Sign in

1. On the login page, use demo access (if available) or enter credentials
2. **Expected:** After login, you land on the Zen shell with a visible sidebar
3. **Verify:** Sidebar shows global navigation items (Projects, Apps, etc.)

### Step 3 — Select or create a project

1. In the sidebar, find the project list (Recent / Pinned projects section)
2. Click on an existing project, or create a new one via "New" button
3. **Expected:** Project context loads; project name appears in the header area
4. **Verify:** The sidebar shows project-specific tabs (Overview, Tools, Vault, Review, Submit)

### Step 4 — Navigate the workspace

1. Click **Tools** in the project sidebar tabs
2. **Expected:** The workspace loads with document-related content
3. Click **Vault** → **Review** → **Submit** tabs sequentially
4. **Verify:** Each tab renders content (not blank screens)
5. Return to **Overview**
6. **Verify:** You're still in the same project (not logged out, not redirected)

### Step 5 — Open AnA chat

1. Look for the chat input area (usually at the bottom of the main panel)
2. Type a simple message: "What documents do I need for my submission?"
3. **Expected:** AnA responds with a relevant answer about regulatory documents
4. **Verify:** The response appears in the chat area, not in an error state

### Step 6 — Save AI response as artifact

1. After receiving an AnA response, look for a "Save to Vault" or bookmark icon
2. Click it
3. **Expected:** The response is saved as a governed artifact
4. **Verify:** You can find it in the Vault or document list

---

## Path 2: Governed Document Flow (15 minutes)

### Step 7 — Enter the document workspace

1. From the project, click **Tools** (or equivalent workspace entry)
2. **Expected:** You see a file tree or document list on the left
3. **Verify:** The workspace shell renders with a visible document tree

### Step 8 — Open an existing document (or create one)

1. If documents exist, click one to open it
2. If no documents exist, use AnA to generate one:
   - Type: "Draft an IND outline for this project"
   - Wait for the response
   - Save it as an artifact
3. **Expected:** The document opens in the editor panel
4. **Verify:** You see document content, not a loading spinner or error

### Step 9 — Verify document metadata

1. With a document open, look for status indicators (Draft, Review, Approved)
2. Look for provenance information (who created it, when)
3. **Expected:** Status shows "Draft" for newly created documents
4. **Verify:** The document has a project association visible

### Step 10 — Return to workspace

1. Close the editor or navigate back to the workspace view
2. **Expected:** You return to the workspace without losing project context
3. **Verify:** The project is still selected, the document list is visible

---

## Path 3: Navigation Integrity (5 minutes)

### Step 11 — Test navigation roundtrip

1. From a project workspace, click a global nav item (e.g., Projects)
2. **Expected:** You see the project list
3. Click back into your project
4. **Expected:** You return to the project context
5. **Verify:** No blank screens, no login redirects, no stale state

### Step 12 — Test keyboard shortcuts

1. Press `⌘K` (Mac) or `Ctrl+K` (Windows)
2. **Expected:** Command palette opens
3. Press `Escape` to close it
4. Press `⌘N` or `Ctrl+N`
5. **Expected:** New chat starts
6. Press `⌘,` or `Ctrl+,`
7. **Expected:** Settings panel opens

---

## What to Report

For each step, note:

| Question | Expected |
|----------|----------|
| Did the page load? | Yes — content visible, no blank screen |
| Did navigation work? | Yes — correct destination, no redirect loops |
| Were there console errors? | Ideally none; note any red errors |
| Did the sidebar stay visible? | Yes — always present in the shell |
| Was the project context preserved? | Yes — same project after navigation |
| Did AnA respond? | Yes — relevant text, no error message |

---

## Known Limitations (Not Bugs)

These are expected behaviors during beta:

| Behavior | Explanation |
|----------|------------|
| Some sidebar items may show empty state | Feature not yet wired; not a crash |
| TypeScript warnings in console | Pre-existing TS issues; does not affect runtime |
| Some legacy routes (e.g., `/client-portal/ectd-coauthor`) may 404 | Not in beta path; expected |
| Standalone eCTD without project may show empty | Primary path requires project context |
| Some AI responses may be slow | Depends on AI gateway/API key configuration |

---

## Success Criteria

The beta is successful if a tester can:

1. Enter from the canonical URL and reach the shell
2. Sign in without confusion
3. Select a project and navigate workspace tabs
4. Interact with AnA and get relevant responses
5. Save an AI response as a governed artifact
6. Open a document in the editor
7. Navigate back to workspace without losing context
8. Complete the full journey without a blocking error
