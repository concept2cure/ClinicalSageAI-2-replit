# Support — Concept2Cure connector for Claude

* **Support contact:** support@concept2cure.com (to be confirmed by the founder
  before directory submission; the platform's transactional mail already uses
  the concept2cure.com domain).
* **Documentation:** `docs/connector/README.md` (served at
  `<MCP_PUBLIC_URL>/concept2cure/connector` once the docs route is published;
  the metadata documents already advertise that URL as
  `service_documentation` / `resource_documentation`).
* **Status and incidents:** the platform readiness endpoint `/readyz`; the
  connector reports `MCP connector mounted` at boot with its resource and
  issuer URLs.
* **Security reports:** security@concept2cure.com (to be confirmed). Report
  token or tenant-isolation findings here, not in public trackers.

## Common questions

**The client says "invalid_token".** The bearer was rejected by the platform's
verifier: expired, wrong secret rotation window, a refresh/MFA token used as an
access token, an audience for a different deployment, or the user is no longer
a member of the organisation. Re-run the OAuth flow.

**A tool returned an error that reads like a platform message.** That is the
platform's refusal, verbatim: no licence, no provider key, a locked sequence,
a document outside your organisation. The connector does not work around
refusals; fix the cause in the app.

**Why can't the connector sign or dispatch?** By design. Freeze, release
signature and transmission are Part 11 governed actions performed by a named
person in Submission Center. The connector's only write files a draft leaf for
that review.

**Claude returned a number the tool did not.** Report it: the server
instructions tell the model to relay engine outputs verbatim, and the audit
row for the call shows exactly what the tool returned.
