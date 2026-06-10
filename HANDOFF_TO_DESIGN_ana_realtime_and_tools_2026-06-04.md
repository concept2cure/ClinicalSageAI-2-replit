# Handoff to Claude Design — ANA backend → UI surfaces

Date: 2026-06-04 · Branch: `concept2cure-v2` · Scope: backend only (UI is design-owned)

This documents the backend landed this session and the UI surfaces it needs. Every
contract below is live on `concept2cure-v2` — endpoints, socket events, and tool
output shapes are final and stable to build against. No further backend work is
required for any surface listed here.

The design non-negotiables still govern every new surface: sentence case, no emoji,
13px body, one Claude-orange focal point, 200ms ease-out, Lucide icons, second person,
numbers over adjectives.

---

## What the backend now does

- **ANA commands the whole platform.** 107 typed tools plus a command bridge that
  reaches all 76 governed platform commands (project / artifact / task / dossier
  lifecycle, Module 3 / CMC, eCTD assembly + transmit, PDEV→IND, audit). Every tool
  has a handler — nothing hollow.
- **All five CTD Module 2 summaries are deterministically ANA-draftable** — 2.3 QOS,
  2.4 nonclinical overview, 2.5 clinical overview, 2.6 nonclinical summaries, 2.7
  clinical summary — each composing from program data with completeness + gap scoring.
- **Nonclinical (M4) and clinical-pharmacology engines** — FIH dose, tox adversity,
  ICH M3 program gaps, integrated safety; exposure-response, C-QTc, DDI, PK.
- **Intelligent tool loading** — ANA is offered only the tools relevant to the turn's
  intent + context, with the command bridge always retained so nothing is ever out of
  reach. Users can pin specific tools.
- **Real-time duplex chat transport** — a persistent, interruptible WebSocket channel.
  Text only (no voice, per product direction).

---

## UI surface 1 — Real-time duplex chat (the headline new surface)

**Transport:** socket.io namespace **`/ana`** on the existing socket server (same host,
path `/socket.io/`). Authenticate in the handshake exactly like the collaboration
sockets:

```js
const socket = io('/ana', { auth: { token: '<JWT>' } });   // or query: { token }
```

The socket is JWT-authenticated and tenant-scoped server-side; the client never sends
org/user — they come from the token.

**Client → server**

| Event | Payload | Notes |
|---|---|---|
| `ana:message` | `{ turnId?, message, projectId?, history?, selectedTools?, context? }` | Starts a turn. `history`: `[{ role: 'user'\|'assistant', content }]`. `selectedTools`: pinned tool names. `context`: `{ projectType?, documentType?, surface?, hints? }`. |
| `ana:cancel` | *(none)* | Stop button — interrupts the in-flight turn. |

**Server → client**

| Event | Payload | UI meaning |
|---|---|---|
| `ana:thinking` | `{ turnId }` | Show the thinking indicator. |
| `ana:token` | `{ turnId, chunk }` | Append to the streaming bubble — live typing. |
| `ana:tool` | `{ turnId, tool }` | Show a tool-progress chip (e.g. "Drafting the Module 2.4 nonclinical overview"). |
| `ana:done` | `{ turnId, text }` | Finalize the message. |
| `ana:cancelled` | `{ reason }` | The turn was interrupted (`reason`: `user_cancel` \| `superseded`). |
| `ana:error` | `{ turnId?, error }` | Surface a calm error state. |

**Barge-in (the defining behavior):** sending a new `ana:message` while ANA is still
responding automatically interrupts the current turn (you'll get `ana:cancelled` with
`reason: 'superseded'`) and starts the new one. The user can also press a stop button
that emits `ana:cancel`. The UI must:
- render `ana:token` chunks incrementally,
- show a visible **stop** control while a turn is streaming,
- accept input at any time (don't lock the composer during streaming) — sending mid-
  stream is the barge-in.

**What this does NOT need:** no audio, no microphone, no waveform — text only.

---

## UI surface 2 — Tool picker (dropdown next to ANA's name)

**Endpoint:** `GET /api/ana-tool-policy/catalog` (bearer auth; any authenticated user).

```json
{
  "categories": [
    { "id": "platform", "label": "Platform control",
      "tools": [{ "name": "execute_platform_command", "description": "…" }, …] },
    { "id": "nonclinical", "label": "Nonclinical (M4)", "tools": [ … ] },
    …
  ],
  "deniedTools": ["search_drug_adverse_events"]
}
```

Categories arrive in display order: platform, nonclinical, clinical_pharmacology,
clinical, cmc_quality, device_ivd, qms, submission, biostatistics, evidence, authoring,
governance, other. `deniedTools` are governed off by the org's policy — render them
disabled/hidden, not selectable.

**Wiring the selection back:** whatever the user pins is sent as `selected_tools` —
in the socket path on `ana:message.selectedTools`, and in the HTTP chat path as
`selected_tools` in the POST body (the existing send-message route already accepts it).
Pinned tools are always loaded on top of the context-selected set. Pinning is additive
focus, not a hard restriction — the user can't break ANA by pinning a narrow set.

**UI:** a compact dropdown/menu anchored next to ANA's name; grouped by category;
multi-select with a clear "auto (recommended)" default state (empty selection = ANA
chooses by intent). Persist the user's pins client-side per thread.

---

## UI surface 3 — Module 2 composer output (authoring/workbench)

The five deterministic composers are invoked by ANA as tools; their results stream into
chat via `ana:tool` / `ana:done`, and the same shape is what the authoring workbench
renders when ANA drafts a section. Every `draft_*` tool returns:

```json
{
  "status": "drafted",
  "sectionKey": "2.4",
  "title": "Nonclinical Overview",
  "content": "MODULE 2.4 — …",       // section narrative (plain text, heading-structured)
  "tables": [{ "title": "…", "headers": [...], "rows": [[...], ...] }],
  "completeness": 80,                  // 0–100
  "gaps": ["safety pharmacology (ICH S7A)"]
}
```

Tools: `draft_quality_overall_summary_m2_3`, `draft_nonclinical_overview_m2_4`,
`draft_clinical_overview_m2_5`, `draft_nonclinical_summaries_m2_6`,
`draft_clinical_summary_m2_7`.

**UI needs:** render the narrative + tables; show a **completeness meter** (single
Claude-orange focal point works well here) and a **gaps list** as honest, non-alarming
copy; offer a governed **promote-to-artifact** action (this flows through the existing
authoring/e-sign path — no new backend).

---

## UI surface 4 — Governed-mutation confirmation (reuse existing pattern)

When ANA invokes `execute_platform_command` for a **mutation**, the governed executor
requires `confirm: true` + a `reason`. If a result comes back asking for confirmation,
the UI should surface the existing **reason-for-change capture** (the 21 CFR Part 11
pattern already used by the e-sign / governed-action modal) and re-send the command
with `confirm: true` and the captured reason. Reads need no confirmation. This is the
same governance contract already in the platform — no new component beyond pointing the
confirm flow at this path.

---

## Out of scope (explicitly)

- **No voice / audio UI** — product direction is text-only duplex.
- **No WebRTC** — the WebSocket transport above is the chosen path.
- **No new tenant/policy admin UI** — admin policy management already exists at
  `/api/ana-tool-policy` (GET/PUT, admin-only); the catalog endpoint is the only
  user-facing addition.

---

## Quick reference — contracts

| Surface | Contract |
|---|---|
| Duplex chat | socket.io `/ana`; in: `ana:message`, `ana:cancel`; out: `ana:thinking`/`ana:token`/`ana:tool`/`ana:done`/`ana:cancelled`/`ana:error` |
| Tool picker | `GET /api/ana-tool-policy/catalog` → `{ categories, deniedTools }`; selection via `selected_tools[]` |
| Composer output | `draft_*` tool result → `{ content, tables[], completeness, gaps[] }` |
| Governed mutation | `execute_platform_command` → confirm + reason capture on the existing e-sign path |

All of the above is live and stable on `concept2cure-v2`. Ping back with any contract
question and I'll adjust the backend rather than have you work around it.
