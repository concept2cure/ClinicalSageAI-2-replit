# P0-11 — reconciled onto trunk (2026-10-01, 13:50 UTC)

While P0-11 was in review, the W2/D1 lane landed the Anthropic half on trunk (`c3e9e493`: `anthropic_api_key` as a
secret in both containers, a precondition that the placement approvals name Anthropic, the preflight requiring it)
and later validated `openai_api_key` as a required key "because Vault search embeds with it" (`19d2be04`). Trunk's
Anthropic half is kept as the one implementation; this item's Anthropic changes are dropped.

What this item still adds, decided by ADR-0014 §1 (product owner, 2026-10-01) and the DPA's Annex III: **OpenAI is
provisioned only when a tenant's Order Form elects it.** Since P1-45 (`d29275b1`) the gateway refuses OpenAI, before
dispatch, for every organisation that has not elected it, embeddings included. A key held for no elected tenant
therefore serves nobody, and its presence contradicts the DPA's "not provisioned unless elected". An unelected
tenant's Vault search is refused either way; the lane that serves every tenant without OpenAI is the self-hosted
embedding service (P1-54, ADR-0014 §1.5), not this key.

- `terraform/stack/variables.tf`: `openai_enabled` (default false); `openai_api_key` defaults to `""`, and trunk's
  format check (an `sk-` key, never an Anthropic `sk-ant-` key) still applies to any key given.
- `terraform/stack/main.tf`: the OpenAI secret comes from `local.openai_secret`, filled only when `openai_enabled`;
  `OPENAI_API_KEY` is appended to `boot_secrets` from the same map, so the secret and the container entry cannot
  disagree; a `boot_contract` precondition requires the election and the key together.
- Both environment roots pass `openai_enabled`; their tfvars examples say how to elect OpenAI.
- `boot_contract.tftest.hcl`: the default test values carry no OpenAI key; trunk's "refuses an empty OpenAI key" run
  is replaced by four runs (absent by default; a secret in both containers when elected; an election without a key
  refused; a key without an election refused); "refuses an Anthropic key as the OpenAI key" is kept. The leak check
  skips an empty value, which every string contains.

Re-run: `terraform test` in `terraform/stack` 43/43 (`green-terraform-test.txt`); `terraform validate` for
production and staging: valid.

Red: the same test file against trunk's unchanged stack (`red-terraform-test-on-trunk-stack.txt`) stops at the first
run with "No value for required variable": trunk cannot plan a deployment with no tenant electing OpenAI unless an
OpenAI key is supplied. That is the defect, and the 42 runs after it are skipped.
