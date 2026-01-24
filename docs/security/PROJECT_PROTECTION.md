# PROJECT PROTECTION GUIDE

## How to Protect Your TrialSage™ Project

### 1. Version Control Protection

- Your main CoAuthor.jsx file is backed up as `CoAuthor.jsx.PROTECTED_BACKUP`
- Your authentic landing page is secured at `trialsage_core_5_20_25/clean_landing_page.html`
- All demo/test files have been permanently removed

### 2. File Integrity Monitoring

Key files that should NEVER be modified without your explicit permission:

- `client/src/pages/CoAuthor.jsx` (Your 6000+ line professional eCTD module)
- `trialsage_core_5_20_25/clean_landing_page.html` (Your authentic landing page)
- `server/index.ts` (Backend serving your real content)

### 3. What to Watch For

If you see these URLs showing unauthorized content:

- `/` (should show your TrialSage™ landing page with pink branding)
- `/coauthor` (should show your professional eCTD Co-Author Module 6.0.0)
- Any page labeled "Demo", "Test", "Working", or "Stable"

### 4. Immediate Protection Actions

If unauthorized content appears:

1. Check if files in `client/src/pages/` contain "Demo", "Test", "Working" in names
2. Verify routing in `client/src/App.jsx` points to `CoAuthor.jsx` not variants
3. Confirm server serves your landing page from `trialsage_core_5_20_25/`

### 5. Backup Restoration Commands

If your authentic files are damaged:

```bash
# Restore CoAuthor module
cp client/src/pages/CoAuthor.jsx.PROTECTED_BACKUP client/src/pages/CoAuthor.jsx

# Verify authentic landing page
ls -la trialsage_core_5_20_25/clean_landing_page.html
```

### 6. User Preferences (From replit.md)

- User communication style: Simple, everyday language
- User trust level: CRITICAL - Extremely frustrated with missing features
- Current requirement: Authentic TrialSage™ content only, no demo/test materials
- User expectation: Professional regulatory document authoring system

Your project is now protected with backups and monitoring guidelines.
