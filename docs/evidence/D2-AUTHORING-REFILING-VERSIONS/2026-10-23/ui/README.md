# Existing Authoring filing dialog version receipts

W1 / D2. These focused client fixtures qualify the existing dialog contract;
they do not establish live-app human acceptance or backend lineage integrity.
The root workstream owns merged qualification and publication.

## What already exists

- `client/src/concept2cure/v2/editor/FileToVaultDialog.tsx` already validates a
  scoped admission receipt, preserves uncertain writes and opens its exact
  Vault UUID. This change adds optional server-confirmed version lineage to
  that receipt and describes the existing version/placement behavior.
- `DocumentWorkbench.tsx` and `DocumentCanvas.tsx` already share this dialog;
  their access/session/project boundaries remain unchanged.
- `useVaultUpload.ts` and `surfaces/Vault.tsx` already reach canonical explicit
  UUID check-in. No second version selector, writer or UI surface is added.
- The two existing focused test files already cover filing, refusal, approval,
  navigation and request ownership. Their extended cases cover the version
  metadata pair and preserve older receipt compatibility without invented facts.

The design records source/history discovery and the backend's scoped family
policy. The client trusts no inferred predecessor or locally assigned number.

## Retained qualification

- `red.*`: before production changes, 79 tests ran; 20 new assertions failed
  and 59 passed. Failures exercised absent version rendering/guidance and
  acceptance of malformed metadata.
- `green.*`, `green-final.*`, `green-release.*` and `green-publication.*`:
  intermediate successful epochs, superseded
  by the release qualification below. Do not add their counts together.
- `red-refinement.*`: after adding exact canonical range and initial/linked
  pair semantics, 83 tests ran; the three new rejection cases failed and 80
  passed against the preceding implementation.
- `green-wrap.*`: final source qualification, **83 passed, 0 failed** in
  the two focused files. Metadata pins each source SHA-256 and the exact
  command, times and exit. Raw output is retained as gzip.
- `eslint-wrap.*`: final three owned files, **0 errors, 0 warnings**.
  Earlier lint outputs show the initial warnings and their cleanup.
- `diff-check.txt`: owned-file whitespace check passed.
- `dom-capture.*`: one temporary capture case serialized the actual mounted
  form and successful linked receipt. The temporary fixture was removed.
  This is DOM capture, not a browser interaction or human acceptance test.
  Root may render the captured HTML with the built product styles separately.

The existing receipt span now has `minWidth: 0` and `overflowWrap: anywhere`.
The sibling browser evidence retains the actual narrow-screen clipping before
that change and the eight corrected layouts. No style-mirroring unit assertion
was added; the browser geometry exercises the visible defect.

The final parser accepts missing version metadata for older responses. When
either field is supplied, both must be supplied: assigned majors range from
`1.0` through `999999.0`; `1.0` has a null predecessor; later majors require a
canonical predecessor UUID different from the admitted UUID. A malformed
successful response remains unconfirmed and cannot be replayed through
ordinary close/reopen.
