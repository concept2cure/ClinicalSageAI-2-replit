# Gateway capability and verified-receipt integration — X01/X02/D7

All work is local on 2026-10-14. There was no live agency submission,
credential issuance, provider transaction or deployment.

## Connected behavior

Gateway discovery, account settings and sequence prechecks now return independent
credential and transport-readiness facts. The UI names credentials as configured,
shows qualification as not verified, and does not ask for a signature when a
known transport is unavailable. AnA receives the same facts. Installed transport
code and offline tests do not mark a gateway agency-qualified.

The eight known unsourced regional adapters are refused in canonical `getGateway`
before package access, database creation or wire work; the typed refusal releases
never-sent sequence claims. This enforces their pre-existing market-support
`channel:none` status rather than silently posting an invented wire contract.
Eight added cases failed first. The FDA market-support text now reflects actual
CMS engineering and missing environment-specific UAT rather than claiming the
new signed/encrypted implementation is still plaintext.

The existing MDX namespace exposes POST
`/api/mdx/gateways/transmittals/:id/as2-receipt`, guarded by the canonical
organization write permission before an 8 MB bounded multipart parser. The parser
restores the exact tenant scope captured before upload parsing. The route passes
strict positive authenticated actor/organization identifiers, the named transmittal,
original file bytes and original Content-Type header to the one receipt service.
A user cannot choose its disposition, ACK stage, target organization or signer.

The FDA ESG log offers Record agency MDN through the canonical `apiUpload`
helper. It refreshes recorded status only after an explicit verified+recorded
known outcome, shows legitimate signed agency refusals, preserves server errors,
and treats missing/unknown results as unknown. It distinguishes an unreconciled
sequence attempt from a successfully recorded receipt and never calls an MDN
FDA center acceptance. Cryptography/tenant persistence are covered by the AS2
owner's separate evidence; endpoint/component tests mock those boundaries.

Receipt timestamps preserve unknown as null. A generated platform summary has a
separate generatedAt; optional response headers distinguish these times. No
download-time timestamp is invented as agency receipt.

## Exact attempt binding

`migrations/20261014_ectd_transmit_attempt_binding.sql` adds nullable
`ectd_sequences.transmit_signature_action_id` and a true per-claim
`transmit_attempt_id` UUID. Each claim generates a fresh server UUID. The signature already verified for
this sequence and that UUID are stored atomically when claiming the send. The
claim locks the sequence, then re-reads the canonical signature-spent ledger in
a fresh statement on that same connection before claiming. Proven pre-wire
release matches and clears both bindings; normal post-send resolution also
matches both. Ambiguous remote delivery retains the claim.

Canonical sequence transmission carries an internal dispatchBinding field with
organization, sequence, verified signature, attempt UUID and package hash. The governed HTTP
transmit request does not forward this field. The gateway guard validates its
facts; FDA row creation removes caller-supplied proof/history/binding metadata
and stamps only the internal binding. The receipt service uses that retained
binding, exact current signature and attempt UUID when reconciling sequence state.
It consumes the signature through the canonical ledger in the same transaction. A valid older
MDN cannot resolve a newer in-flight claim, even when the signature action ID
was reused and the original MDN was re-encoded with a different raw digest; absent/stale legacy bindings remain
explicitly unreconciled. MDN receipt maps only to the existing sent state, never
ACK3/acknowledged center acceptance.

## Evidence

- Official FDA assets: 173/173 across seven actual-template/fill/attachment/
  readiness suites and three exact SHA checks (agency-assets/).
- Gateway/account/receipt contracts and components: **102/102 across eight
  suites**, filed in gateway-receipt-final-green.txt. Earlier combined 84/84 was extended with
  exact-attempt guard, unavailable-precheck and stale-receipt cases.
- Existing actual local mTLS transmit-claim suite: 11/11. Self-signed fixture CA
  is now explicitly configured as TLS_CA_PATH separately from the AS2 recipient
  certificate, and metadata-proof writes return their real success shape. The
  complete received CMS entity length is checked against its declared wire
  length, while decrypted contents are checked by the AS2 crypto suite. The
  previous raw-ZIP length assumption was incompatible with actual encryption.
- Guard + existing claim-refusal contracts: 28/28 before final UI additions.
- Upload parser/API checks: actual write-role guard, original ALS continuation,
  exact bytes/header, typed refusal, strict IDs and 8 MB limit. UI checks include
  non-2xx refusals, transport failure, incomplete 2xx proof, signed refusal and
  unresolved sequence binding. Initial missing control and incomplete proof
  both failed before their respective remedies.
- Targeted lint reports zero errors; the final receipt/gateway files retain one
  pre-existing complexity warning on the governed transmit handler.

## Remaining qualification dependencies

Agency-issued AS2 configuration/certificates, account onboarding, current protocol
confirmation, environment-specific UAT and the resulting verified receipt chain
must be filed before D7 is green. Offline cryptographic fixtures and credentials
are insufficient. The official AS2 guide supplies AES support facts but no center
ACK schemas; no center ACK stage was invented. NextGen REST remains refused until
its published contract is implemented/qualified, and the optional large-bundle
SFTP dependency/protocol is not represented as complete.

DTD/stylesheet acquisition still needs the runbook's documented per-DTD counsel
signoff. PreSTAR PDFs are acquired but mapped-fill automation remains refused
until verified maps/behavior/attachment routing are completed. A complete FDA
recognized-standards export with official product-code associations remains an
asset acquisition dependency. Details and exact source evidence are in
[agency-assets/verification.md](agency-assets/verification.md).
