import React, { Suspense } from 'react';

// Minimal loading component
const MinimalLoading = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
    <div className="text-3xl font-bold text-blue-600 mb-4">TrialSage™</div>
    <div className="text-lg text-gray-700">Loading enterprise platform...</div>
  </div>
);

// Create wrapper that loads the landing page using dynamic import
export default function MinimalEntryPage() {
  // Use React.lazy to dynamically import the MinimalLanding component
  const MinimalLanding = React.lazy(() => import('./MinimalLanding'));

  return (
    <Suspense fallback={<MinimalLoading />}>
      <MinimalLanding />
    </Suspense>
  );
}
