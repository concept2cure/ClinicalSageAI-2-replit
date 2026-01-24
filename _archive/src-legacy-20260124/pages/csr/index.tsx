import React from 'react';
import { Helmet } from '../lightweight-wrappers.js';
import CSRIngest from '../../components/csr/CSRIngest';
import CSRSearchBar from '../../components/csr/CSRSearchBar';
import CSRChatPanel from '../../components/csr/CSRChatPanel';
import FailureMapVisualizer from '../../components/csr/FailureMapVisualizer';

export default function CSRPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <Helmet>
        <title>CSR Intelligence | TrialSage</title>
        <meta
          name="description"
          content="Clinical Study Report (CSR) Intelligence - Search, analyze and extract insights from CSR documents"
        />
      </Helmet>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Clinical Study Report (CSR) Intelligence
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          Search, analyze and extract insights from CSR documents
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <CSRIngest />
        <CSRSearchBar />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CSRChatPanel />
        <FailureMapVisualizer />
      </div>
    </div>
  );
}
