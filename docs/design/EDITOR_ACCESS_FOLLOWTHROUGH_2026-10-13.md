# Editor access and current AnA context

Continuation of W1 / D2 on `concept2cure-v2`, from `1c7d319a`. The existing
DocumentAuthoring / ConversationThread → DocumentCanvas → DocumentWorkbench
→ RichSectionEditor paths remain authoritative. The current one AnA / one
canvas decision and design-system tokens govern this pass.

## Vault search

The project-files rail currently requests only the first 25 Vault matches.
The existing project-scoped server search already supports `limit`, `offset`
and a real `total`. Reuse that endpoint and the existing quiet paging action:
load subsequent matches without changing source identity or editor behavior.

- Keep search results associated with the current project and query. Hide the
  earlier query's rows while the new one is pending; ignore stale completions.
- Append successful pages. Retain already loaded rows if a later read fails,
  explain the incomplete read and retry the same offset. Hold double clicks.
- Preserve recorded availability on every row and working-copy request. When
  a newer search hit is also in the older browse tree, its current availability
  takes precedence; retained checksum/citation identity is not fabricated.
- Do not infer a complete search from a missing or inconsistent response.
  Keep source import, exact returned document navigation, provenance and the
  host's unsaved-work decision on their existing paths.

## AnA context

- A bridge supplies authoring context or receives AnA insertion/remedies only
  when its saved context identifies the exact bridge document/section and
  current project. A mismatch gives the existing visible disabled refusal and
  cannot call a mutation.
- At explicit send, a visible matching canvas supplies its current saved
  section and version ahead of the earlier authoring prefill snapshot. When
  hidden, a retained bridge may refresh only the same attached document and
  section's saved version. Otherwise the verified snapshot remains the fallback
  for a phone request. Intentional source removal remains respected.
- A project switch collapses the old-project canvas without automatically
  saving or discarding its mounted buffer. Incompatible source context is
  unverified and uses the existing retry/remove recovery.

## Repeated Word headings

The native DOCX converter can produce repeated CTD section codes. The canonical
document store requires unique section codes, so a valid source with a repeated
heading currently rolls back with a generic import failure. Reserve all parsed
codes first, keep the first occurrence and give later occurrences deterministic
`import.<source-position>` identifiers, skipping reserved/used codes without
case ambiguity. Retain every original title, body and source position. Record
the original and replacement identifiers in a visible conversion warning and
the existing import provenance. A working identifier does not imply a filing
placement. Do not combine or drop source passages.

Intake must also recheck that the exact selected Vault version is still the
current family head, using the same canonical version predicate as the UI and
search. Recheck after acquiring the original-row lock in the creation
transaction. If a check-in has superseded it, refuse with the existing source
changed outcome and current-version guidance; never silently substitute a
different source id or return an earlier working copy as current.

The SQL scanner first refused this additional fragment (four → five sites in
authoring-source-import.ts). Its reviewed allowance is only the existing
`supersededSql('d')` implementation with the fixed code alias `d`; no request
text supplies an identifier or expression. The selected source id, project id
and tenant id remain `$1`, `$2`, `$3` bound parameters. The baseline changes
only this file by one site and the commit records this reason.

## Ownership and evidence

Control tower owns ProjectFilesPanel, extracted search state, related tests
and shared CSS if needed. The AnA session owns ConversationThread, authoring
origin helpers and context regressions. The source session owns only the native
source converter, deterministic code allocation helper and import regressions.
No new editor, conversation, model provider, migration or
production dependency is introduced.

First reproduce the failing cases, then verify the repaired exact-id source
handoff, current-context and mutation refusal behavior. Evidence belongs in
`docs/evidence/D2-EDITOR-INTEGRATION/2026-10-13/access-followthrough/`.
