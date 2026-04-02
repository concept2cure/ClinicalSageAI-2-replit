# Click-Through Audit: Segment 9 — AnA Chat Interface & Slash Commands

## 1. Chat Panel

- **File**: `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx:745`
- **Rendering**: Persistent right-side panel within the workspace shell
- **Input area**: Text input with submit button, mode selector (Standard, Deep Research, Nano Banana)
- **Verdict**: **PASS** — Persistent, always-accessible chat panel

---

## 2. Sending a Message (Standard Mode)

- **Handler**: `handleSend` (`AnaPersistentPanel.tsx:1409`)
- **Flow**:
  1. User types message + hits Enter
  2. Message added to in-memory array (capped at 200 messages, line 1426)
  3. Constructs `anaRiPayload` with:
     - `message` (user text)
     - `intent_lens` (auto or user-selected focus)
     - `user_role` from context profile
     - `project_context` (product name, submission type)
     - `context` (screen, project, projectId, productType, userRole)
     - `conversation_history` (last 10 messages)
     - `authoring_context` (section/artifact context serialized)
  4. Calls `POST /api/ana-ri/chat` (line ~1660) — AnA RI orchestrated endpoint
  5. Falls back to `POST /api/cortex/chat` if AnA RI fails
  6. Response displayed as assistant message

- **Streaming**: SSE-based for Deep Research mode (`EventSource` at line 1464); standard mode uses request/response
- **Server streaming**: `POST /api/chat/stream` (chat.ts:1284) — SSE with `Content-Type: text/event-stream`
- **Verdict**: **PASS** — Real orchestrated AI chat with context-aware routing

### Issue: 6 Raw `fetch()` Calls
- `AnaPersistentPanel.tsx` uses raw `fetch()` in 6 places instead of `apiRequest()`
- Has its own token refresh mechanism — bypasses centralized auth
- **Verdict**: **CONDITIONAL PASS** — Functional but violates code standards, security concern

---

## 3. Chat History

- **In-memory**: Messages stored in React state, capped at 200
- **No DB persistence for chat messages visible in this component** — messages lost on page refresh
- **Server**: `chat.ts` has thread-based history endpoints, but the AnA panel manages its own state
- **Verdict**: **CONDITIONAL PASS** — Works during session but messages are volatile

---

## 4. Slash Commands (43 commands)

- **File**: `AnaPersistentPanel.tsx:521-581`
- **Autocomplete**: When user types `/`, a command palette dropdown appears
- **8 Categories**:

| Category | Commands |
|----------|----------|
| Intelligence (7) | /assess, /readiness, /risk, /recommend, /next, /signals, /status |
| Analysis (8) | /twin, /consistency, /claims, /deficiencies, /simulate, /precedent, /iss, /ise, /ib |
| Biostatistics (5) | /sap, /power, /dose, /defensibility, /design |
| Subspecialties (7) | /safety, /cmc, /csr, /device, /ectd, /smpc, /rmp, /uspi |
| Authoring (10) | /draft, /audit, /amend, /review, /scan, /memo, /brief, /strategy, /narrative, /report, /haq |
| Lifecycle (5) | /checklist, /freeze, /sign, /submit, /preflight |
| Navigation (5) | /workflow, /knowledge, /decisions, /help, /export |

- **Category colors**: Violet (Intelligence), Blue (Analysis), Emerald (Biostat), Amber (Subspecialties), Rose (Authoring), Teal (Lifecycle), Stone (Navigation)
- **Verdict**: **PASS** — Comprehensive slash command system with categorized autocomplete

---

## 5. Domain Prompt Buttons

- **File**: `client/src/concept2cure/config/domain-prompts.ts`
- **Purpose**: "Browse all capabilities" button shows organized prompt groups
- **Groups defined**:
  - Project Status (6 prompts)
  - Risk & Foresight (8 prompts)
  - Recommendations
  - And more per domain area
- **Each prompt**: Has id, label, optional description, optional intent key
- **On click**: Prompt text sent to AnA chat as if user typed it
- **Verdict**: **PASS** — Well-organized capability browser

---

## 6. Rich Response Rendering

- **Response format**: AI responses rendered as markdown with:
  - Tables, lists, code blocks
  - Structured data sections
  - Action buttons on hover (save, insert, export, regenerate)
- **"Open in Editor"**: Creates a new document with the AI response content
- **Deep Research**: Shows real-time progress percentage, source counts, synthesis
- **Verdict**: **PASS** — Rich rendering with actionable responses

---

## 7. Context Awareness

- **Project context**: `contextProfile` includes projectId, activeProject, productType, userRole, screenName
- **Authoring context**: `authoringContext` serialized for section/artifact awareness
- **Intent lens**: User can focus AnA on specific areas (auto, regulatory, clinical, etc.)
- **Verdict**: **PASS** — AnA knows which project, document, and section the user is working on

---

## 8. Server Chat Routes

- **File**: `server/routes/chat.ts` (39KB)
- **Key endpoints**:
  - `POST /api/chat/stream` (line 1284) — SSE streaming chat
  - AnA RI orchestrated routes in `server/routes/ana-ri.ts`
  - Cortex fallback in `server/services/cortex/`
- **AI Gateway**: Routes through `server/services/ai-gateway/gateway.ts` — Claude primary, OpenAI fallback
- **Model**: Claude (Anthropic) as primary, with AI gateway managing provider routing
- **Verdict**: **PASS** — Full AI orchestration with provider failover

---

## 9. Chat Modes

- **Standard**: AnA RI orchestrated chat with regulatory intelligence
- **Deep Research**: Launches background job → SSE progress → synthesis (ClinicalTrials.gov, PubMed, FDA, EMA)
- **Nano Banana**: Visual AI mode (Gemini image generation) with PPTX auto-download
- **Verdict**: **PASS** — Three distinct modes with different capabilities

---

## Summary

| Feature | Verdict | Issue |
|---------|---------|-------|
| Chat Panel | **PASS** | Persistent, always accessible |
| Message Sending | **PASS** | Context-aware, orchestrated |
| Raw fetch() usage | **CONDITIONAL** | 6 instances bypass apiRequest(), own token refresh |
| Chat History | **CONDITIONAL** | In-memory only, lost on refresh |
| Slash Commands (43) | **PASS** | Comprehensive, categorized autocomplete |
| Domain Prompts | **PASS** | Organized capability browser |
| Rich Responses | **PASS** | Markdown + actions + deep research |
| Context Awareness | **PASS** | Project, document, section context |
| Server Routes | **PASS** | SSE streaming, AI gateway |
| Chat Modes (3) | **PASS** | Standard, Deep Research, Nano Banana |

**Issues**:
1. 6 raw `fetch()` calls with own token management — security/maintenance risk
2. Chat messages not persisted to DB — lost on page refresh
