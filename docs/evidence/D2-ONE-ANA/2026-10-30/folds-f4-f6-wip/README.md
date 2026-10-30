# Folds F4 and F6: work in progress, preserved (not product)

This folder holds the unfinished working-tree edits of the device-folds lane, as a patch. They are kept here because a container restart at about 19:30 UTC on 2026-10-30 stopped the lane's agent. This is the third stop that day; the earlier two were account rate limits. The tree survived the restart, but its only copy was the container's disk.

**These edits are unverified and incomplete. They are not product and are not applied to the tree.** The lane is to finish and prove them, and land each fold as its own commit. The finished commits delete this folder.

The two folds:

- **F4 moves device analytics into Reporting & analytics.** Its own evidence README is inside the patch: `docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/`.
- **F6 moves the device workstream into Projects and Project home.** This includes the Client Review Room.

Both are planned in `docs/design/DEVICE_FOLDS_2026-10-29.md` and decided in P-61.

- **Base:** `d79abdf9f`.
- **Files:** `files.txt`, 79 paths. Some are shared with Codex's concurrent work (registries, navigation, surface hosts, `FUNCTION_PARITY.md`); re-read their history before applying.
- **Patch:** `folds-f4-f6.part00.patch.txt` to `part04`, split at 90 kB to stay under the repository's size ceiling. Concatenated, their SHA-256 is `f68198cc8f1637dd4d64a31c3bcb77ba5179998fbb601e805fc33d5c32807304`.

To restore onto a tree at or after the base: `cat folds-f4-f6.part*.patch.txt | git apply --3way`.
