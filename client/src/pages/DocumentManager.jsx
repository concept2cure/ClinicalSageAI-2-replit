import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText, Clock, CheckCircle, AlertCircle, Search, Filter, FolderOpen, Edit3, Eye, Download } from 'lucide-react'
import NavigationBanner from '../components/common/NavigationBanner';

function DocumentManager() {
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);

  // Pre-populated projects with your actual task IDs
  const predefinedProjects = [
    {
      taskId: '45794042-e4d2-4cb1-861c-06dfb25c308b',
      title: 'Clinical Overview - CAR-T19 Cell Therapy IND Application',
      productName: 'CAR-T19 Cell Therapy',
      indication: 'Relapsed/Refractory B-Cell Acute Lymphoblastic Leukemia',
      sponsor: 'BioPharma Research Inc',
      ectdSection: 'Module 2.5 Clinical Overview',
      submissionType: 'IND',
      therapeuticArea: 'Oncology',
      phase: 'Phase I/II',
      strategy: 'Fast Track Designation',
      status: 'COMPLETED',
      progress: 100,
      lastModified: new Date().toISOString(),
      created: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      taskId: 'ded37620-71ad-470d-84b1-0d5e433d794f',
      title: 'Clinical Summary - CardioPro-ACE NDA Submission',
      productName: 'CardioPro-ACE 10mg',
      indication: 'Essential Hypertension in Type 2 Diabetes',
      sponsor: 'Cardiovascular Therapeutics LLC',
      ectdSection: 'Module 2.7 Clinical Summary',
      submissionType: 'NDA',
      therapeuticArea: 'Cardiology',
      phase: 'Phase III',
      strategy: 'Standard Review',
      status: 'COMPLETED',
      progress: 100,
      lastModified: new Date().toISOString(),
      created: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      taskId: 'aecf942d-4806-47a0-a9b1-5ef9ef715a7c',
      title: 'Environmental Risk Assessment - BetaBlock-MRSA',
      productName: 'BetaBlock-MRSA 500mg',
      indication: 'Methicillin-Resistant Staphylococcus Aureus Infections',
      sponsor: 'Antimicrobial Solutions Inc',
      ectdSection: 'Module 1.14 Environmental Assessment',
      submissionType: 'NDA',
      therapeuticArea: 'Infectious Disease',
      phase: 'Phase II/III',
      strategy: 'QIDP Designation',
      status: 'COMPLETED',
      progress: 100,
      lastModified: new Date().toISOString(),
      created: new Date(Date.now() - 259200000).toISOString(),
    },
    {
      taskId: '8c6143b1-ba02-4ed9-a423-f7aaec1d420e',
      title: 'Control of Drug Substance - ImmunoLung-PD1',
      productName: 'ImmunoLung-PD1 240mg/mL',
      indication: 'Metastatic Non-Small Cell Lung Cancer',
      sponsor: 'Immuno-Oncology Therapeutics',
      ectdSection: 'Module 3.2.S.4 Control of Drug Substance',
      submissionType: 'BLA',
      therapeuticArea: 'Oncology',
      phase: 'Phase III',
      strategy: 'Breakthrough Therapy',
      status: 'COMPLETED',
      progress: 100,
      lastModified: new Date().toISOString(),
      created: new Date(Date.now() - 345600000).toISOString(),
    },
    {
      taskId: '75f80822-8035-49ef-88af-ffc49cff310d',
      title: 'Primary Pharmacodynamics - GeneDMD-AAV9',
      productName: 'GeneDMD-AAV9 Vector',
      indication: 'Duchenne Muscular Dystrophy',
      sponsor: 'Gene Therapy Research Corp',
      ectdSection: 'Module 4.2.1.1 Primary Pharmacodynamics',
      submissionType: 'IND',
      therapeuticArea: 'Rare Disease',
      phase: 'Phase I/II',
      strategy: 'Orphan Drug Designation',
      status: 'COMPLETED',
      progress: 100,
      lastModified: new Date().toISOString(),
      created: new Date(Date.now() - 432000000).toISOString(),
    },
    {
      taskId: 'e708245b-b8e3-484c-ab54-1caba54994bf',
      title: 'Phase III Clinical Study Report - TauBlock-AD',
      productName: 'TauBlock-AD 150mg',
      indication: 'Mild to Moderate Alzheimer Disease',
      sponsor: 'Neurodegenerative Research Institute',
      ectdSection: 'Module 5.3.5.1 Clinical Study Report',
      submissionType: 'NDA',
      therapeuticArea: 'Neurology',
      phase: 'Phase III',
      strategy: 'Fast Track Designation',
      status: 'COMPLETED',
      progress: 100,
      lastModified: new Date().toISOString(),
      created: new Date(Date.now() - 518400000).toISOString(),
    },
  ];

  useEffect(() => {
    // Simulate loading and set predefined projects
    setTimeout(() => {
      setProjects(predefinedProjects);
      setLoading(false);
    }, 1000);
  }, []);

  const filteredProjects = projects.filter(project => {
    const matchesSearch =
      project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.indication.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.sponsor.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filterStatus === 'all' || project.status.toLowerCase() === filterStatus.toLowerCase();

    return matchesSearch && matchesFilter;
  });

  const getStatusIcon = status => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'PROCESSING':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'FAILED':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = status => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleOpenEditor = taskId => {
    window.location.href = `/editor?taskId=${taskId}`;
  };

  const formatDate = dateString => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavigationBanner />
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">Loading your documents...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavigationBanner />

      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <FolderOpen className="h-8 w-8 mr-3 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Document Manager</h1>
                <p className="text-gray-600 mt-1">Manage and access your regulatory documents</p>
              </div>
            </div>

            <Button
              onClick={() => (window.location.href = '/coauthor')}
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              <FileText className="h-5 w-5 mr-2" />
              Create New Document
            </Button>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="mb-6 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search documents, products, indications..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md bg-white"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Documents</p>
                  <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Completed</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {projects.filter(p => p.status === 'COMPLETED').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">In Progress</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {projects.filter(p => p.status === 'PROCESSING').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertCircle className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Needs Attention</p>
                  <p className="text-2xl font-bold text-gray-900">0</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Documents List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Regulatory Documents</CardTitle>
            <CardDescription>
              Click "Open in Editor" to access the sophisticated medical writing assistant
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredProjects.map(project => (
                <div
                  key={project.taskId}
                  className="border rounded-lg p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(project.status)}
                        <h3 className="text-lg font-semibold text-gray-900">{project.title}</h3>
                        <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm text-gray-600">
                        <div>
                          <p className="font-medium">Product</p>
                          <p>{project.productName}</p>
                        </div>
                        <div>
                          <p className="font-medium">Indication</p>
                          <p>{project.indication}</p>
                        </div>
                        <div>
                          <p className="font-medium">Phase</p>
                          <p>{project.phase}</p>
                        </div>
                        <div>
                          <p className="font-medium">Submission Type</p>
                          <p>{project.submissionType}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm text-gray-600">
                        <div>
                          <p className="font-medium">eCTD Section</p>
                          <p>{project.ectdSection}</p>
                        </div>
                        <div>
                          <p className="font-medium">Sponsor</p>
                          <p>{project.sponsor}</p>
                        </div>
                        <div>
                          <p className="font-medium">Strategy</p>
                          <p>{project.strategy}</p>
                        </div>
                        <div>
                          <p className="font-medium">Therapeutic Area</p>
                          <p>{project.therapeuticArea}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Created: {formatDate(project.created)}</span>
                        <span>Last Modified: {formatDate(project.lastModified)}</span>
                        <span>Task ID: {project.taskId}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 ml-6">
                      <Button
                        onClick={() => handleOpenEditor(project.taskId)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        Open in Editor
                      </Button>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>

                  {project.progress < 100 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{project.progress}%</span>
                      </div>
                      <Progress value={project.progress} className="h-2" />
                    </div>
                  )}
                </div>
              ))}

              {filteredProjects.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm || filterStatus !== 'all'
                      ? 'Try adjusting your search or filter criteria'
                      : 'Get started by creating your first regulatory document'}
                  </p>
                  <Button onClick={() => (window.location.href = '/coauthor')}>
                    <FileText className="h-4 w-4 mr-2" />
                    Create New Document
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default DocumentManager;
