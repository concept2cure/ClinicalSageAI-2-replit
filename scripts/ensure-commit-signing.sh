#!/usr/bin/env bash
#
# ensure-commit-signing.sh
#
# Guarantees that commits created in this (ephemeral) environment are correctly
# ATTRIBUTED and, where the tooling allows, cryptographically SIGNED — so GitHub
# does not flag them as Unverified for a mismatched committer email or a missing
# signature. Idempotent; intended to run on SessionStart.
#
# Why this exists: the container is scaffolded for SSH commit signing
# (gpg.format=ssh, commit.gpgsign=true) but (a) the referenced signing key is
# often absent / zero-bytes when provisioned, and (b) ssh-keygen is not always
# installed — either of which makes git silently produce UNSIGNED commits or, if
# gpgsign points at a missing key, risks breaking `git commit` outright. This
# script repairs that into a consistent, working state.
#
# Backend selection: prefers an already-provisioned SSH signing key (the intended
# platform design); otherwise falls back to GPG if available; otherwise it still
# fixes the identity and explicitly DISABLES signing so commits never fail.
#
# The green "Verified" badge: a signature renders as Verified on GitHub only once
# the PUBLIC half of the signing key is registered to the committing account
# (Settings -> SSH and GPG keys). This script prints the public key for that.
# A key generated fresh in an ephemeral container is per-session; durable Verified
# status requires the platform to provision a stable, pre-registered signing key.

set -uo pipefail

NAME="Claude"
EMAIL="noreply@anthropic.com"

# Durable identity — fixes the committer-email-mismatch class of Unverified.
git config --global user.name  "$NAME"
git config --global user.email "$EMAIL"

ssh_key="${COMMIT_SIGNING_KEY:-$HOME/.ssh/commit_signing_key}"

enable_ssh() {
  command -v ssh-keygen >/dev/null 2>&1 || return 1
  if [ ! -s "$ssh_key" ]; then
    command -v ssh-keygen >/dev/null 2>&1 || return 1
    mkdir -p "$(dirname "$ssh_key")"; chmod 700 "$(dirname "$ssh_key")" 2>/dev/null || true
    rm -f "$ssh_key" "$ssh_key.pub"
    ssh-keygen -t ed25519 -N "" -C "$EMAIL" -f "$ssh_key" >/dev/null 2>&1 || return 1
  fi
  [ -s "$ssh_key.pub" ] || return 1
  chmod 600 "$ssh_key" 2>/dev/null || true
  git config --global gpg.format      ssh
  git config --global user.signingkey "$ssh_key"
  git config --global commit.gpgsign  true
  git config --global tag.gpgsign     true
  local signers="$HOME/.ssh/allowed_signers"
  printf '%s %s\n' "$EMAIL" "$(cat "$ssh_key.pub")" > "$signers"
  git config --global gpg.ssh.allowedSignersFile "$signers"
  echo "[ensure-commit-signing] backend=ssh. Register this PUBLIC key as a GitHub 'Signing Key':"
  cat "$ssh_key.pub"
}

enable_gpg() {
  command -v gpg >/dev/null 2>&1 || return 1
  export GNUPGHOME="${GNUPGHOME:-$HOME/.gnupg}"
  mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME" 2>/dev/null || true
  local fpr
  fpr="$(gpg --list-secret-keys --with-colons "$EMAIL" 2>/dev/null \
          | awk -F: '/^fpr:/{print $10; exit}')"
  if [ -z "$fpr" ]; then
    gpg --batch --pinentry-mode loopback --passphrase '' \
        --quick-generate-key "$NAME <$EMAIL>" ed25519 sign 0 >/dev/null 2>&1 || return 1
    fpr="$(gpg --list-secret-keys --with-colons "$EMAIL" 2>/dev/null \
            | awk -F: '/^fpr:/{print $10; exit}')"
  fi
  [ -n "$fpr" ] || return 1
  git config --global gpg.format      openpgp
  git config --global user.signingkey "$fpr"
  git config --global commit.gpgsign  true
  git config --global tag.gpgsign     true
  echo "[ensure-commit-signing] backend=gpg (key $fpr). Register this PUBLIC key as a GitHub 'GPG key':"
  gpg --armor --export "$fpr"
}

disable_signing() {
  # No usable signing backend: keep commits working (attributed but unsigned)
  # rather than letting a dangling key reference break `git commit`.
  git config --global commit.gpgsign false
  git config --global tag.gpgsign    false
  echo "[ensure-commit-signing] No signing backend available (no ssh-keygen, no gpg)." >&2
  echo "[ensure-commit-signing] Commits will be attributed to $NAME <$EMAIL> but UNSIGNED." >&2
}

if   enable_ssh; then :
elif enable_gpg; then :
else disable_signing
fi
