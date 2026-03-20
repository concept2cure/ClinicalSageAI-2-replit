/**
 * App Footer
 *
 * This component provides the footer for the Concept2Cure platform.
 */

import React from 'react';
import { useLocation } from 'wouter';
import { HelpCircle, MessageSquare, ExternalLink } from 'lucide-react';

const AppFooter = () => {
  const [, setLocation] = useLocation();

  return (
    <footer className="bg-white border-t py-4">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center mb-4 md:mb-0">
            <span className="text-sm text-gray-500">
              &copy; {new Date().getFullYear()} Concept2Cures, Inc. All rights reserved.
            </span>
          </div>

          <div className="flex flex-wrap justify-center md:justify-end gap-4">
            <button
              className="flex items-center text-sm text-gray-600 hover:text-gray-900"
              onClick={() => setLocation('/help')}
            >
              <HelpCircle size={16} className="mr-1" />
              Help Center
            </button>

            <button
              className="flex items-center text-sm text-gray-600 hover:text-gray-900"
              onClick={() => setLocation('/support')}
            >
              <MessageSquare size={16} className="mr-1" />
              Contact Support
            </button>

            <a
              href="https://www.concept2cures.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-sm text-gray-600 hover:text-gray-900"
            >
              <ExternalLink size={16} className="mr-1" />
              Website
            </a>
          </div>

          <div className="mt-4 md:mt-0 text-xs text-gray-400">Version 1.0</div>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
