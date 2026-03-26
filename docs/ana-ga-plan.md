# AnA 1.0 RI — GA Readiness Plan

## Stage 1: Foundation Integrity
**Goal:** Every existing feature works end-to-end without errors.

- [ ] 1.1 Add missing `/api/chat/threads` listing endpoint (conversation persistence)
- [ ] 1.2 Wire chat-context-builder into both /chat and /stream endpoints (eliminate duplication)
- [ ] 1.3 Verify all 39 operational commands resolve their DB tables (create-if-not-exists guards)
- [ ] 1.4 Verify biostats orchestrator + computation engine imports work at runtime
- [ ] 1.5 Verify enrichment queries fail gracefully when tables are empty
- [ ] 1.6 End-to-end test: send message → stream tokens → persist → RIM intercept → done event

## Stage 2: Missing Infrastructure
**Goal:** Fill the gaps between what the UI promises and what the backend delivers.

- [ ] 2.1 File content extraction — uploaded files should be readable, not just metadata
- [ ] 2.2 Thread listing endpoint with project scoping
- [ ] 2.3 Ensure all DB tables from migrations 0000-0010 are created on startup
- [ ] 2.4 Verify authoring-actions endpoints are mounted and responding

## Stage 3: Integration Verification
**Goal:** Every slash command produces a real response with real data.

- [ ] 3.1 Test each slash command category against a project with data
- [ ] 3.2 Verify document type detection matches the right templates
- [ ] 3.3 Verify workflow status computation with real project artifacts
- [ ] 3.4 Verify auto-greet → status briefing flows correctly

## Stage 4: Polish & Hardening
**Goal:** Production-grade error handling, performance, and UX.

- [ ] 4.1 Remaining MEDIUM QA findings (M-1 through M-11)
- [ ] 4.2 Remaining LOW QA findings
- [ ] 4.3 Performance: parallel enrichment, lazy imports, response time targets
- [ ] 4.4 Mobile/touch compatibility

## Stage 5: GA Sign-off
**Goal:** Security, compliance, documentation complete.

- [ ] 5.1 Final security audit (tenant isolation, auth, XSS)
- [ ] 5.2 21 CFR Part 11 audit trail verification
- [ ] 5.3 Skill files updated to final state
- [ ] 5.4 GA readiness report
