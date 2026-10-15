# Exact regional template fixture digest dispositions

W1 / D2 publication follow-up to original commit
`34389d3af6330effb361c28ee69d9988dea10df2`. The unchanged full-history Gitleaks
command found 16 `generic-api-key` matches. Two independent reviews recomputed
every finding from the original committed Git blobs and inspected the original
file-hashing producer.

All 16 values are repeated SHA-256 content digests of two synthetic fixture
files: six occurrences of `mock-api.mjs` and ten of `api-contract.json`. No
finding remains unmatched. The retained machine-readable reviews identify each
exact commit, file, line, JSON field, original blob and computation.

Only those 16 exact fingerprints were added to `.gitleaksignore`. Rules, path
coverage, previously published evidence and Git history were preserved. This
disposition says nothing about revocation of earlier historical credentials.

The manifest seals lossless compressed review and red-scan records. The final
full-history scan is recorded separately after the exact dispositions.
