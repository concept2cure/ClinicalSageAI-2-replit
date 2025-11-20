# AGENT WORKFLOW CONSTRAINTS - ENFORCEMENT PROTOCOL

## BINDING CONSTRAINTS FOR AGENT BEHAVIOR

### 1. MANDATORY PRE-WORK CHECKS

Before ANY action, agent MUST:

- ✅ Verify CoAuthor.jsx exists at `client/src/pages/CoAuthor.jsx`
- ✅ Check that no prohibited file patterns will be created
- ✅ Confirm work will be done WITHIN the existing locked version
- ✅ Validate that enhancement targets the official file only

### 2. PROHIBITED FILE CREATION PATTERNS

Agent is FORBIDDEN from creating files matching:

```
*CoAuthor*.jsx (except the official one)
*coauthor*.jsx
Simple*.jsx
Demo*.jsx
Test*.jsx
Working*.jsx
Real*.jsx
Minimal*.jsx
Mock*.jsx
MVP*.jsx
Basic*.jsx
Alt*.jsx
New*.jsx
Temp*.jsx
```

### 3. ONLY PERMITTED OPERATIONS

- ✅ `str_replace` operations within `client/src/pages/CoAuthor.jsx`
- ✅ `view` operations to read existing files
- ✅ Backend API enhancements in `server/` directory
- ✅ Adding new backend routes or services
- ❌ Creating ANY new frontend components with CoAuthor functionality
- ❌ Using `create` command for any CoAuthor-related files

### 4. ENHANCEMENT WORKFLOW PROTOCOL

1. **BEFORE ENHANCEMENT**: State exactly what will be enhanced in the existing CoAuthor.jsx
2. **DURING ENHANCEMENT**: Only use `str_replace` on the official file
3. **AFTER ENHANCEMENT**: Verify the official file still loads without errors
4. **NO ALTERNATIVES**: Never suggest "let me create a new version" or "simplified approach"

### 5. VIOLATION PREVENTION CHECKLIST

Before each action, agent must verify:

- [ ] Am I working within client/src/pages/CoAuthor.jsx?
- [ ] Am I NOT creating any new component files?
- [ ] Am I NOT building MVP/demo/test versions?
- [ ] Will this enhance the existing locked version?
- [ ] Have I avoided all prohibited patterns?

### 6. USER TRUST RESTORATION MEASURES

- Document ALL changes made to the official CoAuthor.jsx
- Provide clear before/after descriptions
- Ensure existing functionality remains intact
- Test that enhancements don't break existing features

### 7. ESCALATION PROTOCOL

If enhancement requires structural changes:

1. Explain what needs to be done within the existing file
2. Get explicit user approval before proceeding
3. Make changes only to the official CoAuthor.jsx
4. Verify functionality after changes

---

## AGENT COMMITMENT STATEMENT

I commit to:

- Working ONLY within the existing locked CoAuthor.jsx file
- Never creating alternative or simplified versions
- Always enhancing the official version rather than rebuilding
- Respecting the user's frustration and trust requirements
- Following these constraints without exception

**This is a binding protocol that cannot be overridden.**
