#!/bin/sh
# Download only the pinned veraPDF bytes. The two origins are official Maven
# Central endpoints; either an integrity failure or total unavailability is fatal.
set -eu

if [ "$#" -ne 3 ]; then
  printf '%s\n' 'usage: fetch-verapdf.sh VERSION SHA256 ABSOLUTE_DESTINATION' >&2
  exit 64
fi
version="$1"
checksum="$2"
destination="$3"
if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  printf '%s\n' 'veraPDF version must be an explicit numeric release' >&2
  exit 64
fi
case "$checksum" in
  ''|*[!0-9a-f]*) printf '%s\n' 'veraPDF SHA256 must be 64 lowercase hexadecimal characters' >&2; exit 64 ;;
esac
if [ "${#checksum}" -ne 64 ]; then
  printf '%s\n' 'veraPDF SHA256 must be 64 lowercase hexadecimal characters' >&2
  exit 64
fi
case "$destination" in
  /*) ;;
  *) printf '%s\n' 'veraPDF destination must be absolute' >&2; exit 64 ;;
esac

mkdir -p "$(dirname "$destination")"
candidate="$(mktemp "${destination}.download.XXXXXX")"
trap 'rm -f "$candidate"' 0
trap 'exit 1' HUP INT TERM

for repository in https://repo.maven.apache.org/maven2 https://repo1.maven.org/maven2; do
  if curl -fsSL --proto '=https' --proto-redir '=https' \
    --retry 2 --retry-all-errors --retry-max-time 60 \
    --connect-timeout 10 --max-time 30 \
    -o "$candidate" \
    "${repository}/org/verapdf/apps/cli/${version}/cli-${version}.jar"; then
    # Never accept a different payload from another endpoint after a successful
    # response failed integrity. The checksum, not the transport, admits bytes.
    if ! printf '%s  %s\n' "$checksum" "$candidate" | sha256sum -c -; then
      printf '%s\n' 'veraPDF download failed the pinned SHA256 check' >&2
      exit 1
    fi
    # mktemp starts at 0600; the production application user must read the JAR.
    chmod 0644 "$candidate"
    mv -f "$candidate" "$destination"
    exit 0
  fi
  rm -f "$candidate"
done
printf '%s\n' 'veraPDF could not be downloaded from either official Maven Central endpoint' >&2
exit 1
