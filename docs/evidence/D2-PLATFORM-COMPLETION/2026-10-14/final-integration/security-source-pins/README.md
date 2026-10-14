# Exact source-digest findings at the integration checkpoint

The checksum-verified gitleaks8.28.0 full-history scan over HEAD and origin/concept2cure-v2 scanned10200 commits /610.94MB and found four generic-api-key matches in the stream source manifest at checkpoint14362ef006b728d8b9bc6247e05c644d0575c6df. Each match is a64-character SHA-256 of the named source, recomputed from that exact committed file’s bytes. All four match. The source manifest is retained unchanged.

`verified-four-source-pins.json` records each exact commit/path/rule/line fingerprint and its recomputation. Only these four reviewed fingerprints are added to `.gitleaksignore`. Rules, live-history notices and previous review remain intact. These findings are deterministic source identity pins, not credentials. The raw redacted report and log remain protected in `/tmp`; a subsequent exact history scan must pass before publication.

The subsequent exact CI history scan over integration merge `daa4300cd95eb2b71e24717032335a09b41a00d1` exits0 with no findings. `full-history-after.log`, the empty redacted report and `scan-target.json` retain the actual target/command/version and scanner counts. No unresolved finding is waived.
