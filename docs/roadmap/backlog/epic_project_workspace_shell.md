# Epic: Project Workspace Shell

## Goal
Provide a unified 3‑pane workspace UI that serves as the foundation for all Concept2Cure modules. The shell ensures users can always see where they are and what they’re working on, with quick access to projects, modules, chats, artifacts, workflows, and PM docs.

## User Stories
1. **Project switching:** As a user, I can switch between projects from anywhere in the app.
2. **Project tree navigation:** As a user, I see a project→module tree in a left sidebar, showing chats, artifacts, workflows, and PM docs.
3. **Central work area:** As a user, I have a central work area that toggles between chat, workflow runner, artifact editor, and PM docs.
4. **Context panel:** As a user, I see context information—artifacts, audit events, tasks—in a right panel that follows me as I work.
5. **Global create:** As a user, I have a global Create button that lets me start new projects, chats, uploads, artifacts, or workflows.

## Tasks
- Design and implement the **AppShell** layout with responsive three‑pane structure.
- Build the **ProjectSidebar** component:
  - Implement a project switcher with recent projects list.
  - Render project → module → chats/artifacts/workflows/PM docs tree.
  - Highlight the active context.
- Build the **ContextPanel** component:
  - Implement a tab bar with Artifacts, Files, Timeline (audit & eSign), and Tasks.
  - Ensure the panel reacts to the current context (e.g., shows artifacts related to the open chat).
- Add a global **Create** button in the top bar with options: New Project, New Chat, Upload File, Create Artifact, and Start Workflow.
- Integrate routing structure matching the roadmap:
  - `/projects`, `/projects/:projectId`, `/projects/:projectId/m/:moduleKey`, `/projects/:projectId/m/:moduleKey/chats/:chatId`, etc.
- Create initial Tailwind/CSS styles for the shell with light theme, subtle gradients, and a calm regulatory tone.

## Acceptance Criteria
- Users can navigate across projects and modules via the sidebar.
- The central area correctly displays chat, workflows, artifact editor, or PM docs based on routing.
- The context panel shows relevant artifacts and audit events and allows tab switching.
- The global Create button opens a menu or modal with the creation options.
