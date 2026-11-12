# S4 · Anna runtime Phase 0, check 2: the provider key across whole AnA turns (2026-11-12)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k` (P-105). Plan §1d, expanded spike, check 2 (§19.1): credential custody.
This is the S4 item the joined run of 2026-11-09 left open: "the canary in a whole turn: the stream's assembled
prompt bundle and its turn record."

**Verdict for check 2: in six real turns the key was used on every provider call and was found in none of the
places searched. Phase 0 as a whole stays "acceptance pending". What this does not cover is listed at the end.**

## What already exists

- The path walked: `server/routes/ana-ri/stream.ts` (the turn), `server/services/ana/sub-agent.ts` (`run_agent`),
  `server/services/ai-gateway/**` (the provider call), `server/services/ana/turn-record.ts` (the turn's record).
- Already proven for a tenant's own captured credential, at the client: one canary, one real request through
  `createTenantProviderClient`, the key in that request's Authorization header and in no body, result, error, log,
  audit row or export (`connector-credentials-stored-unvalidated.pglite.test.ts`, `2c54da8f34`, `4d99bddc52`).
- Nothing in the product changed here. This is a walk and a search.

## What was done

The real server, on a real PostgreSQL with RLS on, in a real browser, as on 2026-11-09
(`../2026-11-09-claude-path-walk/`). Two things are specific to this walk.

- **The canary is the server's own provider key.** `ANTHROPIC_API_KEY` was set to a random 59-character marker, and
  the provider is a local stand-in (`mock-canary.cjs.txt`). So no call reached Anthropic, and the marker is not a
  real key. The stand-in records every request body in full, and the key header only as a length and a SHA-256.
- **A control proves the search can see.** In the last turn a person types a second random marker into the
  composer. It must then be found where the canary must not be.

Six turns, each making the app run one tool and send its result back to the provider (`walk-canary.cjs.txt`):

| Turn | Tool the stand-in asked for | What happened (`provider-requests.summary.txt`) |
|---|---|---|
| 1 | `describe_capabilities` | Ran; its result went back to the provider |
| 2 | `get_org_capabilities` | Not offered on that call, so it did not run |
| 3 | `list_app_screens` | Ran |
| 4 | `global_search` for "api key" | Ran; 0 hits |
| 5 | `run_agent` | Ran: the child made two calls of its own on `claude-opus-5-5`, and its own `run_agent` was refused `SUB_AGENT_READ_ONLY` |
| 6 | `list_app_screens`, with the control typed in the question | Ran |

Then `search.cjs.txt` searched five places for the canary and for the control (`results.json`).

## Result

| Place | The canary | The control |
|---|---|---|
| The body of every provider request, 13 of them: the assembled prompt, the tool results, the child's prompts | 0 | 4 |
| Everything the browser sent or received (HAR) | 0 | 2 |
| A dump of the whole database after the walk (11 MB) | 0 | 3, in `chat_messages` and `ana_record_blobs`, the turn record's store |
| The server's log (40,899 lines) | 0 | 0 |
| The walk's own log | 0 | 0, by construction: it is written as `<CONTROL>` |

- **The use succeeded.** All 13 requests carried the key header, and its SHA-256 is the canary's.
- **A masked or re-encoded copy was also looked for:** the canary's random part alone, and its base64. 0 everywhere.
- **The server's log has no control.** The log does not carry what a person types, so the control cannot show that
  search working. What shows the log was read: its start line was found once.

## What this does not cover

- **A tenant's captured credential in a whole turn.** The canary here is the platform's key from the environment.
  The secure surface for a tenant's credential asks for a password and a second factor, which this local walk does
  not have. That path is proven at the client, not in a turn.
- **Every tool.** Four tools ran, one of them twice, of the 790 registered. A tool that returned a credential would put it in the prompt: nothing
  between a tool and the model removes one. The control is that tools do not return them. On 2026-11-12 another
  session found and closed one such path, the organization settings read (`c531350079`).
- **`get_org_capabilities` did not run.**
- **A credential that fails.** The provider's refusal of a bad key was not walked here. The client-level case covers
  the error a refused key produces.
- **The per-use event.** A credential-use event naming the grant, the action and the submission is S5's open item
  for gateway-account transmits, as on 2026-11-09.
- **An encrypted copy.** The search is of plain text, the canary's random part and its base64.

## Files

`results.json` (counts and hashes; neither marker's value is in any file here), `provider-requests.summary.txt`,
`walk-canary.log.txt`, and the three scripts. The provider's full request log, the HAR and the database dump were
searched and not kept. In `walk-canary.log.txt` each entry's label is which of the script's waits resolved first, and
is not a verdict (see `../2026-11-09-claude-path-walk/README.md`, "Reading the logs").
