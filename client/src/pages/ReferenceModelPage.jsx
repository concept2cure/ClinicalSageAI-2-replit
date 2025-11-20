import React, { useState } from 'react';
import { ReferenceModelBrowser } from '@/components/vault/ReferenceModelBrowser';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

// Use simple icons component instead of lucide-react to avoid import issues
const iconStyles = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.2em',
  lineHeight: 1,
  verticalAlign: 'middle',
};

const Icon = {
  ArrowLeft: () => <span style={iconStyles}>←</span>,
  BookOpen: () => <span style={iconStyles}>📖</span>,
  AlertTriangle: () => <span style={iconStyles}>⚠️</span>,
};

function ReferenceModelPage() {
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/" className="text-gray-500 hover:text-gray-700">
            <Icon.ArrowLeft />
          </Link>
          <h1 className="text-2xl font-bold">Document Reference Model</h1>
        </div>

        <Alert className="mb-4 border-yellow-200 bg-yellow-50 text-yellow-800 pl-9 relative">
          <Icon.AlertTriangle className="h-4 w-4 absolute left-3 top-4" />
          <AlertTitle>Database Connection Warning</AlertTitle>
          <AlertDescription>
            This is a demonstration of the reference model interface. The database connection may
            not be available, so queries and document operations may not work correctly. When
            properly configured, this interface would connect to the Supabase PostgreSQL database.
          </AlertDescription>
        </Alert>

        <div className="p-4 mb-6 border border-hotpink-200 bg-hotpink-50 rounded-md pl-9 relative">
          <Icon.BookOpen className="absolute left-3 top-4" />
          <div>
            <h3 className="font-medium text-hotpink-900">Veeva Quality Content Reference Model</h3>
            <p className="text-sm text-hotpink-700">
              This document management system follows the Veeva Quality Content Reference Model,
              providing a standardized structure for organizing regulatory and quality documents.
            </p>
          </div>
        </div>

        <Tabs defaultValue="browse" className="mb-6">
          <TabsList>
            <TabsTrigger value="browse">Browse Documents</TabsTrigger>
            <TabsTrigger value="lifecycle">Document Lifecycle</TabsTrigger>
            <TabsTrigger value="retention">Retention Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="pt-4">
            <ReferenceModelBrowser
              onSelectDocument={setSelectedDocument}
              selectedDocument={selectedDocument}
            />
          </TabsContent>

          <TabsContent value="lifecycle" className="pt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border p-5 rounded-md bg-white">
                <h3 className="font-semibold mb-3">Draft-to-Effective Lifecycle</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Used for governance and procedures that require formal efficacy.
                </p>

                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                  <div className="relative mb-6 pl-10">
                    <div className="absolute left-2 w-4 h-4 rounded-full bg-gray-200 border-2 border-white"></div>
                    <h4 className="font-medium">Draft</h4>
                    <p className="text-sm text-gray-600">Initial authoring stage</p>
                  </div>

                  <div className="relative mb-6 pl-10">
                    <div className="absolute left-2 w-4 h-4 rounded-full bg-yellow-200 border-2 border-white"></div>
                    <h4 className="font-medium">Review</h4>
                    <p className="text-sm text-gray-600">Document under review</p>
                  </div>

                  <div className="relative mb-6 pl-10">
                    <div className="absolute left-2 w-4 h-4 rounded-full bg-blue-200 border-2 border-white"></div>
                    <h4 className="font-medium">Approval</h4>
                    <p className="text-sm text-gray-600">Approval process</p>
                  </div>

                  <div className="relative pl-10">
                    <div className="absolute left-2 w-4 h-4 rounded-full bg-green-200 border-2 border-white"></div>
                    <h4 className="font-medium">Effective</h4>
                    <p className="text-sm text-gray-600">Current approved version</p>
                  </div>
                </div>
              </div>

              <div className="border p-5 rounded-md bg-white">
                <h3 className="font-semibold mb-3">Draft-to-Approved Lifecycle</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Used for operational documents that are approved but not "effective".
                </p>

                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                  <div className="relative mb-6 pl-10">
                    <div className="absolute left-2 w-4 h-4 rounded-full bg-gray-200 border-2 border-white"></div>
                    <h4 className="font-medium">Draft</h4>
                    <p className="text-sm text-gray-600">Initial authoring stage</p>
                  </div>

                  <div className="relative mb-6 pl-10">
                    <div className="absolute left-2 w-4 h-4 rounded-full bg-yellow-200 border-2 border-white"></div>
                    <h4 className="font-medium">Review</h4>
                    <p className="text-sm text-gray-600">Document under review</p>
                  </div>

                  <div className="relative pl-10">
                    <div className="absolute left-2 w-4 h-4 rounded-full bg-green-200 border-2 border-white"></div>
                    <h4 className="font-medium">Approved</h4>
                    <p className="text-sm text-gray-600">Final approved state</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="retention" className="pt-4">
            <div className="bg-white p-6 border rounded-md">
              <h3 className="font-semibold mb-3">Document Retention Policy</h3>
              <p className="text-gray-600 mb-4">
                The following retention periods apply to different document types in the system:
              </p>

              <div className="overflow-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="p-2 text-left border">Document Category</th>
                      <th className="p-2 text-left border">Review Period</th>
                      <th className="p-2 text-left border">Archive After</th>
                      <th className="p-2 text-left border">Delete After</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="p-2 border">Standard Operating Procedures</td>
                      <td className="p-2 border">24 months</td>
                      <td className="p-2 border">60 months</td>
                      <td className="p-2 border">120 months</td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Work Instructions</td>
                      <td className="p-2 border">24 months</td>
                      <td className="p-2 border">48 months</td>
                      <td className="p-2 border">120 months</td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Protocols</td>
                      <td className="p-2 border">12 months</td>
                      <td className="p-2 border">36 months</td>
                      <td className="p-2 border">120 months</td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Specifications</td>
                      <td className="p-2 border">12 months</td>
                      <td className="p-2 border">36 months</td>
                      <td className="p-2 border">120 months</td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Templates</td>
                      <td className="p-2 border">24 months</td>
                      <td className="p-2 border">48 months</td>
                      <td className="p-2 border">120 months</td>
                    </tr>
                    <tr>
                      <td className="p-2 border">Reports</td>
                      <td className="p-2 border">N/A</td>
                      <td className="p-2 border">60 months</td>
                      <td className="p-2 border">120 months</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-sm text-gray-500">
                <p>
                  <strong>Review Period:</strong> Frequency at which documents must be reviewed for
                  accuracy and relevance.
                </p>
                <p>
                  <strong>Archive After:</strong> Period after which documents are archived and no
                  longer actively displayed.
                </p>
                <p>
                  <strong>Delete After:</strong> Period after which documents are permanently
                  deleted from the system.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default ReferenceModelPage;
