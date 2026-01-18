export const demoDocumentsResponse = {
  success: true,
  documents: [
    {
      id: 101,
      title: '2.5 Clinical Overview',
      module: 'Module 2',
      status: 'Draft',
      createdAt: '2025-05-01T10:12:00.000Z',
      updatedAt: '2025-05-10T09:18:00.000Z',
      metadata: {
        demo: true
      }
    },
    {
      id: 102,
      title: '3.2.S Drug Substance',
      module: 'Module 3',
      status: 'In Review',
      createdAt: '2025-05-02T14:44:00.000Z',
      updatedAt: '2025-05-11T16:30:00.000Z',
      metadata: {
        demo: true
      }
    },
    {
      id: 103,
      title: '5.3.5 Clinical Study Report',
      module: 'Module 5',
      status: 'Final',
      createdAt: '2025-05-03T08:05:00.000Z',
      updatedAt: '2025-05-12T12:42:00.000Z',
      metadata: {
        demo: true
      }
    }
  ],
  pagination: {
    total: 3,
    limit: 50,
    offset: 0,
    hasMore: false
  }
};

export const demoModuleTreeResponse = {
  success: true,
  totalModules: 3,
  rootModules: 3,
  leafModules: 3,
  totalDocuments: 3,
  tree: [
    {
      id: 1,
      moduleNumber: '2',
      moduleName: 'Module 2: Summaries',
      parentModuleId: null,
      level: 1,
      isLeaf: false,
      sortOrder: 2,
      status: 'in-progress',
      ichGuidance: 'ICH M4E',
      isRequired: true,
      allowCustomGranules: true,
      documentCount: 1,
      children: [
        {
          id: 11,
          moduleNumber: '2.5',
          moduleName: 'Clinical Overview',
          parentModuleId: 1,
          level: 2,
          isLeaf: true,
          sortOrder: 1,
          status: 'draft',
          ichGuidance: 'ICH M4E',
          isRequired: true,
          allowCustomGranules: false,
          documentCount: 1,
          children: []
        }
      ]
    },
    {
      id: 2,
      moduleNumber: '3',
      moduleName: 'Module 3: Quality',
      parentModuleId: null,
      level: 1,
      isLeaf: false,
      sortOrder: 3,
      status: 'in-progress',
      ichGuidance: 'ICH M4Q',
      isRequired: true,
      allowCustomGranules: true,
      documentCount: 1,
      children: [
        {
          id: 21,
          moduleNumber: '3.2.S',
          moduleName: 'Drug Substance',
          parentModuleId: 2,
          level: 2,
          isLeaf: true,
          sortOrder: 1,
          status: 'in-review',
          ichGuidance: 'ICH M4Q',
          isRequired: true,
          allowCustomGranules: false,
          documentCount: 1,
          children: []
        }
      ]
    },
    {
      id: 3,
      moduleNumber: '5',
      moduleName: 'Module 5: Clinical Study Reports',
      parentModuleId: null,
      level: 1,
      isLeaf: false,
      sortOrder: 5,
      status: 'in-progress',
      ichGuidance: 'ICH M4E',
      isRequired: true,
      allowCustomGranules: true,
      documentCount: 1,
      children: [
        {
          id: 31,
          moduleNumber: '5.3.5',
          moduleName: 'Clinical Study Report',
          parentModuleId: 3,
          level: 2,
          isLeaf: true,
          sortOrder: 1,
          status: 'final',
          ichGuidance: 'ICH E3',
          isRequired: true,
          allowCustomGranules: false,
          documentCount: 1,
          children: []
        }
      ]
    }
  ]
};

export const demoValidationResponse = {
  success: true,
  hasValidation: true,
  validation: {
    validationId: 'demo-validation-001',
    performedAt: '2025-05-12T10:25:00.000Z',
    complianceScore: 84,
    passedRules: 42,
    failedRules: 6,
    totalIssues: 6,
    criticalIssues: 1,
    majorIssues: 2,
    minorIssues: 2,
    informationalIssues: 1,
    validationResults: {
      issues: [
        {
          ruleId: 'ICH-M4E-2.5.4',
          severity: 'critical',
          location: '2.5.4',
          issue: 'Primary efficacy endpoint summary missing.',
          remediation: 'Add a summary of the primary endpoint results with citations.',
          autoFixAvailable: false,
          category: 'content'
        },
        {
          ruleId: 'ICH-M4E-2.7.3',
          severity: 'major',
          location: '2.7.3',
          issue: 'Safety summary lacks discontinuation rates.',
          remediation: 'Include discontinuation rates by treatment arm.',
          autoFixAvailable: false,
          category: 'safety'
        }
      ]
    }
  }
};
