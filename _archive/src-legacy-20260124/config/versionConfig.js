/**
 * Version Configuration for Extract Commitments Modal
 *
 * This configuration tracks the version progression as each phase is approved.
 * Each approved phase increments the version number and updates the feature set.
 */

export const VERSION_CONFIG = {
  // Current version information
  current: {
    version: '2.2-Phase2-UAT-POLISHED',
    buildNumber: '2025071002',
    releaseDate: '2025-07-10',
    status: 'Production Ready - UAT FIXES COMPLETE',
    approvedBy: 'User',
    approvalDate: '2025-07-10',
  },

  // Version history and progression
  versions: [
    {
      version: '2.0',
      description: 'Original Extract Commitments Modal with unified backend integration',
      features: [
        'Real-time performance metrics',
        'Live backend integration',
        'Three-tab interface (Extract, Results, Tracking)',
        'Professional UI/UX',
      ],
      buildNumber: '2025070801',
      releaseDate: '2025-07-08',
      status: 'Completed',
      approvedBy: 'User',
      approvalDate: '2025-07-08',
    },
    {
      version: '2.1-Phase1',
      description: 'Document-Specific AI Models & Automated Categorization',
      features: [
        'Document-specific AI configurations for IND, NDA, BLA, CSR',
        'Automated categorization using regulatory taxonomy',
        'Enhanced prompt engineering with regulatory frameworks',
        'Specialized AI models for each submission type',
        'AI response format with confidence scoring',
        'Version number display in modal header',
      ],
      buildNumber: '2025070901',
      releaseDate: '2025-07-09',
      status: 'Completed',
      approvedBy: 'User',
      approvalDate: '2025-07-09',
    },
    {
      version: '2.2-Phase2-UAT-POLISHED',
      description: 'Interactive Commitment List with Real Database Integration + UAT Polish',
      features: [
        'Live database connectivity with 9 real commitments',
        'Interactive commitment list display in Results & Analysis tab',
        'Real-time performance metrics dashboard',
        'Advanced search and filtering capabilities',
        'Comprehensive error handling and loading states',
        'Professional UI/UX with responsive design',
        'Data transformation and display optimization',
        'Backend API integration with proper authentication',
        'Details button functionality with expandable content',
        'Esc key modal close accessibility',
        'Loading state management for blank screen prevention',
      ],
      buildNumber: '2025071002',
      releaseDate: '2025-07-10',
      status: 'Production Ready - UAT FIXES COMPLETE',
      approvedBy: 'User',
      approvalDate: '2025-07-10',
      uatFixes: [
        '✅ Fixed intermittent blank screen on hard refresh',
        '✅ Implemented Details button functionality',
        '✅ Added Esc key close for modal',
      ],
    },
  ],

  // Future phases (planned)
  roadmap: [
    {
      version: '2.2-Phase2',
      description: 'Enhanced Analytics & Reporting',
      plannedFeatures: [
        'Advanced analytics dashboard',
        'Historical trend analysis',
        'Custom reporting capabilities',
        'Export functionality',
        'Performance optimization',
      ],
      estimatedRelease: '2025-07-15',
    },
    {
      version: '2.3-Phase3',
      description: 'AI-Powered Proactive Discovery',
      plannedFeatures: [
        'Proactive commitment discovery',
        'Intelligent remediation suggestions',
        'Cross-module integration',
        'Advanced workflow automation',
        'Real-time compliance monitoring',
      ],
      estimatedRelease: '2025-07-22',
    },
    {
      version: '3.0-Complete',
      description: 'Full Commitment Intelligence Hub',
      plannedFeatures: [
        'Complete automation pipeline',
        'Advanced AI assistant',
        'Full regulatory compliance suite',
        'Enterprise-grade scalability',
        'Multi-tenant architecture',
      ],
      estimatedRelease: '2025-08-01',
    },
  ],
};

// Helper functions for version management
export const getVersionInfo = () => VERSION_CONFIG.current;

export const getVersionBadgeClass = status => {
  switch (status) {
    case 'Production Ready':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'Pending Approval':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'In Development':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'Completed':
      return 'bg-gray-100 text-gray-800 border-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
};

export const approveCurrentPhase = (approvedBy = 'User') => {
  const currentTime = new Date().toISOString().split('T')[0];

  // Update current version
  VERSION_CONFIG.current.approvedBy = approvedBy;
  VERSION_CONFIG.current.approvalDate = currentTime;
  VERSION_CONFIG.current.status = 'Completed';

  // Update version history
  const currentVersionIndex = VERSION_CONFIG.versions.findIndex(
    v => v.version === VERSION_CONFIG.current.version
  );

  if (currentVersionIndex !== -1) {
    VERSION_CONFIG.versions[currentVersionIndex].approvedBy = approvedBy;
    VERSION_CONFIG.versions[currentVersionIndex].approvalDate = currentTime;
    VERSION_CONFIG.versions[currentVersionIndex].status = 'Completed';
  }

  return VERSION_CONFIG.current;
};

export const moveToNextPhase = () => {
  const nextPhase = VERSION_CONFIG.roadmap[0];
  if (nextPhase) {
    // Move next phase to current
    VERSION_CONFIG.current = {
      version: nextPhase.version,
      buildNumber: `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}01`,
      releaseDate: new Date().toISOString().split('T')[0],
      status: 'In Development',
      approvedBy: null,
      approvalDate: null,
    };

    // Add to versions array
    VERSION_CONFIG.versions.push({
      version: nextPhase.version,
      description: nextPhase.description,
      features: nextPhase.plannedFeatures,
      buildNumber: VERSION_CONFIG.current.buildNumber,
      releaseDate: VERSION_CONFIG.current.releaseDate,
      status: 'In Development',
      approvedBy: null,
      approvalDate: null,
    });

    // Remove from roadmap
    VERSION_CONFIG.roadmap.shift();
  }

  return VERSION_CONFIG.current;
};

export const getVersionHistory = () => VERSION_CONFIG.versions;
export const getRoadmap = () => VERSION_CONFIG.roadmap;
