# Lossless transport for sealed helper evidence

The published `1bd3af0bc` Semgrep job `116130367711` reported two findings in the retained browser preparation script `scripts/start_qa.py`: dynamic urllib usage and insecure transport at its loopback health check. That original red result remains retained separately. The runtime checkpoint helper contains the analogous loopback health check. These scripts are historical execution evidence; this change packages their exact original bytes as deterministic `.py.gz` artifacts for publication.

This is proof-data packaging, with no production SSRF fix, scanner rule change, path exemption, inline suppression, or Semgrep rerun. Decoding is for local source review; it does not run either helper, contact a server, or reconstruct private configuration. The runtime helper remains a review artifact under its existing helper note, rather than a standalone operator bundle. No private server logs, deployment logs, credentials, or environment values are added.

The original browser manifest is unchanged: SHA-256 `bdee649e7523ac31e8401d7394b7c4c9ee0e9b8ca10ad7724bec4c6b638bd760` is recorded authoritatively in `transport-manifest.json`. The original runtime manifest remains SHA-256 `9795d80e6b139935c8d0d974259edd92525cd44c4f1c36cfb844c28f02f5d9a8`. Original virtual paths and decoded artifact bytes are preserved, including the runtime supplemental note and manifest. The existing ten-file `source-pin-publication-transport` manifest and decoder are unchanged.

Run the additive decoder from this repository with Python 3 and an empty directory outside the repository:

```sh
python3 docs/evidence/D2-PLATFORM-COMPLETION/2026-10-14/evidence-helper-publication-transport/decode-artifacts.py --output /tmp/c2c-evidence-review-empty
```

It composes the ten existing JSON transport records with these two Python records, checks encoded and decoded hashes, reconstructs all 141 original browser manifest records and all 12 original runtime manifest records, and verifies both original manifest hashes. The recorded empty-directory verification succeeded for all 12 transport records, all 153 original artifact records, both original seals, and both retained runtime addenda. The separate additive manifest seals this transport's own files; it does not replace an earlier seal.
