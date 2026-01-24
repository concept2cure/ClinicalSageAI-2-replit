import React from 'react';
// Using native div container instead of MUI
import CMCModule from '../modules/CMCModule';
import UnifiedDocumentUpload from '../components/unified/UnifiedDocumentUpload';

export default function CMCPage() {
  return (
    <div className="container mx-auto max-w-7xl mt-4 mb-4 px-4">
      <CMCModule />
    </div>
  );
}
