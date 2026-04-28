#!/usr/bin/env bash
# scripts/sync-design-system.sh
#
# Pull the canonical design-system project (id 7f3ac932-8a8b-4582-8748-5d4c31e8d0ed)
# into v2's read-only mirror at design-system/.
#
# Architecture:
#   canonical (Anthropic Design project, externally-edited)
#       │
#       │  this script (transport)
#       ▼
#   design-system/   (mirror in v2; read-only for v2; Claude Code reads here)
#       │
#       │  imports + read-only references
#       ▼
#   client/src/main.tsx + client/src/concept2cure/components/{concept2cure-home,
#   ana, claude-ectd-coauthor, bundle-surface-frame}/   (the React mounts)
#
# Per CLAUDE.md, design-system/ is the only path Claude Code reads. The
# previous suggestion to use /projects/<id>/... cross-project paths was
# wrong and has been removed. This script is the authoritative way to
# refresh the mirror.
#
# Usage:
#   scripts/sync-design-system.sh             # sync into design-system/, print diff
#   scripts/sync-design-system.sh --check     # exit non-zero if mirror is stale
#   scripts/sync-design-system.sh --dry-run   # fetch + validate, do not write
#
# Environment overrides:
#   DESIGN_SYSTEM_SOURCE   git URL or local path of the canonical project.
#                          Required. No default — keeping the source explicit
#                          forces the operator to wire the canonical location
#                          rather than letting the script silently sync from
#                          whatever happens to be on disk.
#   DESIGN_SYSTEM_REF      git ref / branch / tag to sync (default: main).
#                          Ignored when DESIGN_SYSTEM_SOURCE is a local path.
#   DESIGN_SYSTEM_SUBDIR   subdirectory inside the source to mirror
#                          (default: . — the whole project).
#
# Required files in the source:
#   CLAUDE.md
#   HANDOFF.md
#   colors_and_type.css
#   ui_kits/<surface>/   (at least one)
#
# The script fails if any of those are missing — the mirror only ships
# when the canonical layout matches what v2 expects.

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Locate v2 root + mirror destination
# ─────────────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIRROR_DIR="${REPO_ROOT}/design-system"

# ─────────────────────────────────────────────────────────────────────────────
# Parse flags
# ─────────────────────────────────────────────────────────────────────────────
MODE="sync"
for arg in "$@"; do
  case "$arg" in
    --check)   MODE="check" ;;
    --dry-run) MODE="dry-run" ;;
    -h|--help)
      sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 2
      ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Resolve source
# ─────────────────────────────────────────────────────────────────────────────
SOURCE="${DESIGN_SYSTEM_SOURCE:-}"
SOURCE_REF="${DESIGN_SYSTEM_REF:-main}"
SOURCE_SUBDIR="${DESIGN_SYSTEM_SUBDIR:-.}"

if [[ -z "$SOURCE" ]]; then
  cat >&2 <<'EOF'
DESIGN_SYSTEM_SOURCE is not set.

Set it to either:
  - a git URL of the canonical design-system project, e.g.
      DESIGN_SYSTEM_SOURCE=git@github.com:concept2cure/design-system.git
      DESIGN_SYSTEM_REF=main
  - a local checkout path, e.g.
      DESIGN_SYSTEM_SOURCE=/Users/me/work/design-system

Then re-run.
EOF
  exit 2
fi

# ─────────────────────────────────────────────────────────────────────────────
# Stage the source in a temp dir so we never sync a partial fetch
# ─────────────────────────────────────────────────────────────────────────────
WORK_PARENT="$(mktemp -d -t design-system-sync.XXXXXX)"
WORK_DIR="$WORK_PARENT/stage"
mkdir -p "$WORK_DIR"
trap 'rm -rf "$WORK_PARENT"' EXIT

if [[ -d "$SOURCE" ]]; then
  echo "[sync] source: local path $SOURCE"
  cp -a "$SOURCE/." "$WORK_DIR/"
else
  echo "[sync] source: git $SOURCE @ $SOURCE_REF"
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required for remote sources but is not on PATH." >&2
    exit 3
  fi
  git clone --depth 1 --branch "$SOURCE_REF" "$SOURCE" "$WORK_DIR/_clone"
  rm -rf "$WORK_DIR/_clone/.git"
  shopt -s dotglob
  mv "$WORK_DIR/_clone"/* "$WORK_DIR"/ 2>/dev/null || true
  rmdir "$WORK_DIR/_clone"
  shopt -u dotglob
fi

STAGE="$WORK_DIR/$SOURCE_SUBDIR"
if [[ ! -d "$STAGE" ]]; then
  echo "[sync] DESIGN_SYSTEM_SUBDIR=$SOURCE_SUBDIR not found in source." >&2
  exit 4
fi

# ─────────────────────────────────────────────────────────────────────────────
# Validate the staged content has the layout v2 expects
# ─────────────────────────────────────────────────────────────────────────────
REQUIRED=(
  "CLAUDE.md"
  "HANDOFF.md"
  "colors_and_type.css"
)
for path in "${REQUIRED[@]}"; do
  if [[ ! -f "$STAGE/$path" ]]; then
    echo "[sync] required file missing in source: $path" >&2
    exit 5
  fi
done
if ! find "$STAGE/ui_kits" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | grep -q .; then
  echo "[sync] source has no ui_kits/<surface>/ directories." >&2
  exit 5
fi

# ─────────────────────────────────────────────────────────────────────────────
# --check: compare staged vs current mirror; exit non-zero if drifted
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "check" ]]; then
  if [[ ! -d "$MIRROR_DIR" ]]; then
    echo "[sync] mirror missing at $MIRROR_DIR (would be created on full sync)." >&2
    exit 6
  fi
  if diff -rq "$STAGE" "$MIRROR_DIR" > "$WORK_PARENT/diff.txt" 2>&1; then
    echo "[sync] mirror is up to date with canonical."
    exit 0
  else
    echo "[sync] mirror is stale relative to canonical:" >&2
    cat "$WORK_PARENT/diff.txt" >&2
    exit 6
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# --dry-run: report what would change without writing
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "dry-run" ]]; then
  echo "[sync] dry run — would write to $MIRROR_DIR"
  if [[ -d "$MIRROR_DIR" ]]; then
    diff -rq "$MIRROR_DIR" "$STAGE" | sed 's/^/  /' || true
  else
    echo "  (mirror directory does not yet exist; would be created)"
  fi
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# Real sync: replace mirror atomically
# ─────────────────────────────────────────────────────────────────────────────
NEW_MIRROR="${MIRROR_DIR}.new.$$"
OLD_MIRROR="${MIRROR_DIR}.old.$$"

mkdir -p "$NEW_MIRROR"
cp -a "$STAGE/." "$NEW_MIRROR/"

if [[ -d "$MIRROR_DIR" ]]; then
  mv "$MIRROR_DIR" "$OLD_MIRROR"
fi
mv "$NEW_MIRROR" "$MIRROR_DIR"
rm -rf "$OLD_MIRROR"

echo "[sync] wrote $MIRROR_DIR"
echo "[sync] surfaces:"
find "$MIRROR_DIR/ui_kits" -mindepth 1 -maxdepth 1 -type d -printf '  %f\n' 2>/dev/null | sort

# ─────────────────────────────────────────────────────────────────────────────
# Stamp metadata so we can tell at a glance how stale the mirror is
# ─────────────────────────────────────────────────────────────────────────────
cat > "$MIRROR_DIR/.sync-meta" <<META
synced_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
source: $SOURCE
ref: $SOURCE_REF
subdir: $SOURCE_SUBDIR
META

echo "[sync] done."
