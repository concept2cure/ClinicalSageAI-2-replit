# Independent client review

Read-only server-worker review of the frozen client implementation, its two
existing hosts, focused tests, and existing mutation/session/project helpers.
Reviewed bytes are pinned in `independent-client-review.sha256`. No client
source was edited and no client tests were rerun by this reviewer.

No remaining blocking finding in the bounded filing-continuity scope.

- The same dialog validates the returned Vault UUID, captured project UUID,
  SHA-256 and requested format. False success, non-null error alongside data,
  unreadable/bodyless/mismatched results cannot trigger success or navigation.
  Older `{ data }` and `error: null` remain compatible. Missing approval remains
  unknown rather than becoming an approval assertion.
- Existing `mutateVerbatim`, `mutationUnconfirmed`, auth revision and shell
  project-visit guards supply the request boundary. Unknown outcomes and the
  named reused-version refusal retain reconciliation state through ordinary
  close/reopen. A synchronous pending ref closes duplicate-activation gaps.
- Document/project/account/organization changes retire callbacks and navigation.
  The additional current check after `onFiled` suppresses a toast when that
  callback changes context. The genuine bearer-refresh positive preserves the
  intended same-account behavior. Both current hosts retain the mounted dialog.
- The existing form, classes, actions and dialog structure are preserved. The
  file-local form extraction adds no second editor or placement surface.
- The composed test mounts the actual dialog and Vault, consumes the returned
  UUID through Open in Vault and submits that same UUID as a `vault_documents`
  leaf using the existing placement control. Its explicit HTTP seams establish
  reachability and identity; the server PGlite suite separately verifies filing,
  approval and leaf behavior. The composition does not establish historical
  re-filing lineage, agency delivery or human visual acceptance.

The client packet reports the final 126-pass / seven-suite run, strict-zero lint
for the dialog/tests, and 15 inherited warnings in the two large existing hosts.
Root owns the combined run and canonical warning comparison.
