# AGENT BUILD CONSTRAINTS - HARD ENFORCEMENT

## ABSOLUTE PROHIBITIONS

### 1. eCTD Co-Author Module

- **LOCKED FILE**: `client/src/pages/CoAuthor.jsx`
- **STATUS**: PRODUCTION LOCKED - NO MODIFICATIONS PERMITTED
- **PROHIBITION**: Agent is FORBIDDEN from creating ANY alternative CoAuthor implementations
- **INCLUDES**: No Simple*, Demo*, Test*, Working*, Real*, Minimal*, or any variant CoAuthor files
- **ENFORCEMENT**: Hard-coded version lock active via COAUTHOR_HARDLOCK.js

### 2. Prohibited Actions

- ❌ Creating new CoAuthor files or components
- ❌ Building "simplified" or "minimal" versions
- ❌ Recreating or rebuilding existing CoAuthor functionality
- ❌ Making unauthorized modifications to CoAuthor.jsx
- ❌ Creating demo, test, or placeholder CoAuthor alternatives
- ❌ Bypassing the locked version system

### 3. Required Agent Behavior

- ✅ ONLY work within the existing locked CoAuthor.jsx file
- ✅ Must request explicit permission before ANY CoAuthor modifications
- ✅ Must verify version lock integrity before proceeding
- ✅ Must respect the single source of truth principle
- ✅ Must maintain all existing functionality

## ENFORCEMENT MECHANISMS

### Version Control Files

- `ECTD_COAUTHOR_VERSION_CONTROL.md` - Official version registry
- `CoAuthor.jsx.VERSION_LOCK` - Lock marker file
- `COAUTHOR_HARDLOCK.js` - Runtime enforcement script
- `AGENT_BUILD_CONSTRAINTS.md` - This constraints file

### Build Process Protection

- Automated integrity checking on startup
- Hash verification of official CoAuthor.jsx
- Prohibition of alternative file creation patterns
- Runtime blocking of unauthorized implementations

## USER TRUST REQUIREMENTS

The user has explicitly stated:

> "we can not proceed until this version is hard coded and you are not allowed to build outside of this"

This constraint is ABSOLUTE and NON-NEGOTIABLE.

## VIOLATION CONSEQUENCES

Any attempt to create alternative CoAuthor implementations will:

1. Violate explicit user instructions
2. Break user trust permanently
3. Compromise the locked production system
4. Result in immediate constraint violation

---

**AGENT ACKNOWLEDGMENT REQUIRED**: This agent understands and will comply with these absolute constraints. No exceptions permitted.
