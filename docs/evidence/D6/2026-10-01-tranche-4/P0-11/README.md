# P0-11 (DP-07, High), Terraform half: the stack provisions Anthropic's key, and OpenAI's only when a tenant ordered it

Security plan item P0-11, finding DP-07 (`docs/security/SECURITY_AUDIT_2026-09-24.md`).
The embedding-placement half of DP-07 was closed earlier (see the P0-11 note in
`server/services/ai-gateway/embeddings/embedding-provider.ts`). This folder is the
Terraform half, recorded as still open in `docs/evidence/reviews/2026-09-24/security.md` row 6:
*"`terraform/stack/main.tf:93-95` provisions `openai_api_key`; no `anthropic` key in the stack (grep: zero hits)."*

Date: 2026-10-01. Verified open at HEAD `0e58e794` before any change (`grep -rn anthropic terraform/stack/*.tf` returns nothing; `main.tf:93` and `:226` provision and inject `OPENAI_API_KEY`).
The earlier, interrupted attempt at this item left no edits and no evidence in the tree.

## What was wrong

1. **The stack contradicted the DPA.** `docs/commercial/DATA_PROCESSING_ADDENDUM.md` Annex III names Anthropic as the
   subprocessor for drafting and, at `0e58e794`, said OpenAI is *"disabled for a tenant unless its Order Form lists them"*.
   (P1-45, `d29275b1`, has since rewritten that row: *"only for a Customer whose Order Form elects it"*. The contradiction
   with the stack is the same under either wording.) `terraform/stack` stored an OpenAI key in Secrets Manager unconditionally, handed `OPENAI_API_KEY` to the API and
   worker containers, and provisioned no Anthropic key at all.
2. **The task it rendered could not draft or report ready.** The gateway serves drafting only on a model marked
   `approvedForHighRisk`, and every such model is Claude: `claude-opus-4`, `claude-opus-5`, `claude-opus-4-legacy`
   (anthropic), `claude-opus-4-bedrock`, `claude-opus-4-vertex` (`server/services/ai-governance/approved-models.ts`).
   With `OPENAI_API_KEY` alone, AnA readiness is `no_high_risk_model` and `/readyz` answers 503
   (`server/startup/ana-readiness-state.ts`; pinned by `server/startup/__tests__/ana-readiness.test.ts`, run below).
   The deploy preflight accepted that task definition, because it requires no AI key by name.

## What is true now

| | Before | After |
|---|---|---|
| `anthropic_api_key` variable | absent | required, sensitive, no default; empty or blank refused at plan (`var.anthropic_api_key` validation) |
| `anthropic_api_key` secret / `ANTHROPIC_API_KEY` | absent | always stored; a `boot_secrets` row, so both containers read it as a secret, never a plain variable |
| `openai_enabled` variable | absent | `bool`, default `false`. `true` only when a tenant's Order Form elects OpenAI |
| `openai_api_key` variable | required | optional (default `""`) |
| `openai_api_key` secret / `OPENAI_API_KEY` | always stored, always in both containers | stored, and in both containers, **only** when `openai_enabled = true`. The `boot_secrets` entry is derived from the secret map (`for k in keys(local.openai_secret)`), so the two cannot disagree |
| `openai_enabled` without a key, or a key without `openai_enabled` | n/a | refused at plan by a `terraform_data.boot_contract` precondition. A key nobody ordered is neither stored nor silently dropped. An election with no key would leave the gateway's OpenAI provider disabled (`gateway.ts` enables it only with a key) while the Order Form says it is on |
| Environment roots (`environments/production`, `environments/staging`) | pass `openai_api_key` | pass `anthropic_api_key`, `openai_enabled`, `openai_api_key` (the last two default off) |
| tfvars examples | told operators to pass `openai_api_key` | tell them to pass `TF_VAR_anthropic_api_key`, and explain the OpenAI election (both or neither, Order Form recorded in the deployment evidence) |

**What the server needs at boot (checked, unchanged).** Neither key is a boot refusal. `server/startup/env.ts:112` only
warns without `ANTHROPIC_API_KEY`. The gateway enables OpenAI only when its key is set (`gateway.ts:4028`, `enabled: !!openaiKey`).
No production gate requires `OPENAI_API_KEY`. In production, the provider election admits OpenAI for an organization only when
its stored `allowedProviders` names it (`server/services/ai-gateway/providers/org-placement.ts:96-113`). Embeddings default to
the OpenAI lane and are refused before dispatch for any organization that has not elected it (`embedding-provider.ts`, P1-45).
So a deployment without OpenAI boots, reports ready on Claude, and refuses OpenAI embeddings rather than sending them anywhere.

**Deploy preflights (checked, unchanged).** `.github/workflows/deploy-aws.yml`'s `for VAR in …` list and
`scripts/deploy-prod.sh`'s `REQUIRED_VAR` list name no AI key, so a task definition without OpenAI passes both.
`terraform-preflight-proof.mjs` runs the preflight's own shell against the task definition rendered with OpenAI off, and the
preflight accepts it (green below). The **CI boot smoke** (`ci.yml`, "Boot in production mode…") boots with no AI key at
all, in deterministic mode with a written acceptance, so it needs no change.

## Red / green

| Check | Red: new assertions, unfixed stack | Green: after the change |
|---|---|---|
| `the_primary_model_key_is_a_secret_in_both_containers` | **fail**: no container reads `ANTHROPIC_API_KEY`; no `anthropic_api_key` secret | pass |
| `openai_is_absent_unless_a_tenant_ordered_it` | **fail** (2 assertions): the `openai_api_key` secret exists; both containers carry `OPENAI_API_KEY` | pass |
| `openai_is_provisioned_when_a_tenant_ordered_it` | **fail**: `openai_enabled` undeclared; the containers carry `OPENAI_API_KEY` but not `ANTHROPIC_API_KEY` | pass (secret source, execution-role grant, no key in a plain variable) |
| `refuses_openai_enabled_without_a_key` | **fail**: missing expected failure | pass |
| `refuses_an_openai_key_no_tenant_ordered` | **fail**: missing expected failure | pass |
| `refuses_a_missing_anthropic_key` | **fail**: missing expected failure | pass |
| The other 26 runs of `boot_contract.tftest.hcl` | pass | pass (no-secret-in-plain-environment list now carries `var.anthropic_api_key`) |
| Totals | 26 passed, 4 failed, 2 skipped; the 2 skipped then failed on their own | **32 passed, 0 failed** |
| `scripts/ops/terraform-preflight-proof.mjs` | not applicable | **every check holds**. The deploy preflight accepts the task definition rendered with OpenAI off |
| Rendered API task definition (`renders_the_boot_contract`) | `OPENAI_API_KEY` secret, no Anthropic key | `ANTHROPIC_API_KEY` secret: true. `OPENAI_API_KEY` anywhere: false |
| `terraform validate`: stack, production root, staging root | n/a | valid, valid, valid |
| `server/startup/__tests__/ana-readiness.test.ts` (existing, unchanged) | OpenAI-only (the old stack): `no_high_risk_model`, `/readyz` 503 | Anthropic key present (the new stack): `ready`. 22/22 pass |

Files: `red/terraform-test-unfixed-stack.txt`, `red/terraform-test-unfixed-stack-skipped-runs.txt`,
`green/terraform-test.txt`, `green/terraform-preflight-proof.txt`, `green/rendered-api-task-definition-ai-keys.txt`,
`green/terraform-validate.txt`, `green/server-ana-readiness-by-provider-key.txt`.

How the red was produced: the new test file was run against the stack as it stood (other lanes' uncommitted P0-8 hunks
included), in an isolated copy of `terraform/` and the two workflows it reads, so a concurrent P0-8 proof run in the shared tree
was not disturbed. The unfixed stack requires `openai_api_key`, so it was supplied by `-var` exactly as the old test file supplied
it. `terraform test` stops a file after a "missing expected failure", so the two runs it skipped were each run once more in a
red-only file holding the same mock provider and variables header and that run verbatim (not committed). The landed test file
is byte-identical to the one the red runs used (sha256 `df404fa9…`).

## Commands

```bash
cd terraform/stack
terraform init -backend=false
terraform test -no-color                                   # green: 32 passed
terraform test -no-color -var openai_api_key=x             # red, against the pre-change main.tf/variables.tf
cd ../.. && node scripts/ops/terraform-preflight-proof.mjs  # green: every check holds
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run server/startup/__tests__/ana-readiness.test.ts
```

(Terraform 1.9.8 with a local provider mirror, as `tf.sh` in the session scratchpad. `terraform/stack/.terraform.lock.hcl`
was deleted afterwards and is not part of the change.)

## Operator consequences (first apply after this change)

- Plan stops until `TF_VAR_anthropic_api_key` is supplied.
- If `TF_VAR_openai_api_key` is still exported and no tenant has ordered OpenAI, plan stops on the boot-contract precondition.
  Unset it, or set `openai_enabled = true` and record the Order Form.
- With OpenAI off, apply removes `c2c/<env>/openai_api_key` (Secrets Manager schedules deletion with its default recovery
  window) and registers a task-definition revision without `OPENAI_API_KEY`.

## Proposed DPA text (not edited here; for the document owner)

*Corrected in the fix round. The round-1 text (replace Annex III's last row, add a sentence under the table) is
withdrawn: it was written against the DPA before P1-45 and is wrong against HEAD. See "Fix round" below.*

Since P1-45 (`d29275b1`, 2026-10-01 07:57) the DPA already says that OpenAI is used for a Customer only when its Order
Form elects it (§6.2 row "OpenAI API"; Annex III row "OpenAI, L.L.C."), that Google Vertex AI and Azure OpenAI are
elected the same way (Annex III's last row), and that Moonshot AI is not a subprocessor and cannot be elected (the
sentence under Annex III). None of that changes. The DPA does not yet say the fact this item adds: a deployment holds no
OpenAI key at all unless a tenant has elected OpenAI. The proposal adds that one clause in two places and removes nothing.

1. §6.2 table, row "OpenAI API", Notes cell. After *"Used for a tenant only when its Order Form elects it, for
   generation, fallback and embeddings; the platform enforces this in production."* insert:
   > No OpenAI key is provisioned in a deployment unless a tenant's Order Form elects OpenAI (`openai_enabled` in `terraform/stack`).
2. Annex III, row "OpenAI, L.L.C.", Basis / posture cell. The cell ends *"in production nothing of a Customer's reaches
   OpenAI without it"*. Append a full stop and:
   > No OpenAI key is provisioned in a deployment unless a Customer's Order Form elects OpenAI (`openai_enabled` in `terraform/stack`)

Do not replace or delete any Annex III row, and do not add a second Moonshot sentence.

The exact find/replace pairs are `fix-round/proposed-dpa-edits.json`. `fix-round/check-dpa-proposal.mjs` applies them to
the DPA as committed at a git ref, in memory, checks the result and prints the word diff
(`green/fix-round-dpa-proposal-corrected.txt`).

The clause says "in a deployment", not "for a Customer", because `openai_enabled` is per deployment. Where one Customer
has elected OpenAI, the deployment holds the key. The gateway still refuses every other Customer before dispatch, and
both rows already say so. The link from `openai_enabled = true` to an Order Form is procedural: the tfvars examples tell
the operator to record the Order Form in the deployment evidence. Terraform cannot see an Order Form.

**A separate note for the document owner, not part of this proposal.** §6.2's sentence *"Text embeddings for search are
produced by a self-hosted embedding model inside Provider's own network in the tenant's region (ADR-0014 §1.5)"*
describes a lane that no deploy path configures yet. Nothing in `terraform/`, `.github/workflows/` or
`scripts/deploy-prod.sh` sets `EMBEDDING_PROVIDER`, so the default OpenAI lane applies. Without an OpenAI election, every
embedding is refused before dispatch, so the lane fails closed. ADR-0014 §1.5 tracks the self-hosted lane as P1-54.
Until P1-54 deploys it, the accurate statement is that an unelected tenant's embeddings are refused, not that they are
produced in-region. The sentence's last clause is true today: no tenant text is sent to a third party to be embedded
unless the tenant elects OpenAI.

## Residuals

- `terraform/README.md:50` still shows `terraform apply -var="jwt_secret=..." -var="openai_api_key=..."`. That file is not
  named by this item. Proposed change: `-var="openai_api_key=..."` → `-var="anthropic_api_key=..."`, plus one line:
  *"OpenAI only when a tenant's Order Form elects it: add `-var openai_enabled=true -var openai_api_key=...`."*
- The deploy preflight does not require `ANTHROPIC_API_KEY`. That is deliberate here: the server accepts Bedrock or Vertex
  as the drafting lane (`AI_BEDROCK_ENABLED` / `AI_VERTEX_ENABLED`), so a name check would refuse a valid private-cloud
  deployment, and a missing key is not a boot refusal. `/readyz` (`ana` dependency) is what refuses that task. If the
  founder wants it refused before it rolls, add `ANTHROPIC_API_KEY` to the `for VAR in` list. `boot_contract.tftest.hcl`
  reads that list, so the Terraform test would then require it automatically.
- `charts/trialsage-cer` (Helm) still reads only `openai_api_key`. It is not the launch deployment path (ECS via `terraform/stack`).
- Embeddings with OpenAI off: the default `EMBEDDING_PROVIDER=openai` lane is refused for every organization that has not
  elected OpenAI (P1-45), so Vault semantic search needs the self-hosted lane (`EMBEDDING_PROVIDER=local`) or an OpenAI
  election. This fails closed today. ADR-0014 §1.5 has already chosen the self-hosted lane; deploying it is P1-54, not
  this item.
- `terraform/environments/{production,staging}/main.tf` already failed `terraform fmt -check` at HEAD. No CI gate runs it,
  and this change keeps the existing alignment to keep the diff small.

## Fix round (2026-10-01, HEAD `eefd33e7`)

**What the verifier found.** Round 1's proposed DPA text was stale against HEAD. It was written against the DPA at
`0e58e794`, where Annex III's last row was "OpenAI, L.L.C.; Moonshot AI", and it said P1-45 was uncommitted. P1-45 landed
as `d29275b1` (2026-10-01 07:57), after `0e58e794`. That commit rewrote §6.2 and Annex III: the OpenAI row now reads
"only for a Customer whose Order Form elects it" (`DATA_PROCESSING_ADDENDUM.md:270`), the last row is now Google/Azure
(`:271`), and the Moonshot exclusion is a sentence under the table (`:273`). Applied as written, "replace the last row of
Annex III" would have deleted the Google LLC / Microsoft Corporation subprocessor row from a contract annex, listed
OpenAI twice, and stated Moonshot's exclusion twice. Its optional §6.2 suggestion was stale in the same way. It located
the "OpenAI API" row by the words "Fallback lane", which that row no longer contains (0 occurrences at HEAD). No
Terraform, server or test file was affected; the defect was in the proposal text only.

**What is true now.** The proposal section above is replaced. It adds one clause to two existing cells and removes
nothing. It is checked mechanically against the DPA at HEAD, so it cannot drift from the DPA unnoticed. The "What was
wrong" quote now says which commit it is from, and the embeddings residual now cites ADR-0014 §1.5 / P1-54 rather than
calling it an open product decision.

**The check.** `fix-round/check-dpa-proposal.mjs <proposal.json> [ref]` reads the DPA at the ref with `git show`, applies
the proposal in memory (the tree is never written), and checks five things. The rules come from the DPA at the ref, not
from a hand-kept list:

1. Every text the proposal tells the owner to find occurs exactly once.
2. No Annex III subprocessor present at the ref is dropped.
3. No subprocessor is listed twice.
4. Moonshot's exclusion is stated exactly once in Annex III, as it is at the ref.
5. Every Annex III OpenAI row says no key is provisioned without an election. This is the fact P0-11 adds.

`fix-round/round-1-proposal.json` is round 1's text, extracted byte-for-byte from this README's lines 106 and 108 before
the fix, with its instruction ("replace the last row", "add a sentence under the table") encoded as structural
operations. The script resolves "the last row" at the ref, so the reconstruction does not pick the row.

| Check (DPA at HEAD `eefd33e7`) | Red: round-1 proposal | Green: corrected proposal |
|---|---|---|
| anchors occur exactly once | pass ("the last row of Annex III" resolves to *Google LLC (Vertex AI); Microsoft Corporation (Azure OpenAI)*) | pass (2 anchors, each found once) |
| no subprocessor dropped | **fail**: Google LLC (Vertex AI); Microsoft Corporation (Azure OpenAI) dropped | pass |
| no subprocessor listed twice | **fail**: OpenAI, L.L.C. listed twice | pass |
| Moonshot stated exactly once | **fail**: stated 2 times | pass |
| every OpenAI row states the provisioning fact | **fail**: 2 OpenAI rows, 1 without it | pass |
| exit code | 1 | 0 |

Files: `red/fix-round-dpa-proposal-round-1.txt`, `green/fix-round-dpa-proposal-corrected.txt`. Each includes the word
diff the proposal makes to the DPA.

The check also failed the corrected proposal once. Its first wording said "Provider holds no OpenAI key", which does not
use the provisioning term check 5 requires. The wording was changed to "No OpenAI key is provisioned"; the check was not
loosened. That run was not filed.

The stack itself was re-run as it stands in the working tree: `green/fix-round-terraform-test.txt`, `terraform test`
**32 passed, 0 failed**, including all six P0-11 runs. It ran on an isolated copy of `terraform/` and the two workflows the
test reads, so no `.terraform.lock.hcl` was written into the tree.

HEAD moved from `4c988ca6` to `eefd33e7` (P0-10b fix round) during this round. That commit does not touch the DPA,
`terraform/` or the two workflows (`git diff --quiet 4c988ca6 HEAD -- …` holds), and the check prints the same result
at both commits apart from the hash. The filed red and green outputs are from `eefd33e7`.

```bash
node docs/evidence/D6/2026-10-01-tranche-4/P0-11/fix-round/check-dpa-proposal.mjs \
  docs/evidence/D6/2026-10-01-tranche-4/P0-11/fix-round/round-1-proposal.json HEAD    # red: exit 1, 4 FAIL
node docs/evidence/D6/2026-10-01-tranche-4/P0-11/fix-round/check-dpa-proposal.mjs \
  docs/evidence/D6/2026-10-01-tranche-4/P0-11/fix-round/proposed-dpa-edits.json HEAD  # green: exit 0, every check holds
```
