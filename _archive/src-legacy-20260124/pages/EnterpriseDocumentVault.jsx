import React, { useState } from 'react';
import { Layout } from '@/components/ui/layout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FileText,
  Lock,
  FileCheck,
  Database,
  Shield,
  BookOpen,
  Layers,
  Clock,
  CheckCircle,
  ListChecks,
  BookType,
  FileArchive,
  Folder,
  Search,
  FileSearch,
  Filter,
  Sparkles,
} from 'lucide-react';
import DocuShareIntegration from '@/components/document-management/DocuShareIntegration';
import { Button } from '@/components/ui/button';
import SemanticSearchBar from '@/components/search/SemanticSearchBar';
import SemanticSearchResults from '@/components/search/SemanticSearchResults';
import { semanticSearch } from '@/services/SemanticSearchService';

/**
 * Enterprise Document Vault Page
 *
 * Showcase of DocuShare Enterprise document management system with
 * detailed use cases for Life Sciences and Biotech industries.
 */
export default function EnterpriseDocumentVault() {
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);

  const handleSearch = async searchParams => {
    setIsSearching(true);
    setShowSearchResults(true);

    try {
      const results = await semanticSearch(
        searchParams.query,
        searchParams.filters,
        searchParams.searchMode
      );
      setSearchResults(results);
    } catch (error) {
      console.error('Error performing semantic search:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectDocument = document => {
    setSelectedDocument(document);
    console.log('Selected document:', document);
    // In a full implementation, this would open a document preview or details panel
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Enterprise Document Management Vault</h1>
            <p className="text-gray-600 mt-1">
              Comprehensive 21 CFR Part 11 compliant document management for Life Sciences
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-100 text-green-800 px-3 py-1">
              21 CFR Part 11 Compliant
            </Badge>
            <Badge className="bg-blue-100 text-blue-800 px-3 py-1">GxP Validated</Badge>
          </div>
        </div>

        {/* Unified Semantic Search */}
        <div className="mb-6">
          <Card className="bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border-indigo-100 overflow-hidden">
            <CardHeader className="pb-2 flex items-center gap-3">
              <div className="rounded-full bg-indigo-600 p-2">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <CardTitle>Unified Semantic Search</CardTitle>
                <CardDescription>
                  Search across all documents, data, and communications using natural language
                  queries
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <SemanticSearchBar
                onSearch={handleSearch}
                placeholder="Try searching 'regulatory deviations in EU submissions' or 'safety concerns in clinical trials'..."
                initialFilters={{ modules: ['regulatory'] }}
              />
            </CardContent>
          </Card>

          {/* Search Results Section */}
          {showSearchResults && (
            <Card className="mt-4 border-indigo-100">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center">
                  <Search className="text-indigo-600 mr-2 h-5 w-5" />
                  <CardTitle>Search Results</CardTitle>
                </div>
                {searchResults && (
                  <Button variant="outline" size="sm" onClick={() => setShowSearchResults(false)}>
                    Close Results
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <SemanticSearchResults
                  results={searchResults}
                  isLoading={isSearching}
                  onSelectDocument={handleSelectDocument}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <div className="h-7 w-7 bg-indigo-600 rounded-md flex items-center justify-center text-white">
                    <FileText size={16} />
                  </div>
                  DocuShare Enterprise
                </CardTitle>
                <CardDescription className="text-base">
                  Unified document management across all TrialSage modules
                </CardDescription>
              </div>
              <div>
                <Badge className="bg-purple-100 text-purple-800 px-3 py-1">Version 7.5</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-blue-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 bg-blue-600 rounded-md flex items-center justify-center text-white">
                    <Database size={16} />
                  </div>
                  <div>
                    <h3 className="font-medium">Document Repository</h3>
                    <p className="text-sm text-gray-600">Unified secure storage</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-green-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 bg-green-600 rounded-md flex items-center justify-center text-white">
                    <ListChecks size={16} />
                  </div>
                  <div>
                    <h3 className="font-medium">Automated Workflows</h3>
                    <p className="text-sm text-gray-600">Configurable approval chains</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-orange-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 bg-orange-600 rounded-md flex items-center justify-center text-white">
                    <CheckCircle size={16} />
                  </div>
                  <div>
                    <h3 className="font-medium">Regulatory Compliance</h3>
                    <p className="text-sm text-gray-600">FDA, EMA, PMDA ready</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-indigo-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-8 w-8 bg-indigo-600 rounded-md flex items-center justify-center text-white">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h3 className="font-medium">Module Integration</h3>
                    <p className="text-sm text-gray-600">Seamless cross-module access</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Showcase DocuShare Enterprise Integration */}
            <div className="rounded-lg border bg-slate-50 overflow-hidden mb-8">
              <div className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white px-4 py-3">
                <h3 className="font-semibold flex items-center">
                  <Folder size={18} className="mr-2" />
                  Enterprise Document Repository Demo
                </h3>
                <p className="text-xs text-indigo-100">
                  Demonstration of DocuShare Enterprise with life sciences documentation
                </p>
              </div>
              <div className="p-4">
                <DocuShareIntegration
                  moduleName="enterprise"
                  moduleLabel="Enterprise Document Vault"
                />
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mt-4">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <BookOpen size={18} className="text-blue-600 mr-2" />
                DocuShare Enterprise Features
              </h2>
              <div className="prose max-w-none">
                <p>
                  DocuShare Enterprise is a comprehensive document management system designed
                  specifically for life sciences organizations. It provides a centralized repository
                  for all regulatory, clinical, and quality documents with robust security,
                  compliance, and workflow capabilities.
                </p>
                <h3 className="mt-4">Key Benefits</h3>
                <ul>
                  <li className="flex items-baseline gap-2">
                    <Shield size={16} className="text-green-600 flex-shrink-0" />
                    <span>Secure Document Repository with AES-256 encryption</span>
                  </li>
                  <li className="flex items-baseline gap-2">
                    <Lock size={16} className="text-blue-600 flex-shrink-0" />
                    <span>21 CFR Part 11 Compliant electronic signatures</span>
                  </li>
                  <li className="flex items-baseline gap-2">
                    <ListChecks size={16} className="text-purple-600 flex-shrink-0" />
                    <span>Configurable Workflows for document approval</span>
                  </li>
                  <li className="flex items-baseline gap-2">
                    <Clock size={16} className="text-orange-600 flex-shrink-0" />
                    <span>Version Control with complete document history</span>
                  </li>
                  <li className="flex items-baseline gap-2">
                    <BookType size={16} className="text-red-600 flex-shrink-0" />
                    <span>Automatic Metadata Extraction for advanced search</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CheckCircle size={18} className="text-indigo-600" />
                    Regulatory Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <Badge className="mt-0.5 bg-green-100 text-green-800">
                        FDA 21 CFR Part 11
                      </Badge>
                      <div className="text-sm">
                        Electronic records and signatures compliance for FDA submissions
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge className="mt-0.5 bg-blue-100 text-blue-800">EMA Annex 11</Badge>
                      <div className="text-sm">
                        European Medicines Agency computerized system validation
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge className="mt-0.5 bg-purple-100 text-purple-800">ICH GCP</Badge>
                      <div className="text-sm">
                        Good Clinical Practice for clinical trial document management
                      </div>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield size={18} className="text-blue-600" />
                    Security Certifications
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <Badge className="mt-0.5 bg-blue-100 text-blue-800">ISO 27001</Badge>
                      <div className="text-sm">
                        Information security management system certification
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge className="mt-0.5 bg-red-100 text-red-800">SOC 2 Type II</Badge>
                      <div className="text-sm">
                        Service Organization Control reporting for security
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge className="mt-0.5 bg-green-100 text-green-800">GDPR</Badge>
                      <div className="text-sm">
                        General Data Protection Regulation compliance for EU data privacy
                      </div>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg border mt-6">
              <h3 className="text-lg font-medium mb-2 flex items-center">
                <FileArchive size={18} className="text-indigo-600 mr-2" />
                Validation Documentation
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                All DocuShare Enterprise deployments include comprehensive validation documentation
                to support regulatory compliance and audit readiness.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-white rounded-lg border">
                  <h4 className="font-medium mb-1 flex items-center">
                    <FileCheck size={14} className="text-blue-600 mr-1.5" />
                    Validation Master Plan (VMP)
                  </h4>
                  <p className="text-xs text-gray-600">
                    Complete documentation of validation strategy
                  </p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <h4 className="font-medium mb-1 flex items-center">
                    <FileCheck size={14} className="text-green-600 mr-1.5" />
                    Installation Qualification (IQ)
                  </h4>
                  <p className="text-xs text-gray-600">Verification of proper installation</p>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <h4 className="font-medium mb-1 flex items-center">
                    <FileCheck size={14} className="text-purple-600 mr-1.5" />
                    Operational Qualification (OQ)
                  </h4>
                  <p className="text-xs text-gray-600">Validation of system functionality</p>
                </div>
              </div>
            </div>

            <div className="flex justify-center mt-8">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Request Enterprise Demo
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
