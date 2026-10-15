# PF-10 S6a, first part (D2): AnA's intelligence prefix loads the open project, never the one a UUID's digits spell

`getIntelligencePrefix` (`server/services/lumen-context/intelligence-prefix.ts`) puts client and project intelligence, and learned wisdom, in front of AnA's system prompt. It is called by:
- the AnA stream;
- the chat send route;
- the context builder;
- the multi-agent council;
- the OpenAI orchestrator.

## The defect

It parsed the project with `parseInt(String(projectId), 10)`. A v2 project is a `regulatory_programs` UUID, and the parse went wrong in three ways:

- **`parseInt('7abb1c22-…')` is 7.** AnA was handed project 7's intelligence and wisdom, from the same organization, as if they were this project's. The reads are org-scoped, so nothing crosses tenants, but one project's context entered another project's conversation.
- **A UUID beginning with a letter loaded none.**
- **Malformed ids loaded a project.** `'7abc'` and `'12.5'` loaded projects 7 and 12.

The cache was keyed by the parsed integer, so a program and the integer its digits spell shared an entry.

## The change

- **An integer goes through `parseIntegerProjectId`**, the canonical fail-closed parse.
- **A program UUID goes through `resolveProgramProjectAnchor`**, the one anchor reader (PF-08). That gives the program's own integer project, or none.
- **Anything else loads no project context.** A lookup that fails loads none too: this context is advisory, and a wrong project's is worse than no project's.
- **The cache is keyed by the project as given** (trimmed, lower-cased), so `invalidateIntelligencePrefix(org, uuid)` clears that program's entry.

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | Against HEAD's parse, 4 failures. `'7abb…'` loads project 7 without consulting the anchor. `'7abc'`, `'12.5'` and similar load projects. A program and the integer 7 share a cache entry. |
| `02-green.txt` | Every suite that touches the prefix or `lumen-context-builder`, and the new test, all passing. `tsc` and the lint ratchet pass. |

## Not in this slice

The rest of S6a: `stream.ts` passes one resolved `{programId, projectId}` to every downstream reader, covering post-processing's coercions, the working-memory project and the guidance executor.
