import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Bot } from 'lucide-react';
import SimpleCodingAgent from '../components/ai/SimpleCodingAgent';

const CodingAgentPage = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/client-portal">
                <button className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Portal
                </button>
              </Link>
              <div className="h-6 w-px bg-gray-300"></div>
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-semibold text-gray-900">AI Coding Agent</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border h-[calc(100vh-200px)]">
          <SimpleCodingAgent />
        </div>
      </div>
    </div>
  );
};

export default CodingAgentPage;
