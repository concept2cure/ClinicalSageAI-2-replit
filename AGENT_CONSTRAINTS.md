# AGENT PROTECTION CONSTRAINTS

## CRITICAL RULES - NEVER VIOLATE THESE

### 1. PROTECTED FILES - NEVER MODIFY WITHOUT EXPLICIT PERMISSION

- `client/src/pages/CoAuthor.jsx` - Your 6000+ line professional eCTD module
- `trialsage_core_5_20_25/clean_landing_page.html` - Your authentic landing page
- `replit.md` - Project documentation (only add to changelog, never modify existing content)

### 2. FORBIDDEN ACTIONS

- ❌ NEVER create new versions of existing files (CoAuthor_Clean, CoAuthor_Fixed, etc.)
- ❌ NEVER recreate or rebuild existing components from scratch
- ❌ NEVER create demo, test, or placeholder content
- ❌ NEVER modify core routing in App.jsx without explicit request
- ❌ NEVER suggest "starting over" or "rebuilding"

### 3. ALLOWED ACTIONS ONLY

- ✅ Fix specific bugs you're asked to fix
- ✅ Add new features to existing files when requested
- ✅ Update documentation in changelog section only
- ✅ Install packages if needed for functionality
- ✅ Fix import/syntax errors that break the app

### 4. WORKFLOW CONSTRAINTS

- Must ask "What specific issue should I fix?" before making any changes
- Must identify the exact file and line number for any modification
- Must show the minimal change needed before implementing
- Must never suggest alternatives unless the current approach is broken

### 5. COMMUNICATION RULES

- Focus on ONE specific task at a time
- Ask for permission before any file modifications
- Report what was actually changed, not what "could be improved"
- Never propose architectural changes unless explicitly requested

### 6. PROJECT RESTORATION COMMANDS

If agent damages anything, user can restore with:

```bash
# Restore main module
cp client/src/pages/CoAuthor.jsx.PROTECTED_BACKUP client/src/pages/CoAuthor.jsx

# Check file integrity
ls -la client/src/pages/CoAuthor.jsx
ls -la trialsage_core_5_20_25/clean_landing_page.html
```

### 7. ESCALATION PROTOCOL

If user says "stop", "that's wrong", or shows frustration:

1. IMMEDIATELY stop all modifications
2. Ask what specific issue needs fixing
3. Wait for explicit permission to proceed
4. Make only the minimal change requested

## USER PREFERENCES (From replit.md)

- Communication: Simple, everyday language
- Trust level: CRITICAL - User extremely frustrated with destructive changes
- Requirement: Authentic TrialSage™ content only, no demo/test materials
- Expectation: Professional regulatory document authoring system that works

**VIOLATION OF THESE CONSTRAINTS WILL RESULT IN PROJECT DAMAGE**
