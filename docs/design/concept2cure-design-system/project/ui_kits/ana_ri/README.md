# Concept2Cure.RI — UI Kit (Claude.ai-faithful)

This UI kit implements the **Concept2Cure.RI** product with UX that mirrors **Claude.ai** as closely as possible, re-skinned with C2C's regulatory-intelligence content model.

## What's replicated from Claude.ai

- **Warm cream canvas** (`#faf9f5`) with `#f0eee6` sidebar and white card elevation
- **Claude orange** (`#d97757`) as the only strong color — sparingly used
- **Chat-first empty state**: centered "Good {greeting}, {name}" + composer + suggestion row
- **Collapsible left sidebar**: logo → New chat → Chats (Recents) → bottom account chip
- **Composer**: rounded-xl, model switcher chip, attachment/tools icons, orange send circle
- **Message treatment**: assistant messages flush-left (no bubble, serif for long prose), user messages in a light-gray bubble on the right
- **Top bar**: model name centered, share / new actions on right
- **Sentence case, no emoji**, 13–15px body, 200ms ease-out motion

## Components

Each is a React component mounted via Babel in `index.html`. Components are cosmetic recreations — state is in-memory, enough to demo the click-through.

- `Sidebar.jsx` — thin (56px) / expanded (260px) rail with New chat, Chats, Projects, Artifacts
- `TopBar.jsx` — model switcher + share + new-chat
- `Composer.jsx` — the rounded textarea with model/tools chips and send button
- `EmptyState.jsx` — greeting + composer + suggestion pill row
- `ChatView.jsx` — message list (assistant serif / user bubble)
- `Message.jsx` — individual message with avatar + actions (copy, retry)
- `SuggestionRow.jsx` — the horizontal prompt chips below the composer
- `AccountChip.jsx` — bottom-of-sidebar user chip with plan badge
- `RecentsList.jsx` — chat history list with hover actions
- `ProjectCard.jsx` — Projects grid entry

## Screens demonstrated in index.html

1. **Empty home** — greeting + composer + starter pills
2. **Active chat** — user message, assistant response with code block, follow-up composer
3. **Projects** — grid of project cards
4. **Artifacts panel** — side-panel doc viewer (Claude Artifact pattern, adapted for CTD sections)

Toggle between them with the sidebar nav.

## Re-skin notes (what's C2C, not Claude)

- The **AnA assistant** uses a muted blue avatar (`#6a9bcc`) instead of Claude's orange avatar — C2C has a named agent separate from brand.
- **Starter prompts** are regulatory-intelligence oriented ("Draft Section 2.5", "510(k) precedent") instead of Claude's general ones.
- **Model switcher** surfaces "AnA 1.0 RI" / "AnA 1.0 RI Pro" instead of Claude models.
- **Agency logo strip** appears in place of Claude's empty footer.

Everything else — spacing, type, color, motion, density — is Claude.ai direct.
