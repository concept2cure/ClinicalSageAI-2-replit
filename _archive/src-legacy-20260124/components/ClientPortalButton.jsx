import React from 'react';
import { Link } from 'wouter';

const ClientPortalButton = () => {
  return (
    <div className="fixed bottom-8 right-8">
      <Link to="/client-portal">
        <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg shadow-lg flex items-center font-medium">
          <span>Open Client Portal</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 ml-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      </Link>
    </div>
  );
};

export default ClientPortalButton;
