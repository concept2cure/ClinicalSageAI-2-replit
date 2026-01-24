import React, { useState } from 'react';
import CoauthorModule from '../components/coauthor/CoauthorModule';
import DocumentSelector from '../components/coauthor/DocumentSelector';

export default function CoauthorPage() {
  const [view, setView] = useState('selector');
  const [selectedModule, setSelectedModule] = useState(null);

  const handleDocumentSelection = moduleId => {
    setSelectedModule(moduleId);
    setView('editor');
  };

  const handleBackToSelector = () => {
    setView('selector');
  };

  return (
    <>
      {view === 'selector' && <DocumentSelector onSelectDocument={handleDocumentSelection} />}

      {view === 'editor' && <CoauthorModule onBackToSelector={handleBackToSelector} />}
    </>
  );
}
