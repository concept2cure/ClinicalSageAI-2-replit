# P-72 slice 1b: work in progress, preserved (not product)

This folder holds the unfinished working-tree edits of the slice-1b lane, as a patch. They are kept here because a container restart at about 19:30 UTC on 2026-10-30 stopped the lane's agent. This is the third stop that day; the earlier two were account rate limits. The tree survived the restart, but its only copy was the container's disk.

**These edits are unverified and incomplete. They are not product and are not applied to the tree.** The lane is to finish them, prove them red, then green, then by mutation, and land them as their own commit. The finished commit deletes this folder, as `ae12195a5` did for slice 1a's patch.

- **Brief:** the lane C brief in the lead's workflow. It covers the Vault retention sweep per organization in its own scope, the audit-chain sweep per organization, verifiers that report "unverified" rather than "valid" over zero rows, and the four other writers of `app.current_user_role` refusing `app_super_admin`. See `docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md` ("Slice 1a, landed 2026-10-30").
- **Base:** `d79abdf9f`.
- **Files:** `files.txt`, 29 paths.
- **Patch:** `p72-slice-1b.part00.patch.txt` and `part01`, split at 90 kB to stay under the repository's size ceiling. Concatenated, their SHA-256 is `a8d245ff8dae35644aa951931620a03ad04a3f5a9d85eedd361339726ec1ebf1`.

To restore onto a tree at or after the base: `cat p72-slice-1b.part*.patch.txt | git apply --3way`.
