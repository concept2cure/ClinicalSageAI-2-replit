// Empty homepage - unauthorized content removed
import React from 'react';

const HomeLanding = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-medium text-gray-900">Page Content Removed</h1>
        <p className="mt-2 text-gray-600">Unauthorized content has been deleted</p>

        <div className="mt-8">
          <button
            onClick={() => (window.location.href = '/ai')}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600 shadow-xl flex items-center gap-2 font-medium transition-all text-lg mx-auto"
          >
            💬 Coding Agent
          </button>
        </div>
      </div>
    </div>
  );
};

export default HomeLanding;
