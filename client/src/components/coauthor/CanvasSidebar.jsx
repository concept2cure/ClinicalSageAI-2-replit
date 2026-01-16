import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layout, FileText, Settings, List, Users, Clock, Search } from 'lucide-react'

export default function CanvasSidebar({ submissionId }) {
  const [activeTab, setActiveTab] = useState('sections');

  const sections = [
    { id: '1.1', title: 'Introduction', status: 'complete' },
    { id: '1.2', title: 'Executive Summary', status: 'in-progress' },
    { id: '2.1', title: 'Product Overview', status: 'complete' },
    { id: '2.2', title: 'Quality Information', status: 'not-started' },
    { id: '2.3', title: 'Nonclinical Overview', status: 'not-started' },
    { id: '2.4', title: 'Clinical Overview', status: 'in-progress' },
    { id: '2.5', title: 'Risk Analysis', status: 'not-started' },
    { id: '2.6', title: 'Risk Management', status: 'not-started' },
    { id: '2.7', title: 'Clinical Summary', status: 'in-progress' },
  ];

  return (
    <div className="w-64 border-r flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="font-medium text-gray-800">Submission Canvas</h3>
        <p className="text-xs text-gray-500 mt-1">ID: {submissionId || 'SUB-123456'}</p>
      </div>

      <div className="flex border-b">
        <button
          className={`flex-1 py-2 text-xs font-medium ${activeTab === 'sections' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('sections')}
        >
          Sections
        </button>
        <button
          className={`flex-1 py-2 text-xs font-medium ${activeTab === 'resources' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
          onClick={() => setActiveTab('resources')}
        >
          Resources
        </button>
      </div>

      <div className="p-2 border-b">
        <div className="relative">
          <input
            type="text"
            placeholder="Search sections..."
            className="w-full text-sm rounded-md border border-gray-300 py-1 pl-7 pr-2"
          />
          <Search className="absolute left-2 top-1.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {activeTab === 'sections' ? (
          <div className="p-2 space-y-1">
            {sections.map(section => (
              <div
                key={section.id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 cursor-pointer"
              >
                <div className="flex items-center">
                  <div
                    className={`w-2 h-2 rounded-full mr-2 ${
                      section.status === 'complete'
                        ? 'bg-green-500'
                        : section.status === 'in-progress'
                          ? 'bg-amber-500'
                          : 'bg-gray-300'
                    }`}
                  />
                  <span className="text-sm">
                    {section.id} {section.title}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            <div className="text-xs text-gray-500 px-2 py-1">RESOURCES</div>

            <div className="flex items-center p-2 rounded-md hover:bg-gray-100 cursor-pointer">
              <FileText className="h-4 w-4 mr-2 text-blue-600" />
              <span className="text-sm">Templates</span>
            </div>

            <div className="flex items-center p-2 rounded-md hover:bg-gray-100 cursor-pointer">
              <Users className="h-4 w-4 mr-2 text-blue-600" />
              <span className="text-sm">Contributors</span>
            </div>

            <div className="flex items-center p-2 rounded-md hover:bg-gray-100 cursor-pointer">
              <Clock className="h-4 w-4 mr-2 text-blue-600" />
              <span className="text-sm">Version History</span>
            </div>

            <div className="flex items-center p-2 rounded-md hover:bg-gray-100 cursor-pointer">
              <Settings className="h-4 w-4 mr-2 text-blue-600" />
              <span className="text-sm">Settings</span>
            </div>
          </div>
        )}
      </ScrollArea>

      <div className="p-2 border-t">
        <Button className="w-full" variant="outline" size="sm">
          <Layout className="h-4 w-4 mr-2" />
          <span>Canvas View</span>
        </Button>
      </div>
    </div>
  );
}
