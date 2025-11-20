# TrialSage Cleanup Strategy

## IMMEDIATE DELETIONS (Safe to remove)

1. All backup directories except `backups/` (keep most recent only)
2. All `temp_*` directories
3. All `*_restore/` directories
4. Duplicate client structures
5. Unused Python environments

## CONSOLIDATION TARGETS

1. Merge all Python code into `/server/`
2. Centralize all scripts into `/scripts/`
3. Single client structure in `/client/`
4. Single shared utilities in `/shared/`

## RETENTION (Keep these)

- `/client/` (main)
- `/server/` (main)
- `/public/`
- `/shared/`
- `/scripts/` (essential only)
- Root config files
