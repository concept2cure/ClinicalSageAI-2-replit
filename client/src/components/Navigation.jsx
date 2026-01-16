import React from 'react';
import { useLocation } from 'wouter';
import { FileText, Clock, Home } from 'lucide-react'

export default function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-2xl font-bold text-blue-800">Concept2Cure™</h1>
            </div>
            <div className="ml-10 flex items-center space-x-4">
              <a
                href="/"
                className={`${location === '/' ? 'text-blue-600 border-blue-500' : 'text-gray-500 hover:text-blue-600 hover:border-gray-300'} 
                  px-3 py-2 text-sm font-medium border-b-2 border-transparent flex items-center gap-1`}
              >
                <Home className="h-4 w-4" />
                <span>Home</span>
              </a>
              <a
                href="/module32"
                className={`${location === '/module32' ? 'text-blue-600 border-blue-500' : 'text-gray-500 hover:text-blue-600 hover:border-gray-300'} 
                  px-3 py-2 text-sm font-medium border-b-2 border-transparent flex items-center gap-1`}
              >
                <FileText className="h-4 w-4" />
                <span>Create CMC Doc</span>
              </a>
              <a
                href="/versions"
                className={`${location === '/versions' ? 'text-blue-600 border-blue-500' : 'text-gray-500 hover:text-blue-600 hover:border-gray-300'} 
                  px-3 py-2 text-sm font-medium border-b-2 border-transparent flex items-center gap-1`}
              >
                <Clock className="h-4 w-4" />
                <span>Version History</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
