# 5 — Semgrep blocking scan: 17 new findings → 1 (handed to the Terraform lane)

The blocking step (`semgrep.yml`, `--config=p/default --config=p/ci`, baseline
`8c6bd712`, the newest green trunk commit) has failed on every trunk run since.
The findings below come from run `39733277063`, job `119673017204` (head
`8543a0763`), which lists **17 code findings**. Semgrep's registry rules
cannot be fetched from this container (semgrep.dev is denied by the network
policy), so each site was read and checked by hand.

## detect-non-literal-regexp (4)

| Site | Disposition |
|---|---|
| `scripts/ci/check-terraform-backend.mjs:79` (`new RegExp(headerRe.source, 'g')`) | **Code fix.** Both callers pass a regex literal. They now pass a global literal, `blocks()` refuses a non-global one, and it uses `src.matchAll(headerRe)`, so no `RegExp` is built at run time. `ci:terraform-backend:selftest` and `ci:terraform-backend` both pass. |
| `docs/evidence/W5/2026-10-21-ind-reference-lane/driver/walk.mjs:35` | Reasoned `nosemgrep`: `label` is one of four uppercase literals at its only call. The file is not in `scripts/ci/semgrep-reviewed-evidence.json`, so no pinned digest changes; `review-semgrep-evidence.py` still passes, 25 files. |
| `server/services/__tests__/work-recommendations-…pglite.test.ts:55` | Reasoned `nosemgrep`: `table` is a literal table name at each call. |
| `server/services/compute/__tests__/export-governance-…test.ts:43` | The same. |

## path-join-resolve-traversal (12, across 7 lines)

Each site was read. Each is either confined, or its input is not user input.

| Site | Why it is safe |
|---|---|
| `ectd/backbone-validation.ts` (DTD reference) | `externalIdError` refuses URI, absolute and entity-built ids first. `packagedFile` then refuses anything outside `root`, resolves the real path, and refuses symlinks. |
| `ectd/backbone-validation.ts` (package root) | `packageDir` is the server's own temp package directory. |
| `ectd/backbone-validation.ts` (XML path) | An absolute `relPath` is refused on the same line, and `packagedFile` confines the rest. |
| `ectd/checksum-manifest.ts` (manifest read) | A vendored directory plus a constant manifest name (`checksums.txt` at both callers, `qualify.ts:337,462`). |
| `ectd/checksum-manifest.ts` (file read) | `fileName` comes from `readdir(dir)`. |
| `ectd/dtd-bundler.ts` | `name` comes from `readdir(dir)`; non-files and symlinks are skipped. |
| `submission-gateways/regional-packager.ts:905` | A constant file name. |
| `submission-gateways/regional-packager.ts:929` | Checked on the next line by `isPathWithin(dir, dest)`, which throws `PACKAGE-ENTRY-ESCAPES`. |

Each site gets a single-line `nosemgrep: <rule-id> -- <reason>` directly above
the flagged line.

## aws-subnet-has-public-ip-address (1): handed on, not changed

`terraform/modules/vpc-secure/main.tf:13-20`: `map_public_ip_on_launch = true`
on the public subnets. This is pre-existing, and it was re-flagged as new
because `16d26ce33` reformatted the block.

It is real but low-severity:
- the public subnets hold only the internet-facing ALB, which gets its own
  addresses, and the NAT gateway, which has its own EIP;
- no instance or launch template places anything in them;
- both ECS services set `assign_public_ip = false` in private subnets.

The fix is `map_public_ip_on_launch = false`, an in-place update. The file
belongs to the active MR-03 Terraform lane, last edited at 00:16 today, so it
is handed to that lane (work-orders board) rather than edited inside its
window. **Semgrep stays red on this one finding until it lands.**
