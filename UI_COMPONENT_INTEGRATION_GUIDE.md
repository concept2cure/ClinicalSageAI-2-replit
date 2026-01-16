# UI Component Integration Guide

## Quick Start: Connecting Services to Components

### 1. Document Editor Component Integration

#### In MedicalDeviceDocumentEditor.jsx
```jsx
import DocumentEditorService from '../services/DocumentEditorService.js';

export function MedicalDeviceDocumentEditor({ documentId, deviceType = '510k' }) {
  const [currentSection, setCurrentSection] = useState(null);
  const [editorContent, setEditorContent] = useState('');
  const [complianceScore, setComplianceScore] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef(null);
  const autoSaveTimer = useRef(null);

  // Auto-save every 3 seconds of inactivity
  useEffect(() => {
    clearTimeout(autoSaveTimer.current);
    setIsSaving(true);
    
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await DocumentEditorService.autosaveSection(
          currentSection?.id,
          documentId,
          editorContent,
          editorRef.current?.getState()
        );
        setIsSaving(false);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setIsSaving(false);
      }
    }, 3000);

    return () => clearTimeout(autoSaveTimer.current);
  }, [editorContent, currentSection]);

  // Check compliance when section changes
  useEffect(() => {
    if (currentSection && editorContent) {
      checkCompliance();
    }
  }, [currentSection]);

  const checkCompliance = async () => {
    const result = await DocumentEditorService.checkSectionCompliance(
      currentSection?.id,
      editorContent,
      deviceType
    );
    setComplianceScore(result.complianceScore);
  };

  const enhanceWithAI = async () => {
    const enhanced = await DocumentEditorService.enhanceSectionWithAI(
      currentSection?.id,
      editorContent,
      deviceType
    );
    setEditorContent(enhanced);
  };

  const exportPDF = async () => {
    const sections = await DocumentEditorService.getSectionHistory(
      documentId,
      currentSection?.id
    );
    await DocumentEditorService.generatePDFSubmission(documentId, sections);
  };

  return (
    <div className="document-editor">
      <div className="editor-header">
        <h3>{currentSection?.title}</h3>
        <div className="compliance-badge">
          Compliance: <span className={getColorClass(complianceScore)}>
            {complianceScore}%
          </span>
        </div>
        {isSaving && <span className="saving-indicator">Saving...</span>}
      </div>

      <div className="editor-toolbar">
        <button onClick={enhanceWithAI}>✨ Enhance with AI</button>
        <button onClick={checkCompliance}>🔍 Check Compliance</button>
        <button onClick={exportPDF}>📄 Export PDF</button>
      </div>

      {/* TipTap Rich Text Editor */}
      <TipTapEditor
        ref={editorRef}
        value={editorContent}
        onChange={setEditorContent}
      />

      {/* Compliance Feedback */}
      {complianceScore < 70 && (
        <div className="compliance-warning">
          ⚠️ Section compliance is below 70%. 
          Consider: {/* Show specific guidance */}
        </div>
      )}
    </div>
  );
}
```

---

### 2. FDA 510K Workflow Component Integration

#### In FDA510kTabContent.jsx
```jsx
import FDA510kPipelineService from '../services/FDA510kPipelineService.js';

export function FDA510kTabContent({ deviceProfile }) {
  const [pipeline, setPipeline] = useState(null);
  const [currentStage, setCurrentStage] = useState(0);
  const [predicates, setPredicates] = useState([]);
  const [selectedPredicate, setSelectedPredicate] = useState(null);
  const [equivalenceData, setEquivalenceData] = useState(null);
  const [complianceData, setComplianceData] = useState(null);

  // Initialize pipeline
  useEffect(() => {
    if (deviceProfile) {
      const newPipeline = FDA510kPipelineService.initializePipeline(deviceProfile);
      setPipeline(newPipeline);
    }
  }, [deviceProfile]);

  // Stage 2: Predicate Search
  const handlePredicateSearch = async () => {
    try {
      const result = await FDA510kPipelineService.searchPredicateDevices(deviceProfile);
      setPredicates(result.predicates);
    } catch (error) {
      console.error('Predicate search failed:', error);
    }
  };

  // Stage 3: Equivalence Analysis
  const handleEquivalenceAnalysis = async () => {
    try {
      const result = await FDA510kPipelineService.performEquivalenceAnalysis(
        deviceProfile,
        [selectedPredicate],
        [] // selected literature
      );
      setEquivalenceData(result);
      if (result.equivalenceScore >= 70) {
        moveToNextStage();
      }
    } catch (error) {
      console.error('Equivalence analysis failed:', error);
    }
  };

  // Stage 4: Compliance Check
  const handleComplianceCheck = async () => {
    try {
      const result = await FDA510kPipelineService.runFDAComplianceCheck(
        deviceProfile,
        [selectedPredicate],
        equivalenceData
      );
      setComplianceData(result);
      if (result.canProceed) {
        moveToNextStage();
      }
    } catch (error) {
      console.error('Compliance check failed:', error);
    }
  };

  // Stage 5: Package Assembly
  const handlePackageAssembly = async () => {
    try {
      const result = await FDA510kPipelineService.assembleSubmissionPackage(
        deviceProfile,
        [selectedPredicate],
        equivalenceData,
        complianceData,
        [] // editor sections
      );
      // Store package for download
      return result;
    } catch (error) {
      console.error('Package assembly failed:', error);
    }
  };

  // Stage 6: FDA Submission
  const handleSubmitToFDA = async () => {
    try {
      const result = await FDA510kPipelineService.submitToFDA(
        packageId,
        {
          companyName: deviceProfile.manufacturer,
          // company info
        }
      );
      // K-number assigned!
      console.log('Submission Number:', result.submissionNumber);
    } catch (error) {
      console.error('FDA submission failed:', error);
    }
  };

  const moveToNextStage = () => {
    setCurrentStage(prev => Math.min(prev + 1, 5));
  };

  return (
    <div className="fda-510k-workflow">
      {/* Progress Indicator */}
      <ProgressBar 
        current={currentStage + 1} 
        total={6}
        stages={['Device', 'Predicate', 'Equivalence', 'Compliance', 'Package', 'Submit']}
      />

      {/* Stage-Specific Content */}
      {currentStage === 0 && <DeviceProfileStage deviceProfile={deviceProfile} />}
      
      {currentStage === 1 && (
        <PredicateSearchStage
          predicates={predicates}
          onSearch={handlePredicateSearch}
          onSelect={(p) => { setSelectedPredicate(p); moveToNextStage(); }}
        />
      )}

      {currentStage === 2 && (
        <EquivalenceAnalysisStage
          deviceProfile={deviceProfile}
          predicate={selectedPredicate}
          equivalenceData={equivalenceData}
          onAnalyze={handleEquivalenceAnalysis}
          score={equivalenceData?.equivalenceScore}
        />
      )}

      {currentStage === 3 && (
        <ComplianceCheckStage
          complianceData={complianceData}
          onCheck={handleComplianceCheck}
          score={complianceData?.complianceScore}
          canProceed={complianceData?.canProceed}
        />
      )}

      {currentStage === 4 && (
        <PackageAssemblyStage
          onAssemble={handlePackageAssembly}
          packageId={packageId}
        />
      )}

      {currentStage === 5 && (
        <SubmissionStage
          onSubmit={handleSubmitToFDA}
          packageId={packageId}
        />
      )}

      {/* Navigation Buttons */}
      <div className="workflow-navigation">
        <button 
          onClick={() => setCurrentStage(Math.max(0, currentStage - 1))}
          disabled={currentStage === 0}
        >
          ← Previous
        </button>
        <button onClick={() => moveToNextStage()} disabled={currentStage === 5}>
          Next →
        </button>
      </div>
    </div>
  );
}
```

---

### 3. Document Vault Component Integration

#### In DocumentVaultPanel.jsx
```jsx
import DocumentEditorService from '../services/DocumentEditorService.js';

export function DocumentVaultPanel({ documentId }) {
  const [versionHistory, setVersionHistory] = useState([]);

  useEffect(() => {
    loadVersionHistory();
  }, [documentId]);

  const loadVersionHistory = async () => {
    const result = await DocumentEditorService.getSectionHistory(documentId);
    setVersionHistory(result.versions);
  };

  const restoreVersion = async (versionId) => {
    try {
      await DocumentEditorService.restoreVersion(documentId, versionId);
      loadVersionHistory();
    } catch (error) {
      console.error('Restore failed:', error);
    }
  };

  return (
    <div className="document-vault">
      <h4>Version History</h4>
      <div className="version-list">
        {versionHistory.map((version) => (
          <div key={version.id} className="version-item">
            <span>{version.createdAt}</span>
            <span>{version.isAutosave ? '🤖 Auto-save' : '👤 Manual'}</span>
            <button onClick={() => restoreVersion(version.id)}>Restore</button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Service Method Reference

### DocumentEditorService

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `autosaveSection()` | sectionId, documentId, content, editorState | Promise | Auto-save with offline support |
| `enhanceSectionWithAI()` | sectionId, content, documentType, context | Promise<string> | AI-powered enhancement |
| `checkSectionCompliance()` | sectionId, content, documentType, previousSections | Promise<{score, issues, warnings}> | Real-time compliance check |
| `generatePDFSubmission()` | documentId, sections, deviceProfile | Promise<blob> | Generate PDF export |
| `generateDocxSubmission()` | documentId, sections, deviceProfile | Promise<blob> | Generate DOCX export |
| `generateESTARFile()` | documentId, sections, deviceProfile | Promise<blob> | Generate eSTAR ZIP |
| `validateDocumentCompleteness()` | sections, documentType | {isValid, completedSections, missingRequired, completionPercent} | Validate completion |
| `getSectionHistory()` | documentId, sectionId | Promise<[]> | Get version history |
| `restoreVersion()` | documentId, versionId | Promise | Restore from version |

### FDA510kPipelineService

| Method | Parameters | Returns | Purpose |
|--------|-----------|---------|---------|
| `initializePipeline()` | deviceProfile | pipeline | Initialize 510K workflow |
| `searchPredicateDevices()` | deviceProfile | {predicates, total} | Find predicate devices |
| `selectPredicates()` | primaryId, backupIds | selection | Select predicates |
| `performEquivalenceAnalysis()` | device, predicates, literature | {score, analysis, narrative} | Equivalence analysis |
| `runFDAComplianceCheck()` | device, predicates, equivalence | {score, issues, canProceed} | Compliance validation |
| `generateESTARFile()` | device, predicates, equivalence, compliance | blob | Create eSTAR submission |
| `assembleSubmissionPackage()` | device, predicates, equiv, compliance, sections | {packageId, contents} | Assemble package |
| `downloadPackage()` | packageId, format | Promise | Download submission |
| `submitToFDA()` | packageId, companyInfo | {submissionNumber, K-number} | Submit to FDA |
| `getSubmissionStatus()` | submissionNumber | status | Track submission |
| `getPipelineProgress()` | stages | percentage | Get progress % |
| `validateSubmission()` | pipeline | {isValid, errors, warnings} | Pre-submit validation |

---

## API Endpoint Reference

### Document Editor API

```javascript
// Save section
POST /api/document-editor/section/:documentId/:sectionId
{
  content: string,
  editorState: object,
  autosave: boolean
}

// Enhance with AI
POST /api/document-editor/enhance-section
{
  sectionId: string,
  content: string,
  documentType: '510k' | 'cer',
  context: object
}

// Check compliance
POST /api/document-editor/check-compliance
{
  sectionId: string,
  content: string,
  documentType: string,
  previousSections: object
}

// Generate PDF
POST /api/document-editor/generate-pdf
{
  documentId: string,
  sections: array,
  deviceProfile: object
}

// Get history
GET /api/document-editor/history/:documentId

// Restore version
POST /api/document-editor/restore/:documentId/:versionId

// Validate
POST /api/document-editor/validate
{
  sections: array,
  documentType: string
}
```

### FDA 510K API

```javascript
// Search predicates
POST /api/fda510k/predicates/search
{
  deviceName: string,
  deviceClass: string,
  productCode: string,
  intendedUse: string
}

// Equivalence analysis
POST /api/fda510k/equivalence-analysis
{
  subjectDevice: object,
  predicateDevices: array,
  literature: array
}

// Compliance check
POST /api/fda510k/compliance-check
{
  deviceProfile: object,
  predicates: array,
  equivalenceData: object
}

// Assemble package
POST /api/fda510k/assemble-package
{
  deviceProfile: object,
  predicates: array,
  equivalenceData: object,
  complianceData: object,
  sections: array
}

// Submit to FDA
POST /api/fda510k/submit
{
  packageId: string,
  companyInfo: object
}

// Track status
GET /api/fda510k/status/:submissionNumber
```

---

## Error Handling

All services and APIs return consistent error objects:

```javascript
{
  success: false,
  error: 'Error message',
  details: {
    code: 'ERROR_CODE',
    message: 'Detailed error message',
    suggestions: ['Try this', 'Or this']
  }
}
```

---

## Authentication Headers

All API calls should include:
```javascript
headers: {
  'Content-Type': 'application/json',
  'x-organization-id': 'organization_id',
  'Authorization': 'Bearer jwt_token' // If required
}
```

---

## State Management Pattern

```jsx
// Use React hooks for state
const [document, setDocument] = useState(null);
const [currentSection, setCurrentSection] = useState(null);
const [compliance, setCompliance] = useState(0);
const [isSaving, setIsSaving] = useState(false);

// Or integrate with Redux/Zustand for complex state
import { useDocumentStore } from '../store/documentStore';
const { document, saveSection, updateCompliance } = useDocumentStore();
```

---

## Deployment Checklist

- [ ] Services imported in components
- [ ] API endpoints tested
- [ ] Error handling implemented
- [ ] Loading states added
- [ ] Auto-save interval configured (default: 3s)
- [ ] Compliance threshold set (default: 70%)
- [ ] Export formats tested
- [ ] Offline mode tested
- [ ] Multi-tenant isolation verified

---

## Testing Examples

```javascript
// Test auto-save
it('should auto-save section after inactivity', async () => {
  const service = new DocumentEditorService();
  await service.autosaveSection('section1', 'doc1', 'content');
  // Verify localStorage
  expect(localStorage.getItem('section_doc1_section1')).toBeDefined();
});

// Test compliance
it('should return compliance score', async () => {
  const result = await service.checkSectionCompliance(
    'intended-use',
    'Device intended for...',
    '510k'
  );
  expect(result.complianceScore).toBeGreaterThanOrEqual(0);
  expect(result.complianceScore).toBeLessThanOrEqual(100);
});

// Test FDA workflow
it('should complete full FDA pipeline', async () => {
  const pipeline = service.initializePipeline(deviceProfile);
  const predicates = await service.searchPredicateDevices(deviceProfile);
  expect(predicates.length).toBeGreaterThan(0);
});
```

---

**Ready to integrate! Start with DocumentEditorService in MedicalDeviceDocumentEditor.jsx**
