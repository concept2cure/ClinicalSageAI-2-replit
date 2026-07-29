# eCTD Co-Authoring — UI kit

A faithful recreation of the **System-Aware Artifact Architecture** spec: Claude-faithful visual language re-purposed as a regulatory document workbench.

## Layout

Three zones on a single surface — no modals, no tab jumps:

1. **eCTD tree** (left, 240px, collapsible) — Module 1–5 with live status dots (`draft`, `review`, `approved`, `blocked`, `todo`) and readiness footer.
2. **Intelligence layer** (center, 35% of remaining width) — chat thread with AnA, tool-use breadcrumbs, artifact chips, and a streaming composer.
3. **Artifact workspace** (right, 65%) — the document as it will submit. Serif (Tiempos / Copernicus), paper-white background, masthead with application metadata, inline regulation citations, and hover-revealed **provenance indicators** on every paragraph.

**Focus mode** (top-bar toggle) collapses the tree + intelligence panes so the author sees only the artifact — matches the "65/35 asymmetric, drawer-collapsible" spec.

## What's wired

- Live status dots on every leaf node.
- Hover any artifact paragraph → provenance tooltip (source file, model, confidence, 21 CFR Part 11 audit ID).
- Staggered fade-in on first render simulates token streaming.
- Animated caret on the last paragraph communicates "still drafting".
- Three artifact tabs: **Document** · **eCTD XML** · **Changes**.

## What's intentionally static

- Composer doesn't post to an LLM (prototype).
- Tree nodes open/close but don't route to different artifact views (single-section demo).
- XML and Changes tabs are inert.

## Files

| File | Purpose |
|---|---|
| `index.html` | Mount point + script order |
| `styles.css` | 3-pane grid, tree, composer, artifact, provenance popover |
| `Icons.jsx` | Lucide-style stroke icons (stroke 1.75) |
| `Tree.jsx` | eCTD Module 1–5 tree with status dots |
| `ArtifactDoc.jsx` | Section 2.5 content with `data-prov` hover provenance |
| `App.jsx` | Shell, top bar, intelligence pane, artifact pane |
