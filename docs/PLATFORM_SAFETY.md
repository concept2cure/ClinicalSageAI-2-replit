# TrialSage Platform Safety Guide

This document outlines the comprehensive safety system implemented in the TrialSage platform to prevent data loss, protect against system failures, and ensure development stability.

## Safety System Overview

The TrialSage safety system consists of multiple interconnected layers:

1. **Regular Backups** - Full system backups on demand
2. **Component Snapshots** - Individual component versioning
3. **Component Recovery** - Fast restoration of components
4. **Verification Tools** - Code quality and integrity checks
5. **Pre-Commit Safety** - Automated safety sequence before changes
6. **Safety Checklist** - Process documentation for critical changes

## Available Safety Tools

### Backup Tools

- **Full Backup**: `./scripts/backup.sh`
  - Creates a timestamped archive of critical system components
  - Stores backups in the `/backups` directory
  - Includes file inventory for reference

### Component Snapshot System

- **Create Snapshot**: `./scripts/create_component_snapshot.sh [component_path]`
  - Creates a versioned copy of a specific component
  - Useful before making significant changes
  - Example: `./scripts/create_component_snapshot.sh client/src/components/cer/GSPRMappingPanel.jsx`

### Recovery Tools

- **Component Recovery**: `./scripts/recover_component.sh [component_path] [version]`
  - Lists available snapshots for a component
  - Restores a component to a specific version point
  - Creates backup of current version before restoration
  - Example: `./scripts/recover_component.sh client/src/components/cer/GSPRMappingPanel.jsx 20250508142731`

### Verification Tools

- **Component Verification**: `./scripts/verify_components.sh`
  - Checks for syntax errors in JavaScript/JSX files
  - Identifies common coding issues
  - Scans for duplicate declarations
  - Validates balanced brackets and parentheses

### Pre-Commit Safety System

- **Safety Sequence**: `./scripts/pre_commit_safety.sh [component_path]`
  - Runs all safety checks in sequence
  - Creates a detailed safety report
  - Provides clear go/no-go guidance for changes
  - Example: `./scripts/pre_commit_safety.sh client/src/components/cer/GSPRMappingPanel.jsx`

## Recommended Safety Procedures

### For Routine Development

1. Create component snapshots before changes
2. Run verification after changes
3. Document significant changes

### For Critical Component Changes

1. Run the full pre-commit safety sequence
2. Review the safety report
3. Proceed only if all checks pass
4. Create a new snapshot after successful changes

### For Emergency Recovery

1. Identify available recovery options using `./scripts/recover_component.sh [component_path]`
2. Restore from the most recent working snapshot
3. Verify system functionality after recovery
4. Document the incident and recovery process

## Safety System Directory Structure

- `/backups` - System backup archives
- `/snapshots` - Component version snapshots
- `/safety_logs` - Safety reports and logs
- `/scripts` - Safety tools and utilities
- `/docs` - Safety documentation

## Best Practices

1. **Create Regular Backups**: Run `./scripts/backup.sh` daily during active development
2. **Snapshot Before Changes**: Always snapshot components before significant modifications
3. **Verify After Changes**: Run verification checks after completing changes
4. **Review Safety Reports**: Read safety reports carefully before proceeding with changes
5. **Document Recovery Actions**: Keep notes of any recovery procedures used

---

_These safety measures are designed to protect the TrialSage platform against accidental data loss, code corruption, and system failures. By following these procedures consistently, we can maintain system integrity throughout development._
