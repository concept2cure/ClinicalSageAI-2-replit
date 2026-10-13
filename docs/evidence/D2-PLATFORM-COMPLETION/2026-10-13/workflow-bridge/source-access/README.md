# Selected sources and uploads

Baseline reproduction used an isolated filesystem archive of published
`e198f24a5758accf206fb2bf5f784fb5636b328c`, with the new SQL access helper and
test fixtures but the original canonical upload reader. It used the actual
private project/source/upload records and the same test content. Three cases
failed because metadata or bytes were supplied despite current private-project
or suspended-member denial; nine access-helper cases passed. This was not a
second branch or worktree, and production files were not reverted for the proof.

The repaired canonical reader passes the interactive actor through current
project and recorded-source checks before metadata or filesystem reads. AnA
tools supply the same actor; source selection is checked before its scope can
be discarded by source-to-upload resolution. Conversation-only files belong to
their uploader. Spreadsheet creation also rechecks source and destination access
inside its existing write transaction.

SQL fixtures use PGlite with the real disposition migration and sharing policy;
the filesystem seam returns fixed test bytes. This is not native RLS, immutable
file-storage qualification or production credentials evidence.

The focused access/tool suite passed 19 tests. The preceding six-file upload/
spreadsheet regression run passed 86 tests before the five registered-tool
cases were added; these overlapping counts are not summed. New image association
compatibility work requires its own subsequent verification.
