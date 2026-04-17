# Designer Skills — Attribution & Adaptation Notes

The following 8 skill directories in `.claude/skills/` are vendored from an external
repository and adapted for Concept2Cure:

- `brief-to-tasks/`
- `design-brief/`
- `design-flow/`
- `design-review/`
- `design-tokens/` *(adapted — see C2C override at top of SKILL.md)*
- `frontend-design/` *(adapted — see C2C override at top of SKILL.md)*
- `grill-me/`
- `information-architecture/`

## Upstream

- Repo: <https://github.com/julianoczkowski/designer-skills>
- Author: Julian Oczkowski (`julianoczkowski`)
- Install command (upstream): `npx skills add julianoczkowski/designer-skills`
- Article: [7 Claude Code Design Skills That Follow a Real Design Process](https://medium.com/@julian.oczkowski/7-claude-code-design-skills-that-follow-a-real-design-process-b871b8673d05)
- Concept origin: Design-tree concept adapted from Frederick P. Brooks Jr., *The Design of Design*

## License status — ACTION REQUIRED

As of adoption date (2026-04-17), the upstream repo contained **no LICENSE file**.
This makes redistribution (including vendoring these files into `.claude/skills/`)
legally ambiguous — under default copyright, all rights are reserved to the author.

A licensing clarification issue has been filed upstream. Until Julian adds an
explicit license (e.g., MIT, Apache-2.0), treat these skills as "use at your own
legal risk." Do not publish them outside the private Concept2Cure repo until
licensing is confirmed.

If the upstream never clarifies, the safest long-term path is to replace these
vendored copies with Concept2Cure-authored versions inspired by the same design
process, and delete the vendored files.

## C2C Adaptations

### `frontend-design/SKILL.md`

The upstream version offers 8 named aesthetic philosophies (Rams, Swiss,
Japanese Minimalism, Brutalist, Scandinavian, Art Deco, Neo-Memphis, Editorial)
and lets the user pick one. **This is locked in C2C.** We use the Anthropic
Claude philosophy (calm, intelligent, restrained) exclusively, enforced by the
12 principles in `.claude/skills/claude-ui-design-principles.md` and the
governed component registry (`client/src/component-registry.ts`).

The C2C override block at the top of the SKILL.md redirects the reader to the
locked philosophy and registry before any upstream content is applied.

### `design-tokens/SKILL.md`

The upstream version generates a fresh token system from scratch based on a
chosen aesthetic. **This is disabled in C2C.** We have a complete, locked
token system (Tailwind config + `client/src/index.css` + stone palette). The
skill is allowed only in "audit" or "surgical extension with approval" modes.

The C2C override block at the top of the SKILL.md enforces this.

## Unchanged Skills

The other 6 skills (`grill-me`, `design-brief`, `information-architecture`,
`brief-to-tasks`, `design-review`, `design-flow`) are process-oriented and do
not conflict with existing C2C rules. They are used as-is.

When these skills reference picking an aesthetic or generating tokens, defer to
the adapted versions of `frontend-design` and `design-tokens` — never let a
process skill bypass the locked philosophy.
