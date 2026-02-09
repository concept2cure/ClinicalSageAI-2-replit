# Phase 6 Completion Checklist

**Purpose**: Track remaining work to bring Phase 6 from 70% → 100%  
**Last Updated**: 2026-02-09  
**Target**: GA-ready DOCX Factory

---

## 🔴 CRITICAL — Must Have for GA

### 1. PDF Conversion Implementation
**Status**: ❌ Not Started  
**Priority**: P0 (Blocker)  
**Effort**: 2-3 days  
**Owner**: Backend Team

**Tasks**:
- [ ] Add LibreOffice headless to Docker image
  - [ ] Update `Dockerfile` with `libreoffice --headless` install
  - [ ] Test LibreOffice CLI from container: `libreoffice --headless --convert-to pdf test.docx`
- [ ] Create `PDFConverter` service in `shadow_service/shadow_service/`
  - [ ] File: `pdf_converter.py`
  - [ ] Function: `async def convert_to_pdf(docx_bytes: bytes) -> bytes`
  - [ ] Use subprocess to call `libreoffice --convert-to pdf`
  - [ ] Return PDF bytes
- [ ] Update `docx_renderer.py` to optionally produce PDF
  - [ ] Add `output_format` param to `render_document()`
  - [ ] If `output_format='pdf'`, call PDFConverter after DOCX render
  - [ ] Store both DOCX and PDF artifacts
- [ ] Update `router_docx_factory.py`
  - [ ] Add `output_format` query param to `POST /renders`
  - [ ] Add `GET /artifacts/{id}/pdf` endpoint for PDF download
- [ ] Update UI hooks
  - [ ] Add `output_format` to `useCreateRender` params
  - [ ] Add PDF download option to UI
- [ ] Test end-to-end
  - [ ] Create render with `output_format='pdf'`
  - [ ] Download PDF artifact
  - [ ] Verify formatting preserved

**Acceptance**:
- [ ] User can select DOCX or PDF when creating render
- [ ] PDF artifact downloadable from UI
- [ ] PDF preserves DOCX formatting (headings, tables, images)
- [ ] PDF size < 2x DOCX size
- [ ] No memory leaks in LibreOffice subprocess

---

### 2. eCTD XML Export Packaging
**Status**: ❌ Not Started  
**Priority**: P0 (Blocker)  
**Effort**: 1-2 weeks  
**Owner**: Regulatory Compliance Team

**Tasks**:
- [ ] Research FDA eCTD spec 2.0
  - [ ] Download spec from FDA website
  - [ ] Identify required XML structure
  - [ ] Identify required metadata fields
- [ ] Create `ExportPackager` service
  - [ ] File: `shadow_service/shadow_service/ectd_packager.py`
  - [ ] Function: `async def create_ectd_package(program_id, artifact_ids) -> bytes`
  - [ ] Generate XML index file
  - [ ] Bundle artifacts into ZIP
  - [ ] Compute package hash (Trust Rails)
- [ ] Add `/export/ectd` endpoint to `router_docx_factory.py`
  - [ ] `POST /export/ectd`
  - [ ] Request body: `{ program_id, artifact_ids[], metadata }`
  - [ ] Response: ZIP download with eCTD structure
- [ ] Add UI Export Wizard
  - [ ] File: `client/src/components/docx-factory/ExportWizard.tsx`
  - [ ] Step 1: Select artifacts to include
  - [ ] Step 2: Fill eCTD metadata (sponsor, date, submission type)
  - [ ] Step 3: Review package contents
  - [ ] Step 4: Download ZIP
- [ ] Integrate with orchestration
  - [ ] Register export as workflow step
  - [ ] Emit `export_completed` event
  - [ ] Store `release_hash` in audit log
- [ ] Test against FDA validator
  - [ ] Download FDA eCTD validator tool
  - [ ] Generate sample package
  - [ ] Run validator, fix errors

**Acceptance**:
- [ ] User can export multiple artifacts as eCTD package
- [ ] ZIP contains valid XML index file
- [ ] ZIP passes FDA eCTD validator
- [ ] Package has immutable `release_hash`
- [ ] Export recorded in audit trail

---

## 🟡 MEDIUM — Should Have for Pilot

### 3. Document Preview
**Status**: ❌ Not Started  
**Priority**: P1  
**Effort**: 3-5 days  
**Owner**: Frontend Team

**Tasks**:
- [ ] Research DOCX → HTML conversion libraries
  - [ ] Option A: mammoth.js (browser-side)
  - [ ] Option B: python-docx + custom renderer (server-side)
  - [ ] Decision: Choose based on accuracy vs. speed
- [ ] Implement server-side preview endpoint
  - [ ] `GET /artifacts/{id}/preview`
  - [ ] Returns HTML + CSS
  - [ ] Preserves basic formatting (headings, tables, lists)
- [ ] Add preview iframe to UI
  - [ ] File: `client/src/pages/DocxFactory.tsx`
  - [ ] Tab 3: "Preview" (optional)
  - [ ] OR: Inline preview in Renders tab
  - [ ] Show "Loading preview..." skeleton
- [ ] Handle edge cases
  - [ ] Large documents (timeout after 10s, show "Download to view")
  - [ ] Complex formatting (show disclaimer: "Preview may differ from Word")
  - [ ] Images (base64 embed or proxy through CDN)

**Acceptance**:
- [ ] User can preview DOCX in browser before download
- [ ] Preview loads in < 5 seconds
- [ ] Headings, tables, lists render correctly
- [ ] Disclaimer shown if complex formatting detected

---

### 4. Version Diff Visualization
**Status**: ❌ Not Started  
**Priority**: P1  
**Effort**: 2-3 days  
**Owner**: Frontend Team

**Tasks**:
- [ ] Research text diff libraries
  - [ ] Option A: `diff-match-patch` (Google)
  - [ ] Option B: `jsdiff`
  - [ ] Decision: Choose based on word-level accuracy
- [ ] Extract text from DOCX artifacts
  - [ ] Server endpoint: `GET /artifacts/{id}/text`
  - [ ] Returns plain text extraction
- [ ] Implement diff algorithm
  - [ ] File: `client/src/utils/docx-diff.ts`
  - [ ] Function: `computeDiff(textA, textB) -> DiffResult[]`
  - [ ] Returns array of `{ type: 'added'|'removed'|'unchanged', text }`
- [ ] Add Diff Viewer component
  - [ ] File: `client/src/components/docx-factory/DiffViewer.tsx`
  - [ ] Side-by-side view (old | new)
  - [ ] Highlight additions in green
  - [ ] Highlight deletions in red
- [ ] Wire into Version Timeline
  - [ ] Add "Compare" button to each version
  - [ ] Modal opens with diff view
  - [ ] Show metadata: version numbers, dates, authors

**Acceptance**:
- [ ] User can compare any two artifact versions
- [ ] Diff highlights added/removed text
- [ ] Diff loads in < 3 seconds
- [ ] UI handles large diffs gracefully (pagination or scroll)

---

### 5. Template Upload File Picker UI
**Status**: ⚠️ Partial (API exists)  
**Priority**: P1  
**Effort**: 1 day  
**Owner**: Frontend Team

**Tasks**:
- [ ] Add file picker to Templates tab
  - [ ] File: `client/src/pages/DocxFactory.tsx`
  - [ ] Button: "Upload Template"
  - [ ] Opens modal with file input
- [ ] Implement upload flow
  - [ ] User selects .docx file
  - [ ] Compute SHA-256 in browser (use `computeSHA256` from hooks)
  - [ ] Upload to blob store via BFF
  - [ ] Create template version record
- [ ] Add validation
  - [ ] Check file type is `.docx`
  - [ ] Check file size < 10MB
  - [ ] Show error if validation fails
- [ ] Show upload progress
  - [ ] Progress bar during upload
  - [ ] Success message on completion
  - [ ] Template appears in list immediately

**Acceptance**:
- [ ] User can upload custom .docx template from UI
- [ ] File size and type validated before upload
- [ ] SHA-256 computed and displayed
- [ ] New template version appears in list after upload

---

### 6. Orchestration Workflow Integration
**Status**: ❌ Not Started  
**Priority**: P1  
**Effort**: 2-3 days  
**Owner**: Orchestration Team

**Tasks**:
- [ ] Review existing `docx_gen` workflow template
  - [ ] File: Check seed data in Phase 4
  - [ ] Understand current 2-step pipeline
- [ ] Implement `document_gen` step handler
  - [ ] File: `shadow_service/shadow_service/orchestration_runner.py`
  - [ ] Function: `async def handle_document_gen_step(step, context)`
  - [ ] Read `step.config` for template_id + inputs
  - [ ] Call `docx_renderer.render_document()`
  - [ ] Write artifact_id to `step_runs.output`
- [ ] Emit step completion event
  - [ ] Event type: `document_generated`
  - [ ] Payload: `{ artifact_id, content_hash, download_url }`
- [ ] Update workflow YAML schema
  - [ ] Add `document_gen` to step type enum
  - [ ] Document config schema: `{ template_id, inputs_mapping }`
- [ ] Test integration
  - [ ] Create workflow with `document_gen` step
  - [ ] Execute workflow
  - [ ] Verify artifact produced
  - [ ] Verify step auto-advances

**Acceptance**:
- [ ] Workflow can include `document_gen` step
- [ ] Step reads inputs from prior step outputs
- [ ] Artifact linked to step_run in DB
- [ ] Workflow auto-advances on render completion

---

## 🟢 MINOR — Nice to Have

### 7. Server-Side Hash Verification Endpoint
**Status**: ⚠️ Client-side only  
**Priority**: P2  
**Effort**: 1 day  
**Owner**: Backend Team

**Tasks**:
- [ ] Add `POST /artifacts/{id}/verify` endpoint
  - [ ] Request body: `{ client_hash }`
  - [ ] Fetch artifact from DB
  - [ ] Compare `client_hash` to `artifact.sha256`
  - [ ] Return: `{ match: true|false, server_hash, mismatch_details }`
- [ ] Add audit log entry
  - [ ] Record verification attempt
  - [ ] Log mismatch events for security review
- [ ] Update UI
  - [ ] Call server verify after download
  - [ ] Show "Verified by server" badge if match
  - [ ] Show "Mismatch detected!" alert if mismatch

**Acceptance**:
- [ ] Server endpoint verifies client-provided hash
- [ ] Verification attempts logged in audit trail
- [ ] UI displays server verification status

---

### 8. Render Failure Notifications
**Status**: ❌ Not Started  
**Priority**: P2  
**Effort**: 1 day  
**Owner**: Backend Team

**Tasks**:
- [ ] Integrate with notification system
  - [ ] On `render_failed` event, emit notification
  - [ ] Payload: `{ render_id, template_name, error_summary }`
- [ ] Add user notification preferences
  - [ ] Allow users to subscribe to render events
  - [ ] Email or in-app notification
- [ ] Update UI
  - [ ] Show toast notification on render completion
  - [ ] Show bell icon with unread count

**Acceptance**:
- [ ] User receives notification when render fails
- [ ] Notification includes error message
- [ ] User can opt in/out of notifications

---

## 🧪 Testing Checklist

### Unit Tests
- [ ] Backend: `shadow_service/tests/test_docx_factory.py` — all pass
- [ ] Backend: `shadow_service/tests/test_docx_renderer.py` — all pass
- [ ] Frontend: `tests/docx-factory-seed.test.ts` — all pass
- [ ] Frontend: `tests/docx-factory-ui.test.ts` — all pass

### Integration Tests
- [ ] End-to-end: Create template → render → download
- [ ] End-to-end: Seed templates → create render with demo pack
- [ ] End-to-end: Upload custom template → render → verify hash
- [ ] End-to-end: Export eCTD package → validate with FDA tool

### Security Tests
- [ ] IDOR: User A cannot access User B's templates/renders/artifacts
- [ ] Auth: Unauthenticated request returns 401
- [ ] RLS: Cross-program queries return 0 rows
- [ ] Hash verify: Tampered artifact detected

### Performance Tests
- [ ] Render 100 documents concurrently (< 10s avg)
- [ ] Download artifact (< 2s for 5MB file)
- [ ] UI polling does not cause memory leaks
- [ ] PDF conversion (< 5s for typical document)

---

## 📋 Definition of Done (GA-Ready)

### Functional Requirements
- [ ] ✅ DOCX rendering works end-to-end
- [ ] ✅ PDF conversion works end-to-end
- [ ] ✅ eCTD export produces valid packages
- [ ] ✅ Document preview loads in browser
- [ ] ✅ Version diff shows changes between versions
- [ ] ✅ Template upload UI functional
- [ ] ✅ Orchestration integration working

### Non-Functional Requirements
- [ ] ✅ All acceptance criteria pass (7/7)
- [ ] ✅ All unit tests pass
- [ ] ✅ All integration tests pass
- [ ] ✅ Security tests pass
- [ ] ✅ Performance tests pass
- [ ] ✅ User documentation complete
- [ ] ✅ API documentation complete
- [ ] ✅ Deployment runbook complete

### Stakeholder Sign-Off
- [ ] ✅ Engineering sign-off
- [ ] ✅ Product sign-off
- [ ] ✅ Regulatory sign-off
- [ ] ✅ Security sign-off
- [ ] ✅ QA sign-off

---

## 🚀 Release Plan

### Week 1-2 (Sprint 1)
- [ ] Implement PDF conversion
- [ ] Add template upload UI
- [ ] Wire orchestration integration
- [ ] Fix test infrastructure
- [ ] Internal QA testing

### Week 3-4 (Sprint 2)
- [ ] Implement document preview
- [ ] Implement version diff
- [ ] Add render failure notifications
- [ ] Integration testing

### Week 5-8 (Sprint 3)
- [ ] Implement eCTD export
- [ ] FDA validator testing
- [ ] Security audit
- [ ] Performance testing
- [ ] User acceptance testing

### Week 9 (Pre-GA)
- [ ] Documentation finalization
- [ ] Deployment preparation
- [ ] Stakeholder sign-off
- [ ] **GO LIVE**

---

**Last Updated**: 2026-02-09  
**Next Review**: Weekly sprint planning  
**For Questions**: See `PHASE6_AUDIT_REPORT.md`
