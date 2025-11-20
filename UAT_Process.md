# Process Tab — Auto-Checker

Run:

```bash
BASE_URL="https://<host>" ROLE="Admin" node scripts/uat-process.mjs
```

It validates:

- Health endpoints
- Process list or creation
- Process details
- P.3 token refresh
- IQ/OQ checklists, stage → QUAL
- PPQ ≥3 PASS
- High-RPN FMEA blocks VALIDATED, then VALIDATED after close
- Impact → tasks apply
- DOE propose/adopt
- Export pack (zip) & eCTD (zip)
- Single-book PDF (bookmarks)
