# CMC audit remedies — contract, 2026-10-14

Scope: F04 (change-classifier convergence), F10 (register propagation recovery), F21 (reachable dossier navigation). The launch composition remains small-molecule Module 3 for a US IND.

* Production/unknown launch scope refuses postapproval and multi-market variation assessment by name. When the server explicitly disables launch enforcement, the deferred assessment uses the existing deterministic `/api/cmc/variations/classify` endpoint, its real inputs and its FDA/EMA outputs; no browser risk-to-filing classifier survives.
* A register save and its Module 3 link are separate outcomes. Every UI save consumes `module3Linked`/`module3Warning`. A missing or outdated link remains visible across reloads because `/api/cmc/module3-os/register-links/:projectId` compares stored register rows with canonical source hashes using the existing mappers. No new table or migration is required.
* Recovery posts only a register key and saved record id. The server reads the owned, program-filed row and reprojects it through the same canonical writer, with the authenticated actor. It accepts no source payload, never changes a register or a signature, and cannot link another program's record. The pending state clears only after a successful canonical write/read.
* The CMC dossier controls open the existing Module 3 build tab in the current program; they do not route into the off-catalog `dossier` surface. Existing Authoring and Submission actions remain available.

Regression evidence must cover refused live classifications, canonical deferred dispatch, save/link outcome separation, recovery after reload, foreign/unfiled record refusal, actor attribution, failed retry retention and reachable build navigation. No deployment is authorized by this work.
