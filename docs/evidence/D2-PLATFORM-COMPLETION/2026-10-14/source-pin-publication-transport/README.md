# Lossless transport for sealed source-pin records

The publication scan reported 41 `generic-api-key` matches in ten JSON files.
Every reported value was independently recomputed as SHA-256 of its named
source file. There are five source files. These are source identity checksums,
not credentials. The original red scan and exact review are retained here.

Only the publication encoding changed: the ten original JSON byte streams are
stored as `.json.gz`. Their original sealed manifests, screenshots, logs and
other proof files remain unchanged. `transport-manifest.json` identifies each
original virtual path, encoded path, byte count and exact decoded/encoded hash.
No scanner rule, path exclusion, source code or recorded result was changed.

To reconstruct the original sealed folders in a separate local directory, run
`python3 decode-payloads.py` from this directory. The utility copies the relevant
proof folders, decodes the ten virtual files and verifies every transport hash.
It prints the review directory and preserves the repository. The original child
manifests can then be checked against that reconstructed folder tree.

The original plain-text source pin maps and summaries referenced by those child
manifests are virtual files in this transport. Their content and phase identities
were preserved exactly. The actual reconstruction was verified before publication.
