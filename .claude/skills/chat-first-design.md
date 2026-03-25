# Skill: Chat-First Design — No New Screens

## Description

ALL new features MUST be accessible through the AnA chat interface. No new screens, no new panels, no new modals, no new pages. The chat IS the interface.

## Activation

This skill activates when:
- Adding any new user-facing feature or capability
- Wiring a backend service to the frontend
- Designing how users interact with intelligence, analytics, or tools
- Creating suggested actions, commands, or workflows

## Core Principle (NON-NEGOTIABLE)

**The chat is the product.** Every capability — predictions, comparisons, exports, analysis, navigation — is accessed by talking to AnA or selecting inline options within the conversation. Think Claude, not Salesforce.

## Rules

### 1. No New UI Surfaces
- **FORBIDDEN**: New pages, new tabs, new modals, new sidebars, new panels for features
- **ALLOWED**: Inline content within chat messages (tables, cards, buttons, links)
- **ALLOWED**: Quick-select options in the input bar (like intent lenses, mode selectors)
- **ALLOWED**: Action buttons that appear on hover over messages (copy, save, insert)
- **ALLOWED**: Suggested action chips in the empty state

### 2. Features as Chat Commands
Every new capability should be invocable by:
1. **Typing naturally** — "What's our submission risk?" triggers Foresight
2. **Suggested actions** — Context-aware chips that appear based on workflow stage
3. **Inline results** — Response renders as rich markdown (tables, lists, structured data) directly in the conversation

### 3. Rich Responses, Not Rich UI
Instead of building a "Precedent Comparison Dashboard", render the comparison as a structured message in chat:
- Tables for data comparisons
- Markdown for structured analysis
- Inline action buttons within the response (e.g., "Save as artifact", "Apply to dossier")
- Links that surface as clickable pills

### 4. Minimum Chrome, Maximum Content
- Every pixel of UI should earn its place
- If a feature requires more than 0 new components to use, reconsider the approach
- The input bar + conversation area + suggested actions = the entire product surface
- Settings, mode selectors, and context indicators live in the input bar, not in new UI

### 5. Intelligence Should Feel Ambient
- Foresight predictions appear when relevant, not in a separate dashboard
- Precedent comparisons surface when the user asks, inline in the conversation
- RIM signals are woven into AnA's responses, not displayed in a separate panel
- Memory context is invisible — AnA just "knows" without the user managing it

## Anti-Patterns

| Anti-Pattern | What to Do Instead |
|---|---|
| "Let's build a Foresight dashboard" | AnA answers "What's our risk?" with Foresight data inline |
| "We need a precedent comparison modal" | AnA renders a comparison table in the chat |
| "Add a memory browser panel" | AnA references memory naturally in responses |
| "Create an export dialog" | Action button on messages: "Export as DOCX" |
| "Build a file upload page" | Paperclip button in the input bar |
| "Add a settings page for AnA" | Mode/lens selectors in the input bar |

## Reference

This rule is inspired by how Claude Code works: everything happens in one conversation. The user types, the AI acts. No dashboards, no navigation, no context switching.
