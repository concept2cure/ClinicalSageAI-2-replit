# Claude Parity Audit: Top 20 Improvements for AnA

**Date:** 2026-03-27
**Current Parity:** 70% aligned with Claude.ai
**Domain-Specific Features:** 10/10 (exceeds Claude with intent lenses, verdict signals)

---

## Tier 1: Critical (3 items)

1. **Stop Generating button** — Users can't abort mid-generation. Need AbortController + visible Stop button.
2. **Regenerate/Retry button** — Users can't retry bad responses. Need hover action on assistant messages.
3. **Edit previous messages** — Users can't refine earlier questions. Need edit mode + conversation rebuild.

## Tier 2: High (7 items)

4. **Streaming text animation** — Messages appear all at once, not word-by-word.
5. **Code block copy buttons** — Individual copy per code block, not just whole message.
6. **Syntax highlighting** — Code blocks need highlight.js/prism.js integration.
7. **File attachment in input** — Paperclip button for uploading documents to conversation.
8. **Extended thinking toggle** — Let users enable extended thinking from the input bar.
9. **Conversation branching** — Component exists but unused. Wire fork indicator to messages.
10. **Token usage display** — Show input/output token counts per message.

## Tier 3: Medium (5 items)

11. **Prompt caching indicator** — Show when cache is used.
12. **Share conversation** — Export URL or markdown.
13. **LaTeX/Math rendering** — KaTeX for scientific notation.
14. **Table styling** — Better borders, padding, alternating rows.
15. **Prominent New Chat** — Clearer "New conversation" button.

## Tier 4: Polish (5 items)

16. **Feedback text input** — Optional comment after thumbs up/down.
17. **Image lightbox** — Click to zoom generated images.
18. **Health pill** — ConversationHealthPill component exists but unused.
19. **Thinking time animation** — Animated progress during long thinks.
20. **Download dropdown** — Format options (PDF, DOCX, etc.) on Download button.

---

## What's Already Strong

- ToolExecutionBlock matches Claude's collapsible tool steps ✓
- ThinkingBlock matches Claude's "Show more" pattern ✓
- DoneIndicator matches Claude's "⊙ Done" ✓
- Intent Lens system EXCEEDS Claude (6 regulatory-specific lenses)
- Verdict Signals EXCEEDS Claude (confidence/priority badges)
- Multi-provider support (Claude, GPT-4o, Moonshot Kimi) ✓
- Markdown rendering with DOMPurify ✓
- Suggested actions match Claude's chips ✓

## Implementation Priority

Stop + Regenerate + Edit = jumps parity from 70% to 80%+
Adding code copy + syntax + file attach = jumps to 85%+
Everything else is polish.
