# SECURITY-9: an audit export is of one organisation, never of every tenant

Review: `../../security.md`, SECURITY-9. Its provisional number there (DP-61) collides with the
register's DP-61, which is a different finding.

## The finding

- `GET /api/audit/export` and `/export/signed` accepted an organisation id of 0, because
  `requireAuthedOrgId` accepts any finite number.
- The `audit_events` read in `signedAuditExport.ts` dropped its organisation filter when the id was
  falsy, so it would export every tenant's events.
- `snapshotChainIntegrity` did the same.

This is latent, not live: a session cannot resolve to organisation 0 today (`server/auth.ts` requires
a membership row).

## What changed

- `routes/audit-trail-routes.ts` `requireAuditOrg`: every audit-trail route refuses an organisation
  that is not a positive integer (`usableOrgId`), with a 403, before any read.
  - `requireAuthedOrgId` itself is unchanged. `authedOrgId.ts` documents that other callers rely on it.
- `services/audit/signedAuditExport.ts`:
  - `generateSignedAuditExport` refuses an unusable id before anything is read or recorded;
  - the `audit_events` filter is unconditional;
  - `snapshotChainIntegrity` takes a required organisation and always filters on it.

## Shown failing first

`red-cases-on-previous-code.txt`: four new cases, each failing on the previous code.
- **Route:** organisation 0 is refused on both exports and the log read, with no database call.
- **Service:** organisations 0, -1 and undefined are refused, with no export row recorded.
