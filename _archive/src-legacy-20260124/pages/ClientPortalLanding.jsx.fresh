import React from 'react';
import { useLocation } from 'wouter';

const ClientPortalLanding = () => {
  const [, setLocation] = useLocation();
  
  // Module cards for the dashboard - EXACTLY as shown in the screenshot
  const moduleCards = [
    { id: 'ind', title: 'IND Wizard™', description: 'FDA-compliant INDs with automated form generation', path: '/ind-wizard' },
    { id: 'ectd', title: 'eCTD Module Builder™', description: 'Integrated common technical document module builder', path: '/ectd-planner' },
    { id: 'regulatory-submissions', title: 'Regulatory Submissions Hub™', description: 'Unified platform for managing eCTD and IND submissions with comprehensive document management', path: '/regulatory-submissions' },
    { id: 'cer', title: 'CER Generator™', description: 'Next-generation regulatory automation for medical device and combination product submissions', path: '/cerv2' },
    { id: 'cmc', title: 'CMC Wizard™', description: 'Chemistry, Manufacturing, and Controls documentation', path: '/cmc' },
    { id: 'vault', title: 'TrialSage Vault™', description: 'Secure document storage with intelligent retrieval', path: '/vault' },
    { id: 'rih', title: 'Regulatory Intelligence Hub™', description: 'AI-powered strategy, timeline, and risk simulation', path: '/regulatory-intelligence-hub' },
    { id: 'risk', title: 'Risk Heatmap™', description: 'Interactive visualization of CTD risk gaps & impacts', path: '/risk-heatmap' },
    { id: 'study', title: 'Study Architect™', description: 'Protocol development with regulatory intelligence', path: '/study-architect' },
    { id: 'coauthor', title: 'eCTD Co-Author™', description: 'AI-assisted co-authoring of CTD submission sections', path: '/ectd-coauthor' },
    { id: 'analytics', title: 'Analytics Dashboard', description: 'Metrics and insights on regulatory performance', path: '/analytics' }
  ];

  // Simple navigation handler
  const handleModuleSelect = (moduleId) => {
    const selectedModule = moduleCards.find(m => m.id === moduleId);
    if (selectedModule) {
      setLocation(selectedModule.path);
    }
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="container mx-auto">
        <h1 className="text-3xl font-bold text-indigo-800 mb-8">TrialSage™ Modules</h1>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {moduleCards.map(module => (
            <div 
              key={module.id} 
              onClick={() => handleModuleSelect(module.id)} 
              className="block bg-indigo-50 hover:bg-indigo-100 rounded-lg p-4 transition duration-200 h-full cursor-pointer"
            >
              <h3 className="text-lg font-semibold text-indigo-700">{module.title}</h3>
              <p className="text-gray-600 mt-2 text-sm">{module.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClientPortalLanding;