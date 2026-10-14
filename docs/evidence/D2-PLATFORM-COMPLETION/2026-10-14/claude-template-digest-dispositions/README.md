# Exact committed fixture-digest scan dispositions

2026-10-14, W1/D2 supporting release evidence. Claude commit
`4c5546cec14303fcc3b4a5b1338dcd996f3180d4` introduced three generic-api-key
findings in its sealed synthetic browser summary, at lines 22, 27 and 32.
The actual hosted job 116074473441 failed; root reproduced its exact
full-history scan with three findings before changing any disposition.

Two independent source reviews recomputed SHA256 from the exact committed
browser-eval-fixture/api-contract.json (39,567 bytes) and mock-api.mjs
(3,448 bytes). All three summary values equal those digests. The exact
committed browser producer hashes raw readFileSync bytes with
createHash('sha256').digest('hex'); fixturePins and apiContractSha256 use
that helper. These values identify fixture content and grant no authority.

Only the three exact already-published commit/file/rule/line fingerprints
were added to .gitleaksignore. The original evidence bytes and history,
scanner configuration, broad rules, and existing live-credential notes are
preserved. No wildcard, path, regex or future-commit exception was added.
This is a verified digest false-positive disposition, not key rotation.

The same actual full-history command then returned zero findings. Red/green
raw logs are preserved losslessly with decoded byte hashes. Independent
review records and exact finding metadata contain no credential values.
This local result does not retroactively turn the original hosted job green;
the next committed publication will carry the exact dispositions.
