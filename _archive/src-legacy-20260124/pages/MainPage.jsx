import React from 'react';
import VaultConciergeAI from '../components/VaultConciergeAI';

/**
 * Main application page that includes the Vault Concierge AI
 */
export default function MainPage() {
  return (
    <div>
      {/* Your main application content goes here */}
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        {/* Example content - Replace with your actual page content */}
        <header className="bg-white shadow-sm py-6">
          <div className="container mx-auto px-4">
            <h1 className="text-3xl font-bold text-gray-900">TrialSage™ Platform</h1>
          </div>
        </header>

        <section className="container mx-auto px-4 py-12">
          <h2 className="text-2xl font-semibold mb-6">Welcome to Your Workspace</h2>
          <p className="text-gray-700 mb-8">
            Access your clinical trial documents, regulatory submissions, and more from this central
            dashboard.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Example cards - Replace with your actual dashboard components */}
            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <h3 className="text-lg font-medium mb-2">Recent Documents</h3>
              <p className="text-gray-600 text-sm mb-4">
                Access your recently viewed or edited documents
              </p>
              <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                View All
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <h3 className="text-lg font-medium mb-2">Active Submissions</h3>
              <p className="text-gray-600 text-sm mb-4">
                Track the status of your ongoing regulatory submissions
              </p>
              <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                View All
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition">
              <h3 className="text-lg font-medium mb-2">Trial Intelligence</h3>
              <p className="text-gray-600 text-sm mb-4">
                Get insights and analytics from your clinical trials
              </p>
              <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                View All
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Vault Concierge AI component */}
      <VaultConciergeAI />
    </div>
  );
}
