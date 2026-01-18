# Sprint 3: Trust & Velocity

## Goal
Make exports auditable, make fixing gaps fast, and make the UI feel premium.

## Scope
- Export events are first-class in Audit Timeline with download + metadata + integrity hashes  
- "Fix what's missing" becomes one click (deep-links from coverage tiles to filtered views)
- Bulk actions remove pain (multi-select + bulk link/unlink/tag/move)
- Modern filter bar + saved views + URL persistence
- Inspector panel = control center for linking with impact preview

## Non-Scope (Future Sprints)
- Claims Matrix 3.0 (evidence-backed XLSX)
- Consensus Standards Navigator
- Outcomes Substantiation scoring
- Co-Author TipTap integration

## Risks
- URL filter persistence may require careful query param handling
- Bulk operations on large datasets need performance testing
- Inspector impact preview calculations could be slow

## Acceptance Criteria

### Backend
- [x] Export endpoints write audit events with full metadata
- [ ] Export records store sha256, sizeBytes, evidenceSetHash
- [ ] Bulk link/unlink endpoints exist and log audit events
- [ ] Export preflight returns structured blockers

### Frontend  
- [ ] AuditTimeline renders rich event cards with download buttons
- [ ] AuditTimeline has filters (action, entity type, date range) with URL persistence
- [ ] Overview tiles deep-link to filtered views (Claims missing evidence, etc.)
- [ ] EvidenceLibrary supports multi-select + bulk action bar
- [ ] Inspector panel shows linking UI + impact preview
- [ ] Filter bar works across all entity views
- [ ] Saved views persist per program

### UX
- [ ] Consistent 8px spacing grid
- [ ] Typography hierarchy (headings, body, captions)
- [ ] Empty states for all lists
- [ ] Loading states for async operations
- [ ] Keyboard shortcuts (Esc closes inspector, Cmd/Ctrl+K for search)

### QA
- [ ] Smoke script passes end-to-end
- [ ] No auth bypasses
- [ ] Upload sanitization verified

## Task Checklist

### Backend Agent
- [ ] Add evidenceSetHash to export creation
- [ ] Create bulk link endpoint `/programs/:programId/evidence-links/bulk`
- [ ] Create bulk unlink endpoint
- [ ] Add export preflight endpoint `/programs/:programId/exports/preflight`
- [ ] Ensure all export endpoints write audit events

### Frontend Agent  
- [ ] Rebuild AuditTimeline with rich event rendering
- [ ] Add filter bar to AuditTimeline (action, entityType, dateRange)
- [ ] Add URL query param persistence for filters
- [ ] Make Overview tiles clickable → filtered views
- [ ] Add multi-select to EvidenceLibrary
- [ ] Add bulk action bar (link, unlink, tag, move, delete)
- [ ] Create Inspector component for evidence/claims/standards/outcomes
- [ ] Add impact preview to Inspector
- [ ] Add filter bar to Claims/Standards/Outcomes views
- [ ] Implement saved views storage (localStorage per program)

### UX Agent
- [ ] Create spacing/typography design tokens
- [ ] Build EmptyState component
- [ ] Build LoadingState component
- [ ] Standardize button styles
- [ ] Add keyboard navigation
- [ ] Accessibility audit (focus states, ARIA labels)

### QA Agent
- [ ] Write smoke test script
- [ ] Test bulk operations at scale
- [ ] Verify audit events for all actions
- [ ] Test export download integrity

### Security Agent
- [ ] Verify all endpoints require org/program auth
- [ ] Test upload filename sanitization
- [ ] Verify path traversal protection
- [ ] Check for exposed credentials in code
