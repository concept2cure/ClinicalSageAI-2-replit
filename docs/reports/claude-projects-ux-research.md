# Claude.ai Projects Feature — Comprehensive UX Research Report

> Prepared: 2026-03-25
> Purpose: UX research to inform ClinicalSageAI project workspace redesign

---

## 1. Entry Points & Navigation

### Creating a New Project
- **Sidebar hover**: Hover over the left edge of the screen to reveal the sidebar, then click "Projects" to open the projects list.
- **Direct URL**: Navigate to `claude.ai/projects` to reach the project list view.
- **"+ New Project" button**: Located in the upper-right corner of the projects list page. This is the primary creation entry point.
- The sidebar can be **pinned open** for persistent navigation access.

### Switching Between Projects
- Projects are listed in the sidebar under a dedicated "Projects" section, above individual (non-project) conversations.
- **Starred projects** appear at the top of the project list for quick access. Users star a project by clicking the star icon in the top-right corner of a project's detail page, or via the three-dot (⋮) overflow menu.
- Clicking a project in the sidebar opens its detail view (knowledge + conversation list).
- There is no dedicated "project switcher" dropdown — navigation is through the sidebar list.

### Sidebar Hierarchy
The sidebar organizes content in this order:
1. **Starred projects** (pinned to top)
2. **Active projects** (alphabetical or recent)
3. **Individual conversations** (non-project chats, chronologically ordered with auto-generated titles)
4. **Archived projects** (appear at the bottom of the projects list)

### Project List View
- Accessible at `claude.ai/projects`.
- Shows all projects with their names.
- Each project entry has a three-dot overflow menu with options: Star, Archive, Delete (delete requires unarchiving first if archived).
- Free users see up to 5 projects; paid users have unlimited projects.

---

## 2. Project Setup & Configuration

### Creation Flow
1. Click "+ New Project" (upper-right corner).
2. **Project Name** field — free text. Best practice: specific names like "Q4 Marketing Campaign" rather than "Project 1."
3. **Project Description** field — free text. **Important: Claude does NOT have access to the project name or description.** These are purely organizational metadata for the user.
4. **Visibility** (Team/Enterprise plans only):
   - **Private** (default) — only the creator and explicitly invited members can view.
   - **Public** — everyone in the organization can view and use the project.
5. Click create to enter the project workspace.

### Custom Instructions
- Located in the project detail page, within or adjacent to the "Project Knowledge" section on the right side.
- There is a "Set Custom Instructions" link/button in the knowledge panel.
- Instructions are written in a **free-text editor** — essentially a large text area.
- Instructions function identically to a system prompt in the API — they are prepended to every conversation within the project.
- Instructions persist across all conversations in the project without needing to be restated.
- Instructions consume tokens from the context window alongside knowledge files and conversation history.

### What Fields Exist
| Field | Required | Visible to Claude | Purpose |
|-------|----------|-------------------|---------|
| Project Name | Yes | No | User-facing label, sidebar display |
| Project Description | No | No | Organizational note for the user |
| Custom Instructions | No | Yes (system prompt) | Shapes Claude's behavior for all project chats |
| Visibility | Team/Enterprise only | N/A | Private vs. Public access |

---

## 3. File Management (Project Knowledge)

### Knowledge Panel Location
- The **Project Knowledge** section is displayed on the **right side** of the project's main/detail page.
- The left side of the project page shows the conversation list and chat interface.
- This creates a **two-panel layout**: conversations on the left, knowledge on the right.

### Uploading Files
- Click the **"+" button** (or "Add Content" button) in the Project Knowledge panel.
- Users can upload files via file picker or drag-and-drop.
- Users can also **paste text directly** into the knowledge base — raw text content, webpage content, email threads, or any text without creating a file.
- Claude-generated artifacts can be saved directly into the project knowledge base.

### Supported File Types
| Format | Extension |
|--------|-----------|
| PDF | .pdf |
| Word Document | .docx |
| CSV | .csv |
| Plain Text | .txt |
| HTML | .html |
| OpenDocument | .odt |
| Rich Text | .rtf |
| EPUB | .epub |
| Excel | .xlsx |
| Audio | .mp3, .wav |

### File Size & Token Limits
- **Individual file limit**: 30 MB per file.
- **Number of files**: Unlimited, but total content must fit within context window constraints.
- **Per-session upload limit**: 20 files at a time (projects can accumulate more over time).
- **Context window**: 200K tokens (~150,000 words, ~500 pages) shared across instructions, knowledge files, conversation history, and responses.
- **Enterprise**: Up to 500K tokens on some models.
- **RAG expansion**: Up to 10x capacity when RAG mode activates on paid plans.

### Context Window Usage
- The context window (200K tokens) is **shared** between:
  1. System prompt and custom instructions
  2. Project knowledge files
  3. Conversation history (growing with each exchange)
  4. Current user message
  5. Claude's response
- As conversations grow longer, earlier messages may be summarized or dropped.
- **No explicit visual progress bar** for token usage is prominently described in the sources, but there is a visual indicator when RAG mode activates.

### RAG Mode (Retrieval-Augmented Generation)
- **Paid plans only** (Pro, Max, Team, Enterprise).
- Activates **automatically** when project knowledge approaches the context window limit.
- In practice, RAG may activate at ~13 files regardless of total token size (known behavior gap vs. documentation).
- Visual indicator: A message appears stating "To save space in chats, Claude will look up specific information as needed."
- When RAG is active, Claude uses a visible **"project knowledge search" tool** — users can see Claude searching the knowledge base in the chat.
- If knowledge is later reduced below the threshold, RAG mode deactivates automatically and returns to direct context loading.

### File Management Operations
- Files can be removed individually from the knowledge base.
- **No versioning** — updating a document requires manually deleting the old version and uploading the new one.
- **No automatic sync** with external sources.
- Files uploaded to an individual chat conversation are NOT automatically added to project knowledge — they must be explicitly added.

---

## 4. Memory & Context

### Project Memory (Chat Memory Feature)
- Available since March 2026 on all plans (Free, Pro, Max, Team, Enterprise).
- Claude **automatically summarizes conversations** and creates a synthesis of key insights.
- Memory summaries are updated **every 24 hours** (nightly batch process).
- **Each project has its own isolated memory space** — separate from global (non-project) chat memory.
- Project-specific preferences and context only apply within that project's conversations.

### How Memory Works Across Conversations
- Claude maintains a **separate memory summary for each project** plus a global summary for non-project chats.
- Memory is a synthesis — not full conversation replay. Claude distills key insights, preferences, and patterns.
- Users can **explicitly tell Claude to remember something** mid-conversation: "Claude, remember that our team uses PostgreSQL." This takes effect immediately rather than waiting for the nightly update.
- Memory can be **paused** (stops adding new memories but keeps existing ones) or **reset** (permanently deletes all memories).

### Relationship Between Instructions, Knowledge, and Memory
```
┌─────────────────────────────────────────────────────────┐
│                    Context Assembly                       │
│                                                          │
│  1. Custom Instructions (system prompt, always present)  │
│  2. Project Knowledge Files (loaded or RAG-searched)     │
│  3. Memory Summary (auto-generated from past chats)      │
│  4. Current Conversation History                         │
│  5. User's Current Message                               │
│                                                          │
│  All share the 200K token context window                 │
└─────────────────────────────────────────────────────────┘
```

### Key Limitation
- **Conversations within a project do NOT share context with each other** unless information is added to the project knowledge base or captured by memory.
- Starting a new chat in a project gives access to: instructions + knowledge files + memory summary. It does NOT have the conversation history from other chats.

### Memory Management UI
- **Settings > Capabilities**: Toggle "Memory from chat history" on/off.
- **Pause Memory**: Temporarily stops memory without deleting existing memories.
- **Reset Memory**: Permanently deletes ALL memories (including project memories). Irreversible.
- **Incognito Mode**: Ghost icon in upper-right corner of chat. Incognito chats are never summarized into memory.
- **Memory Import**: Can import memories from ChatGPT, Gemini, and Grok.

---

## 5. Conversation Flow

### Starting a Conversation Within a Project
- Open the project from the sidebar or projects list.
- The project detail page shows existing conversations and the knowledge panel.
- Click to start a "New Chat" within the project context.
- Claude automatically has access to: custom instructions + knowledge files + memory summary.
- No need to re-upload files or restate instructions.

### Multiple Conversations Per Project
- **Yes** — each project supports multiple independent conversation threads.
- Each conversation is a separate chat with its own history.
- Conversations do NOT share context with each other (only shared project knowledge and instructions carry over).
- Use case: "Analyze Competitor A" in one chat, "Analyze Competitor B" in another — both reference the same knowledge base but maintain independent histories.

### Conversation History Display
- Within a project, all past conversations are listed (likely chronologically).
- Users can continue any prior conversation by clicking on it.
- Conversations can be **renamed** (click on the title to edit).
- Conversations can be **moved between projects** via a dropdown menu next to the chat name.
- Auto-generated titles are the default, but renaming is supported.

### Moving Chats
- Non-project conversations can be **moved into a project** via the dropdown arrow next to the chat name.
- Chats can be moved between projects as project scopes evolve.

---

## 6. Visual Design Patterns

### Overall Layout
```
┌──────────┬──────────────────────────────────────┬──────────────┐
│          │                                      │              │
│ SIDEBAR  │        MAIN CONTENT AREA             │  KNOWLEDGE   │
│          │                                      │  PANEL       │
│ Projects │  (Chat interface when in a chat)     │  (Right side │
│ --------│  (Conversation list when in project  │   of project │
│ Starred  │   detail view)                       │   detail)    │
│ Active   │                                      │              │
│ --------│                                      │ + Add Content│
│ Recent   │                                      │ Instructions │
│ Chats    │                                      │ Files list   │
│ --------│                                      │              │
│ Archived │                                      │              │
│          │                                      │              │
└──────────┴──────────────────────────────────────┴──────────────┘
```

### Sidebar
- **Collapsible**: Hover to reveal, or pin open.
- **Sections**: Projects section at top, individual chats below.
- **Starred projects**: Pinned to top of project list with star icon.
- **Archived projects**: Shown at bottom of project list.
- **Three-dot menu (⋮)**: On each project/chat entry for actions (star, archive, delete, move).

### Project Detail Page
- **Two-panel layout**: Conversation list / chat on the left; Knowledge panel on the right.
- **"+ New Project" button**: Orange/accent-colored button in upper-right corner.
- **Star icon**: Top-right corner of project detail page.
- **Three-dot menu (⋮)**: Top-right corner with options (archive, delete, etc.).
- **Share button**: To the right of the project name (Team/Enterprise plans).

### Chat Interface Within a Project
- Standard Claude chat interface with the message input at the bottom.
- **Project context indicator**: The chat shows which project it belongs to (project name visible).
- **Artifacts panel**: When Claude generates standalone content (code, documents), it appears in a live preview panel next to the chat.
- **RAG indicator**: When RAG is active, Claude visibly uses a "project knowledge search" tool in the conversation — users can see the search happening.
- **Incognito toggle**: Ghost icon in upper-right corner of chat.

### Color Coding & Icons
- **Star icon** (⭐): For marking favorite/priority projects.
- **Ghost icon** (👻): For incognito/private chat mode.
- **Three-dot overflow menu (⋮)**: Standard action menu on projects and chats.
- **"+" button**: For adding content to the knowledge base.
- **Orange/accent "New Project" button**: Primary CTA in the projects list.
- No project-specific color coding or custom icons per project described — projects are differentiated by name only.

### Typography & Content
- Project names appear in the sidebar and as headers on detail pages.
- Auto-generated conversation titles in the sidebar (can be renamed).
- Clean, minimal design consistent with Claude's overall aesthetic — white/light background, sans-serif typography.

---

## 7. Sharing & Collaboration

### Visibility Settings (Team/Enterprise Only)
| Setting | Who Can Access | When Set |
|---------|---------------|----------|
| Private (default) | Creator + explicitly invited members | At creation or any time |
| Public | Everyone in the organization | At creation or changed later |

### Sharing Flow
1. Open the project.
2. Click "Share project" button (to the right of project name).
3. Add members by name or email address.
4. Bulk sharing: paste a list of email addresses.
5. Set permission level per member.

### Permission Levels
| Permission | Can View Knowledge | Can Chat | Can Edit Instructions | Can Edit Knowledge | Can Manage Members |
|-----------|-------------------|----------|----------------------|-------------------|-------------------|
| Can Use (View) | Yes | Yes | No | No | No |
| Can Edit | Yes | Yes | Yes | Yes | Yes |

### Important Sharing Rules
- **Conversations are always private** — even in shared projects, individual chats are not visible to other members unless explicitly shared.
- **Chat sharing** (Team/Enterprise): Can only share with members of the same organization, never publicly.
- **Archiving resets permissions**: When a project is archived, all sharing permissions are wiped and the project reverts to private.
- **Admins can disable public projects** organization-wide while preserving internal sharing.
- Free and Pro (individual) plans: Projects are personal only — no sharing capability.

### Who Can Share
- Project creators can modify permissions and remove access.
- Members with "Can Edit" permission can also manage members.

---

## 8. Key Limitations & Known Issues

| Limitation | Detail |
|-----------|--------|
| No cross-project references | Projects are fully siloed — one project cannot access another's knowledge |
| No file versioning | Must delete and re-upload to update a document |
| No auto-sync | No connection to external file systems (Google Drive, Dropbox, etc.) |
| No cross-chat context | Conversations within a project don't see each other's history |
| RAG threshold mismatch | RAG may activate at ~13 files regardless of actual token usage |
| No custom icons/colors | Projects can't be visually differentiated beyond name and starring |
| Description not used by Claude | Project name and description are purely for user organization |
| Free tier limited to 5 projects | Paid plans have unlimited projects |
| 30MB per file hard limit | Must split larger files manually |

---

## 9. Comparative Feature Summary

### What Makes Claude Projects Distinct
1. **Knowledge-first design**: The knowledge panel is a first-class citizen in the project UI, not hidden behind settings.
2. **Automatic RAG scaling**: Seamless transition from direct context to RAG without user intervention.
3. **System-prompt-equivalent instructions**: Custom instructions function exactly like API system prompts.
4. **Project-scoped memory**: Each project builds its own memory independently.
5. **Artifacts integration**: Generated content can be previewed live and saved back to project knowledge.

### Comparison to ChatGPT Projects/Custom GPTs
- Claude Projects are more focused on **persistent knowledge bases** than ChatGPT's approach.
- Claude's RAG mode is **automatic** vs. requiring explicit configuration.
- Claude's custom instructions are **per-project** (ChatGPT has both global and per-GPT instructions).
- Claude's memory is **project-scoped** with separate summaries per project.

---

## 10. Evolution Timeline

| Date | Milestone |
|------|-----------|
| June 2024 | Projects launched for Pro and Team plans |
| Late 2024 | RAG mode added for paid plans |
| Late 2025 | Projects made available to free users (limited to 5) |
| October 2025 | Chat Memory launched for paid plans |
| January 2026 | Claude Cowork introduced (desktop agentic workflows) |
| March 2026 | Chat Memory extended to free plans; memory import from competitors |
| March 2026 | Projects feature added to Claude Cowork Desktop (local folder integration) |

---

## Sources

- [Claude Help Center — How can I create and manage projects?](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- [Claude Help Center — What are projects?](https://support.claude.com/en/articles/9517075-what-are-projects)
- [Claude Help Center — RAG for projects](https://support.claude.com/en/articles/11473015-retrieval-augmented-generation-rag-for-projects)
- [Claude Help Center — Manage project visibility and sharing](https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing)
- [Claude Help Center — Use Claude's chat search and memory](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context)
- [Claude Help Center — Disable public projects for your organization](https://support.claude.com/en/articles/9927533-disable-public-projects-for-your-organization)
- [Anthropic News — Collaborate with Claude on Projects](https://www.anthropic.com/news/projects)
- [Claude Projects Complete Guide (Medium)](https://medium.com/@melissaonwuka/claude-projects-complete-guide-setup-tutorial-2025-3b9a60033b59)
- [Claude Projects: My Experience After Months of Daily Use (Fresh van Root)](https://freshvanroot.com/blog/how-to-use-claude-projects/)
- [Institute of AI Studies — Claude Projects Guide](https://www.instituteofaistudies.com/insights/how-to-use-claudes-projects)
- [Claude Projects & Artifacts 101 (Substack)](https://sidsaladi.substack.com/p/claude-projects-and-artifacts-101)
- [Tom's Guide — Claude Projects and Artifacts now free](https://www.tomsguide.com/ai/claude-just-made-two-of-its-best-features-free-heres-how-to-use-projects-and-artifacts)
- [UC Today — Anthropic Projects](https://www.uctoday.com/unified-communications/anthropic-projects-using-claude-ai-for-project-management/)
- [Elephas — What is Claude Projects](https://elephas.app/blog/claude-projects)
- [Simon Willison — Claude Projects](https://simonwillison.net/2024/Jun/25/claude-projects/)
- [VentureBeat — Anthropic's Projects and sharing features](https://venturebeat.com/ai/anthropic-ai-assistant-claude-just-got-a-massive-upgrade-heres-what-you-need-to-know/)
- [9to5Mac — Free Claude users can now use memory](https://9to5mac.com/2026/03/02/free-claude-users-can-now-use-memory-and-import-context-from-rivals/)
- [Claude Memory Guide 2026 (ShareUHack)](https://www.shareuhack.com/en/posts/claude-memory-feature-guide-2026)
- [Syracuse University — Claude Project Step-by-Step Guide](https://its.syr.edu/how-to-use-claude-to-create-and-manage-a-project-step-by-step-guide-for-new-users/)
