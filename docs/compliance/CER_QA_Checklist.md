# TrialSage CER Generator - QA Checklist

## Overview

This document provides a comprehensive checklist for Quality Assurance testing of the Clinical Evaluation Report (CER) Generator module. Before presenting to stakeholders or releasing for user testing, ensure all criteria below are verified.

## Pre-verification Requirements

- Application must be running locally or on a testing environment
- Database access must be available for API calls
- Test user credentials (if applicable) should be ready

## Verification Process

### 1. Navigation & Entry

- [ ] Sidebar shows "CER Generator" in blue highlight
- [ ] Clicking it routes to /cer
- [ ] Page loads without console errors
- [ ] CERV2Page component renders correctly
- [ ] Header displays properly with title and QA Checklist button

### 2. Instructional Flow

- [ ] Instruction card shows all 3 steps:
  - [ ] Select section type and provide context
  - [ ] Generate and add each needed section to your report
  - [ ] Preview and export your complete CER as PDF or DOCX
- [ ] Instructions are clearly visible at the top of the page
- [ ] Text is formatted readably with proper icons

### 3. Section Builder Panel

- [ ] Section type dropdown contains all required options
  - [ ] Executive Summary
  - [ ] Device Description
  - [ ] Risk Analysis
  - [ ] Clinical Evaluation
- [ ] Context textarea accepts input
- [ ] Character counter works (if implemented)
- [ ] "Generate Section" button is properly styled
- [ ] Loading state shows spinner while generating
- [ ] Generated content displays properly formatted
- [ ] "Add to Report" button adds section to draft
- [ ] Appropriate error handling if generation fails

### 4. Live Preview

- [ ] CER title displays at top of preview
- [ ] Title is editable
- [ ] Generated sections render with proper formatting
- [ ] Section headings are clearly differentiated
- [ ] FAERS data table renders correctly (if data available)
- [ ] Comparator products display with risk scores (if available)
- [ ] Preview updates immediately when new section is added

### 5. Export Functionality

- [ ] Export tab UI renders correctly
- [ ] PDF option is selectable
- [ ] DOCX option is selectable
- [ ] Export button is enabled only when content exists
- [ ] PDF export generates downloadable file
- [ ] DOCX export generates downloadable file
- [ ] Exported files contain all sections from preview
- [ ] Exported files have professional formatting

### 6. Backend API Integration

- [ ] /api/cer/fetch-faers API responds with data
- [ ] /api/cer/generate-section creates content with GPT-4o
- [ ] /api/cer/export-pdf generates PDF with content
- [ ] /api/cer/export-docx generates DOCX with content
- [ ] Error handling is implemented for all API calls
- [ ] Console shows no CORS or unauthorized errors

### 7. State Management

- [ ] State persists between tab changes
- [ ] Adding sections updates state correctly
- [ ] Preview reflects current state of all sections
- [ ] Form values maintain consistency
- [ ] No unexpected state resets during user interaction

### 8. Cross-browser Compatibility

- [ ] Verify functionality in Chrome
- [ ] Verify functionality in Firefox
- [ ] Verify functionality in Safari (if available)
- [ ] Mobile view renders appropriately (responsive design)

## Documentation & Reporting

- [ ] Screenshot each major component for documentation
- [ ] Document any issues found during QA
- [ ] Note any future enhancements identified
- [ ] Create final report with pass/fail status

## Stakeholder Review Preparation

- [ ] Prepare demonstration script
- [ ] Create sample CER with realistic data
- [ ] Document known limitations and future enhancements
- [ ] Set up screen sharing for remote presentations

---

## QA Testing Notes

| Test Date  | Tester | Build Version | Status            |
| ---------- | ------ | ------------- | ----------------- |
| YYYY-MM-DD | Name   | v1.0.0        | ✅ Pass / ❌ Fail |

### Issues Found

1. Issue description
   - Severity: (Critical/Major/Minor)
   - Steps to reproduce:
   - Expected behavior:
   - Actual behavior:
   - Screenshots/logs:

### Enhancement Suggestions

1. Enhancement idea
   - Potential value:
   - Complexity estimate:

---

_Note: This is a living document. Update with any additional test cases or requirements as needed._
