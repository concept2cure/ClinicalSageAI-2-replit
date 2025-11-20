import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { FileText, MessageSquare } from 'lucide-react';

export default function TopNavigation() {
  return (
    <div className="bg-white border-b border-gray-200 shadow-sm py-3 px-4">
      <div className="max-w-7xl mx-auto flex flex-wrap justify-between items-center">
        <div className="flex items-center space-x-2 mb-2 md:mb-0">
          <Link to="/">
            <img
              src="/assets/trialsage-logo.svg"
              alt="TrialSage"
              className="h-10 w-auto"
              onError={e => {
                e.target.onerror = null;
                e.target.src = 'https://placeholder.pics/svg/200x80/DEDEDE/555555/TrialSage';
              }}
            />
          </Link>
        </div>

        <div className="flex flex-wrap items-center space-x-1 md:space-x-3">
          <Link to="/ind-architect">
            <Button variant="ghost" className="text-blue-600 hover:text-blue-800 hover:bg-blue-50">
              IND Architect
            </Button>
          </Link>
          <Link to="/csr-intelligence">
            <Button
              variant="ghost"
              className="text-green-600 hover:text-green-800 hover:bg-green-50"
            >
              CSR Oracle
            </Button>
          </Link>
          <Link to="/portal">
            <Button
              variant="ghost"
              className="text-purple-600 hover:text-purple-800 hover:bg-purple-50"
            >
              SmartDocs
            </Button>
          </Link>
          <Link to="/document-management">
            <Button
              variant="ghost"
              className="text-teal-600 hover:text-teal-800 hover:bg-teal-50 flex items-center relative"
            >
              <FileText className="h-4 w-4 mr-1" />
              DocuShare
              <span className="absolute -top-1 -right-1 bg-teal-100 text-teal-800 text-[8px] px-1 rounded-full border border-teal-300 whitespace-nowrap">
                21 CFR Part 11
              </span>
            </Button>
          </Link>
          <Link to="/chat">
            <Button
              variant="ghost"
              className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 flex items-center relative"
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              Chat
              <span className="absolute -top-1 -right-1 bg-indigo-100 text-indigo-800 text-[8px] px-1 rounded-full border border-indigo-300 whitespace-nowrap">
                New
              </span>
            </Button>
          </Link>
          <Link to="/walkthroughs">
            <Button variant="ghost" className="text-gray-600 hover:text-gray-800 hover:bg-gray-50">
              Walkthroughs
            </Button>
          </Link>
          <Link to="/portal">
            <Button className="bg-blue-600 hover:bg-blue-700 text-white ml-2">Client Portal</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
