# Host lifecycle and source replay preparation

14 October 2026. Read-only W1/D2 preparation on canonical `concept2cure-v2`. No application, test, schema, dependency, model/provider, client database, deployment or branch change was made. This document proposes a bounded contract; it is not implementation or verification evidence.

## Recommended smallest increment

Persist the exact current server source snapshots already produced by `read_project_document`, associate unchanged budgeted results with a host-owned call identifier and an exact host input manifest, and append truthful lifecycle observations around the two existing gateway calls. Reuse the current source-admission/snapshot guards, budgeting/framing, gateway, turn records, run control and tenant export/purge infrastructure. Do not add relevant-passage selection, multi-range/table inference, durable job resume, provider instrumentation or a new tool in this increment.

The highest truthful coverage claim is **exact source ranges admitted to a recorded host input**, scoped to organization, actor, source extraction and host call. It is not proof that a provider accepted those exact bytes, the model processed them, a scientific claim is supported, or a whole document was reviewed. Existing aggregate byte-bound receipts retain their historical meaning. No old row is upgraded or assigned a made-up extraction/turn/gateway identity.

A default-off durable path can record prepared and staged snapshots now, with gateway invocation/response observations if root chooses those hooks in the same contract. If authoritative persistence fails, read access may remain available under the existing authorized keyless path, but the response/checkpoint must say receipt qualification is unavailable/unrecorded. A successful source read must not fabricate a durable receipt, and a viewer's ordinary receipt INSERT failure must not revoke legitimate read access.

## What the actual code establishes

| Existing component | Observable fact | Limitation for durable receipts |
| --- | --- | --- |
| `read-receipts.ts` + `source-read-receipt.ts` | Private exact source/result snapshot; host budgeting requires unchanged strings; source/actor/text rechecked before handoff and insertion | Snapshot is transient. Existing receipt columns retain original byte hash, span, user/thread; they do not persist extraction hash, result digest, host-call identity or lifecycle |
| `AnaToolExecutor.ts:16160` | Budgets, guards, settles legacy history and withdraws current-round results on typed insertion-stage source refusal | Settlement happens before a follow-up gateway invocation. An earlier committed legacy row does not establish later request invocation |
| `stream.ts:3043` | Same current-round discipline and conservative withdrawal, including prior nonreceipt/historical read-result IDs | `setSentToModel` runs at staging time, before the next request; its historical name is not provider acknowledgement |
| `stream.ts:3119` / `AnaToolExecutor.ts:16177` | Append previous model prose, framed tool results, adaptation and steers into `loopMessages` | Earlier round results remain in later inputs. Current deferred maps cover only the newly executed round |
| `tool-output-frame.ts:27` | Both hosts apply the same deterministic `<tool_output>` wrapper and escape closing tags | The original tool result digest differs from the framed host message digest. Keep both identities |
| `turn-record.ts:352,413,466` | Stores staged round additions, observed gateway response fields, raw/different-budgeted results as content-addressed blobs | Recorder accumulates in memory and seals at turn end. Staged input can exist with no successful later call; a process crash before sealing can lose it |
| `turn-record-loop.ts:68` | JSON chat/realtime doors record first input, raw tool calls and final answer | The file explicitly warns that later rounds and their inputs are not reported. Raw `onToolExecution` is called before host budgeting/refusal |
| `run-control.ts:379` | Durable run/control ownership, cancellation and terminal states, process heartbeat, unique active-thread admission | Stream can continue with `localOnlyRunHandle` if a run row is unavailable. Orphan sweep fails old runs; it does not resume source/model execution |
| `run-events.ts:1,119` | Owner-scoped live timeline mirror with sequence gaps and bounded batching | Batches may be dropped; rows are released after sealing or expire. This is presentation/history mirroring, not authoritative receipt state |
| `GatewayRequest` (`types.ts:369`) | Server trace context and metadata exist; signal reaches gateway; runId can link ledger | No caller-owned request/call ID field currently binds a prepared source receipt to a gateway call |
| `gateway.ts:1371` | `route()` generates `requestId = randomUUID()` before classification/selection | This is a server gateway trace ID, not a provider-issued acknowledgement. It is not exposed to the host until a returned response |
| `gateway.ts:1435,1527,1926` | Gateway can redact messages, select/retry/fallback, rewrite tools, wait for outbound capacity or refuse before dispatch | Host exact-input identity is not exact provider wire identity. One route request ID can encompass several SDK attempts/providers |
| `GatewayResponse` (`types.ts:602`) | Returned provider/model, optional provider-reported resolved model, gateway request ID, deterministic/cached/finish fields | Provider response IDs such as `completion.id`/HTTP request IDs are not propagated by these adapters. A returned deterministic response is not evidence of outbound service |
| `gateway.ts:3909` / `audit.ts:62` | Gateway ledger can retain `request.metadata`, request hash and reported response fields | Logging errors are caught. Neither successful `route()` resolution nor metadata presence proves the ledger INSERT committed |

These are static source observations. No live provider or client database was queried for this preparation.

## Proposed lifecycle vocabulary

Use append-only facts with a deterministic reducer, or an equivalently protected event history plus compare-and-set projection selected by the storage contract. Do not collapse these into a single ambiguous `delivered` boolean.

| Fact/state | Exact meaning and required evidence | Does not establish |
| --- | --- | --- |
| `prepared` | A server-owned validated source snapshot/result digest was durably inserted under its immutable candidate key | Result survived budgeting or entered any request |
| `host_staged` | Unchanged source result survived current admission/budgeting and was included in an exact private host input manifest, with final framing/message mapping and input hash | Gateway invocation or exact provider payload |
| `gateway_invocation_started` | Host durably wrote an intent/entry checkpoint and entered the existing `gateway.route` call for that immutable manifest | Network dispatch, provider acceptance, or exactly-once execution; rename to `gateway_invocation_intended` if only the pre-call durable write is observed |
| `gateway_response_observed` | The host observed the matching route promise resolve and durably appended its sanitized response envelope, output hash and gateway-reported trace/model/finish fields | Provider saw every source span; model understood it; ledger INSERT succeeded |
| `cancelled_before_invocation` | Signal/terminal run state prevented this host call from entering route | Earlier calls or remote work did not occur |
| `withdrawn_before_invocation` | Snapshot/access/identity/budget mismatch removed source context before this call; replacement manifest/hash is recorded | Old history was erased or earlier successful receipts rolled back |
| `gateway_call_failed_or_unconfirmed` | This host observed an exception, cancellation/partial response, missing terminal write or crash ambiguity | Nothing reached a provider, or every provider attempt failed to process content |
| `observation_unrecorded` | Response may have been observed locally but its authoritative append could not be confirmed | The call did not happen; a retry may safely regenerate it |

Do not use `provider_served`, `model_read`, `reviewed`, `scientifically_verified`, `approved`, `accepted_by_agency` or `delivered_exactly_once` in this store. If a later gateway-level dispatch hook is added, label its fact **SDK invocation started at this gateway boundary**, with a separate per-attempt identifier. That still does not attest to remote acceptance.

The earlier design study's suggestion to finalize a receipt as `served` after any successful gateway call is too strong for the current interfaces. This preparation refines that future recommendation to host staging plus observed gateway response, with explicit provider-byte/delivery proof unset.

## Identity and manifest contract proposal

Generate a `hostInvocationId` when the server enters one AnA host execution, independently of whether a durable `ana_runs` row exists. Generate a fresh `hostCallId` per actual `gateway.route` invocation and preserve it for idempotent checkpoint retries. Record `hostKind`, call ordinal and source-producing tool round separately: the initial response and the response that consumes round 1's tools are different calls even when the stream labels both as round 1.

Bind every candidate to validated server organization/user, thread as available, optional verified run ID, canonical program, document ID, original content hash, exact extracted-text SHA/total UTF-16 characters, each `[start,end)` span and its text digest, original result SHA and tool-use ID. A server-generated candidate ID/key must include the producing invocation and tool-use identity; document ID/hash alone is insufficient across actors/extractions/turns. Store a canonical snapshot digest and checker revision. Never derive actor, project, host ID, source hash or lifecycle from model/result/body fields.

The host manifest is a private snapshot of the actual request messages after tool-result caps, framing, replacements, adaptation notes and queued steers, immediately before route. It includes candidate IDs with their exact message/segment locations, framed-source segment digests and the host input digest. Use the repository canonical serializer with a declared version; omit functions/signals and separately pin server trace identity. Message positions are UTF-16 positions in this manifest, not document offsets. Avoid assuming the original result string appears verbatim after framing, since `</` is escaped.

`GatewayRequest.metadata` already reaches the gateway audit metadata, so a reserved server-only namespaced value `{schema,hostInvocationId,hostCallId,manifestSha256,receiptIds}` can correlate observations without a provider change or caller-controlled gateway ID. Overwrite that namespace from the server; never inherit it from body/tool metadata. The returned `GatewayResponse.requestId` is an optional separately observed gateway trace link. Do not make an audited-log row's successful persistence a fact unless its writer supplies a committed receipt. Do not store raw source text or request bodies in retained audit metadata.

Reuse the existing content-addressed customer-data blob convention if exact historical payload reconstruction is required. A hash-only record can verify available exact text later but cannot reconstruct withdrawn/re-extracted historical text; disclose that limit. A new store must have a documented tenant export/purge/legal-hold path and immutable history. Existing turn blobs are written only at turn end, so referencing an expected future blob is not prepared-stage durability.

## Cancellation, errors and idempotency

- Copy source/context/manifest primitives before awaits. Reauthorize and reverify source/extraction/currentness immediately before staging and before each new invocation; no policy/source database lock survives the provider call.
- A prepared checkpoint may survive cancellation. It earns no staged/invoked coverage. Cancellation during a pre-call persistence await must be checked again before route. A durably recorded invocation intent plus a crash before the function call is ambiguous, not remote dispatch.
- An invocation can resolve with `finishReason:'aborted'` and partial streamed content. Retain an observed partial response fact and terminal cancellation; it is not successful full-response qualification. A late response after run cancellation may be recorded as observed/discarded, never revive the cancelled attempt or grant new acceptance.
- Source/policy refusal conservatively withdraws all current-round source payloads as implemented now. Preserve already committed legacy history. An ordinary viewer receipt INSERT failure preserves permitted read access with unrecorded/unconfirmed durable status.
- Terminal observation failure after gateway return is a persistence failure, not a reason to automatically call the gateway again. Query the immutable host call/checkpoint first; retry its exact append idempotently.
- Exact retries of one candidate/stage/call key must return the existing row only if every immutable identity/hash/payload agrees. A conflicting duplicate key is a named refusal, not `ON CONFLICT DO NOTHING` reported as success. Compare `RETURNING` identities and counts.
- A second actual gateway invocation requires a new hostCallId linked to the prior attempt. The current gateway's retries/fallbacks remain gateway internal; do not claim per-SDK-attempt accountability without its own hook or exactly-once billing from host checkpoint keys.
- Two workers/hosts must not append contradictory terminal facts for the same call. Use the selected store's atomic fencing/unique constraints; stale owners and cancelled runs cannot advance a live attempt. A connection loss after COMMIT is resolved by scoped key lookup; uncertainty remains if lookup also fails.
- Missing/foreign/mismatched run/thread association refuses receipt linkage. Existing local-only/no-run execution can retain an independent host invocation identifier, but it must not pretend an `ana_runs` row exists. No automatic orphan replay or durable job resume is added.

## Replay boundary

There are three different replay scopes:

1. **Same host execution, later tool round.** Both hosts carry all earlier `loopMessages` forward. Revalidate all tracked source-bearing segments still present, not only this round's transient `readReceipts`. Persist source-to-message segment mapping when first staged; use that server registry for the next manifest. A revoked/changed/withdrawn source gets a safe replacement in the new request and a withdrawal/replacement event; earlier immutable records stay unchanged. Do not locate arbitrary source context by trusting JSON in old text, permissive regexes or user-written tool-output frames.
2. **New conversation turn.** Current server history loaders primarily replay saved user/assistant prose. Those strings can quote earlier evidence, but they carry no reliable source-span receipt association. `history-window.ts` already discloses that conversation excerpts are not independently verified scientific/regulatory evidence. Do not mint new exact-source coverage from historic prose or body-supplied history. Browser history remains untrusted context. Broad semantic redaction of all prior prose/memory is a separate product/authorization increment.
3. **Process restart or resumed run.** Current `ana_runs` fails stale/orphaned executions and does not reconstruct earlier source manifests. A new execution needs a new hostInvocationId, fresh actor/source checks and explicit parent linkage. Persisted completed observations may be inspected, not replayed into new qualification automatically. Old `prepared`/intent-only calls remain unknown/stale rather than being promoted by time or by a later response.

The smallest defensible implementation can qualify the new current-round durable snapshots and host checkpoints first, explicitly labelling prior source replay unqualified. If the desired completion claim is **all source context in each follow-up host input is currently authorized/exact**, same-execution tracked replay revalidation is a dependency of that claim and must ship with it. A shared helper/manifest representation should serve both hosts, so their replay policies cannot drift.

Current-round withdrawal cannot remove source text already sent in an earlier call. No continuous revocation or provider cache-erasure guarantee is claimed. Turning off a local prompt-cache marker does not prove removal from a provider's earlier processing/cache; existing tenant placement/retention policy remains the governing mechanism.

## Suggested bounded ownership and acceptance probes

- Durable storage owner: canonical candidate/event/checkpoint store, idempotency/fence, tenant export/purge/immutability and exact range coverage reducer.
- Host lifecycle owner: one shared preparation/staging/invocation/observation adapter, private manifest hashing and same-execution tracked replay; narrow two-host call sites only.
- Tool/read owner: server candidate IDs/snapshot preparation and precise coverage/receipt-status envelope; no new tool or facts accepted from a body.
- Independent proof owner: deterministic fixture expectations, actual registered handlers/two host paths, real owned PostgreSQL role/race/commit-uncertainty evidence. Timeline/turn-record changes follow the selected contract rather than becoming a separate receipt authority.

Proposed fail-first controls, not executed in this preparation:

1. A result is prepared but budget-replaced/cancelled: no staged/call coverage; exact prepared history remains.
2. Same byte hash and same-length re-extraction before staging or later replay: exact digest failure withdraws context and keeps old facts immutable.
3. Revocation after round 1 but before round 2: previous tracked source sentinel never enters the new invocation; valid unrelated context remains or named conservative refusal follows the contract.
4. A stream pause/steer changes final messages: staged host hash matches the final private request, including frame escaping; prior result digest remains distinct.
5. Cancellation before/inside checkpoint await, during route, after partial response and before terminal append: no accepted state resurrection; partial/unknown observations are truthful.
6. Gateway deterministic return, policy-redaction and scripted fallback: host response observed is distinct from provider-byte/service proof; a route ID is not one SDK attempt.
7. Exact duplicate candidate/event writes, conflicting duplicate key, two owner races and COMMIT acknowledgement loss: one durable fact or named conflict/uncertainty, without duplicate model calls.
8. Crash after prepared/staged/intent-only event and turn-record failure: durable facts survive independently; missing response/checkpoint/ledger is not silently promoted.
9. Actor/viewer ordinary INSERT denial and storage unavailable: read permission remains valid while durable qualification stays unrecorded; typed source refusal still withdraws queued context.
10. Foreign thread/run/receipt IDs, forged result lifecycle fields or copied browser tool frames: no source grant/qualification or text disclosure from a self-attesting payload.

Root publishes the chosen exact DTO/state reducer, retention decision, flags and ownership before implementation. This preparation grants no permission to enable the durable path, migrate/deploy, call a live provider, replay client history or repair a client record.
