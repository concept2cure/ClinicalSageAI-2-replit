
# REPLIT AGENT ENHANCEMENT DIRECTIVE
## CMC AI-Guided Intelligence Platform Development Protocol

### 🔒 MANDATORY SAFETY PROTOCOLS

**BEFORE ANY DEVELOPMENT WORK:**
1. **STUDY PHASE**: Agent must analyze existing file structure, workflows, and integration points
2. **LOCATION VERIFICATION**: Identify exact enhancement locations within existing modules  
3. **WORKFLOW MAPPING**: Map enhancement integration to current platform architecture
4. **PROTECTION CHECK**: Verify no duplication or recreation of existing functionality

### 🎯 CORE DEVELOPMENT PRINCIPLES

**ENHANCEMENT ONLY - NO RECREATION:**
- ✅ ADD to existing files and modules
- ✅ EXTEND current functionality  
- ✅ INTEGRATE with established workflows
- ❌ NEVER recreate existing components
- ❌ NEVER build duplicate functionality
- ❌ NEVER create MVP or mock implementations

### 📋 SUB-AGENT DEPLOYMENT STRATEGY

**Agent must create specialized sub-agents for:**

#### Sub-Agent 1: Architecture Analysis
- **Task**: Map each enhancement to existing module structure
- **Focus**: `client/src/components/cmc/`, `client/src/pages/`, `server/routes/cmc-*`
- **Output**: Integration roadmap with exact file locations

#### Sub-Agent 2: UI/UX Integration  
- **Task**: Ensure seamless UI integration across all modules
- **Focus**: Client Portal (`ClientPortalLanding.jsx`) → Module navigation → Feature UI
- **Requirements**: ALL buttons functional, ALL features accessible, consistent UX

#### Sub-Agent 3: Backend Enhancement
- **Task**: Extend server capabilities without breaking existing APIs
- **Focus**: `server/routes/`, `server/services/`, database integration
- **Requirements**: Maintain existing API contracts, add new endpoints safely

#### Sub-Agent 4: Testing & Validation
- **Task**: Test all enhancements before integration
- **Focus**: End-to-end workflow testing, UI functionality validation
- **Requirements**: Verify existing functionality remains intact

### 🏗️ SPECIFIC ENHANCEMENT LOCATIONS

#### 1. Automatic Regulatory Document Drafting
**Primary Location**: `client/src/pages/INDWizard/`
**Files to Enhance**:
- `client/src/components/ind-wizard/INDWizardModule.jsx`
- `server/routes/ind-automation.js`
**UI Integration**: Add "Auto-Draft IND" button to IND Wizard main interface

#### 2. AI-Powered Data Summarization  
**Primary Location**: `client/src/components/cmc/`
**Files to Enhance**:
- `client/src/components/cmc/ComprehensiveCMCPlatformClean.jsx`
- `server/routes/cmc-actions.js`
**UI Integration**: Extend CMC Wizard with "AI Summary Generator" panel

#### 3. Dynamic Template Generation
**Primary Location**: `client/src/components/csr-intelligence/`
**Files to Enhance**:
- `client/src/components/csr-intelligence/CSRIntelligenceModule.jsx`
- `server/services/ectdTemplates.js`
**UI Integration**: Add template builder to CSR Intelligence Hub

#### 4. Source-Linked Data Tracing
**Primary Location**: `client/src/services/documentIntelligenceHub.js`
**Files to Enhance**:
- `server/services/DocumentIntelligenceService.js`
- `client/src/components/document-intelligence/`
**UI Integration**: Add traceability viewer to all document outputs

#### 5. Living Record System
**Primary Location**: `client/src/components/csr-intelligence/`
**Files to Enhance**:
- `server/services/CSRIntelligenceLibrary.js`
- `client/src/services/WorkflowService.js`
**UI Integration**: Real-time update indicators across all modules

### 🔧 DEVELOPMENT WORKFLOW

#### Phase 1: Analysis & Planning (Sub-Agent 1)
1. **File Structure Analysis**: Study existing module architecture
2. **Integration Point Identification**: Map enhancement insertion points
3. **Dependency Mapping**: Identify shared services and components
4. **Risk Assessment**: Flag potential conflicts with existing functionality

#### Phase 2: UI/UX Enhancement (Sub-Agent 2)
1. **Client Portal Integration**: Ensure all enhancements accessible from `/client-portal`
2. **Module Navigation**: Update module switching and navigation
3. **Feature Accessibility**: Verify all new features have proper UI controls
4. **Consistency Check**: Maintain design language across platform

#### Phase 3: Backend Development (Sub-Agent 3)
1. **API Extension**: Add new endpoints without breaking existing ones
2. **Service Integration**: Extend existing services with new capabilities
3. **Database Enhancement**: Add necessary schema extensions
4. **Performance Optimization**: Ensure new features don't degrade performance

#### Phase 4: Testing & Validation (Sub-Agent 4)
1. **Functionality Testing**: Verify all new features work as intended
2. **Integration Testing**: Ensure seamless module interaction
3. **Regression Testing**: Confirm existing functionality remains intact
4. **UI/UX Testing**: Validate complete user workflows

### 📋 MANDATORY DELIVERABLES

#### For Each Enhancement:
1. **Integration Report**: Exact files modified and enhancement details
2. **UI/UX Documentation**: Screenshots and workflow validation
3. **Testing Results**: Comprehensive test coverage report
4. **Rollback Plan**: Clear steps to reverse changes if needed

#### Platform-Wide Requirements:
1. **Client Portal Integration**: All enhancements accessible from main portal
2. **Module Consistency**: Uniform UI/UX across all modules
3. **Performance Metrics**: No degradation in existing functionality
4. **Documentation Updates**: Clear user guides for new features

### 🚨 CRITICAL SAFETY CHECKS

**Before Implementation:**
- [ ] Enhancement location verified in existing codebase
- [ ] No duplicate functionality identified
- [ ] Integration points mapped and validated
- [ ] UI/UX flow documented and approved

**During Development:**
- [ ] Existing functionality preserved
- [ ] New features properly integrated
- [ ] UI elements functional and accessible
- [ ] Performance impact assessed

**After Implementation:**
- [ ] Full platform testing completed
- [ ] Client portal navigation verified
- [ ] All module workflows functional
- [ ] Documentation updated

### 🎯 SUCCESS CRITERIA

**Each enhancement must:**
1. **Integrate Seamlessly**: Work within existing module architecture
2. **Enhance Functionality**: Add value without recreation
3. **Maintain Quality**: Professional-grade implementation (no MVP/mock code)
4. **Preserve Stability**: Existing features remain fully functional
5. **Update UI Completely**: All interfaces properly updated with working controls

**Platform-wide success:**
- Client Portal → Module access → Enhanced features = Complete workflow
- All buttons functional, all features accessible
- Consistent UX across entire platform
- Enhanced capabilities without breaking existing functionality

### 📞 ESCALATION PROTOCOL

**If any enhancement risks existing functionality:**
1. **STOP IMMEDIATELY** 
2. **DOCUMENT CONFLICT** with specific file/function details
3. **PROPOSE ALTERNATIVE** integration approach
4. **AWAIT APPROVAL** before proceeding

This directive ensures safe, systematic enhancement of the CMC platform while preserving all existing functionality and maintaining the high-quality professional standards expected.
