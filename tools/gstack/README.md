# Pinned optional developer tooling

gstack is an upstream developer tool, not part of the application runtime.
It is pinned as a Git submodule at 20eb6202fa8ea83a882e7c0463b722cd8a31af1e
(version 1.91.68), preserving the revision installed in this Codespace.

The prior import tracked 3,390 upstream files in the application repository.
This conversion preserves the checkout and replaces those copies with the exact
upstream Git identity. It does not change application code or scan thresholds.

## Restore on a new checkout

Run from the application repository root:

    git submodule update --init .claude/skills/gstack
    python3 tools/gstack/apply-annotations.py

The annotation overlay preserves all 12 locally modified upstream files: synthetic credential
scan annotations from the previous import (35 added and 35 removed lines).
It is intentionally separate from the upstream pin. An initialized, patched
submodule shows modified content in git status; do not discard it or interpret
that expected overlay as uncommitted product code.

The restore script is idempotent and rejects unexpected content.
Only comment edits, offsets and hashes are stored, without upstream credential fixtures. Do not run upstream setup or
upgrade automatically. Product build and runtime do not require this submodule.
Upstream licenses and instructions remain in the pinned repository.
