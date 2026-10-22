# Two exact fixture digest secret-scan dispositions

The full-history scan of3914e2aa8 found two generic-api-key matches in incoming
Claude commit2c299974d. Both were the field named apiContractSha256 at line11
of the remedy-lifecycle browser summaries. Two independent reviews recomputed
the SHA-256 of the exact same-commit browser-eval-fixture/api-contract.json blob;
both fields match those2,517 fixture bytes exactly. The producer reads those
bytes at browser.mjs:14 and explicitly hashes them at line193. Current fixture
bytes equal that committed blob.

These are content digests of synthetic response fixtures, not authentication
keys. Only the two exact commit/path/rule/line fingerprints were added to
.gitleaksignore. No rule/path wildcard, broad hash exemption, evidence rewrite
or history rewrite was made. The full-history scan is rerun after this commit.
The fixture evidence remains synthetic-API-only and does not qualify live
models, database persistence, RLS or deployment.
