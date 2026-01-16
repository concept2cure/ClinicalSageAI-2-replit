import React, { useState } from 'react';
import { Helmet } from '../lightweight-wrappers.js';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText, BarChart3, CheckCircle2, ArrowRight, FileBarChart, Microscope, BookOpen, ChevronRight, Upload, Database, Brain, Layout, Folder, FileUp, FileQuestion, Settings, Users, Info, Search } from 'lucide-react'

const LumenBioLanding = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileChange = e => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    setUploading(true);

    // Simulate upload process
    setTimeout(() => {
      setUploading(false);
      setUploadSuccess(true);
      // Reset after showing success message
      setTimeout(() => {
        setUploadSuccess(false);
        setSelectedFile(null);
      }, 3000);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>CONCEPT2CURE.AI | TrialSage™ Platform</title>
      </Helmet>

      {/* Top navigation banner with light amber/cream background */}
      <header className="bg-amber-50 py-2 px-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900">CONCEPT2CURE.AI</h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" className="text-slate-700 hover:text-slate-900">
              <Search className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-200 bg-amber-50 text-slate-800"
            >
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Main header with white background and C2C branding */}
      <div className="border-b border-slate-200 bg-white py-4 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between">
          <div className="flex items-center">
            <div className="bg-amber-100 h-10 w-10 flex items-center justify-center rounded-md mr-3 text-amber-800 font-bold text-sm">
              C2C
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">CONCEPT2CURE.AI</h1>
              <p className="text-xs text-slate-600">TrialSage™ Platform</p>
            </div>
          </div>
          <div className="flex space-x-2 mt-2 md:mt-0">
            <Button variant="outline" className="text-sm border-blue-200 text-blue-700">
              Sign In
            </Button>
            <Button className="text-sm bg-blue-600 hover:bg-blue-700">Get Started</Button>
          </div>
        </div>
      </div>

      {/* Main content header */}
      <header className="bg-gradient-to-b from-blue-50 to-white pt-6 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
                Welcome to Lumen Biosciences
              </h1>
              <p className="text-slate-600 mt-2">Regulatory compliance documentation platform</p>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="bg-white border-blue-200 text-blue-700 hover:bg-blue-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Protocol
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md bg-gradient-to-b from-green-50 to-white">
                  <DialogHeader>
                    <DialogTitle>Protocol Intelligence Engine</DialogTitle>
                    <DialogDescription>
                      Upload your protocol draft for comprehensive AI-driven analysis, optimization,
                      and redesign using our complete regulatory knowledge base, CSR Deep Learning
                      insights, and ICH guideline compliance engine
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="protocol-name">Protocol Name</Label>
                      <Input
                        id="protocol-name"
                        placeholder="e.g., LB-405 Phase 1 Protocol"
                        className="bg-white"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="target-indication">Target Indication</Label>
                      <Input
                        id="target-indication"
                        placeholder="e.g., Clostridium Difficile Infection"
                        className="bg-white"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="study-objectives">Study Objectives</Label>
                      <Textarea
                        id="study-objectives"
                        placeholder="Brief description of primary and secondary objectives"
                        className="bg-white resize-none h-20"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="protocol-file">Protocol File</Label>
                      <div className="border-2 border-dashed border-green-200 rounded-lg p-4 text-center bg-white">
                        {selectedFile ? (
                          <div className="flex flex-col items-center">
                            <FileText className="h-8 w-8 text-green-500 mb-2" />
                            <p className="text-sm font-medium text-gray-700">{selectedFile.name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2 text-red-500 hover:text-red-700"
                              onClick={() => setSelectedFile(null)}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <Upload className="h-8 w-8 text-green-400 mb-2" />
                            <p className="text-sm font-medium text-gray-700">
                              Drag and drop or click to upload
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Supports DOC, DOCX, PDF (Max 10MB)
                            </p>
                            <div className="relative mt-2">
                              <Input
                                id="protocol-file"
                                type="file"
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-50"
                                accept=".doc,.docx,.pdf"
                                onChange={handleFileChange}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-green-200 text-green-600 hover:bg-green-50 pointer-events-none"
                              >
                                Select File
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="sm:justify-between">
                    <div className="flex items-center">
                      {uploadSuccess && (
                        <div className="flex items-center mr-4 text-green-600">
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          <span className="text-sm">
                            Processing complete! View protocol enhancements.
                          </span>
                        </div>
                      )}
                      {!uploadSuccess && !uploading && (
                        <div className="flex items-center text-gray-500 text-xs">
                          <Info className="h-3.5 w-3.5 mr-1" />
                          <span>
                            Comprehensive AI with ICH Guidelines, CSR Deep Learning, and statistical
                            modeling
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || uploading || uploadSuccess}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {uploading ? (
                        <>
                          <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                          Processing with AI...
                        </>
                      ) : (
                        'Optimize & Generate Protocol'
                      )}
                    </Button>
                    <div
                      className="grid grid-cols-3 gap-2 mt-4"
                      style={{ display: uploadSuccess ? 'grid' : 'none' }}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                      >
                        <BookOpen className="h-4 w-4 mr-1" />
                        Design Study
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                      >
                        <FileUp className="h-4 w-4 mr-1" />
                        Enhance Protocol
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                      >
                        <ChevronRight className="h-4 w-4 mr-1" />
                        Analyze
                      </Button>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button className="bg-blue-600 hover:bg-blue-700">
                <FileText className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-blue-800 flex items-center">
                  <FileBarChart className="h-5 w-5 mr-2 text-blue-600" />
                  Active Trials
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-900">5</p>
                <p className="text-sm text-blue-700">2 phase 2, 3 phase 1</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-green-800 flex items-center">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                  Compliance Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-900">94%</p>
                <p className="text-sm text-green-700">Across all projects</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-50 to-amber-100 border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-amber-800 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-amber-600" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-amber-900">42</p>
                <p className="text-sm text-amber-700">8 require attention</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-10">
          <h2 className="text-xl font-semibold text-slate-900 mb-5">Active Products</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-medium">
                  Spirulina-based Antibody Cocktail
                </CardTitle>
                <CardDescription>LB-301 Phase 2 Trial</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Trial Status:</span>
                    <span className="font-medium text-blue-600">Ongoing</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subjects Enrolled:</span>
                    <span className="font-medium">72/120 (60%)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Last Updated:</span>
                    <span className="font-medium">Apr 22, 2025</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Link href="/lumen-bio/report-demo">
                  <Button
                    variant="outline"
                    className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    View Trial Details
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-medium">
                  Ultra-High Yield Production System
                </CardTitle>
                <CardDescription>LB-201 Phase 1 Trial</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Trial Status:</span>
                    <span className="font-medium text-green-600">Completed</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subjects Enrolled:</span>
                    <span className="font-medium">48/48 (100%)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Last Updated:</span>
                    <span className="font-medium">Mar 15, 2025</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  View Trial Details
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Oral Biotherapeutic Platform</CardTitle>
                <CardDescription>LB-405 Phase 1 Trial</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Trial Status:</span>
                    <span className="font-medium text-purple-600">Recruiting</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subjects Enrolled:</span>
                    <span className="font-medium">14/40 (35%)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Last Updated:</span>
                    <span className="font-medium">Apr 18, 2025</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  View Trial Details
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-xl font-semibold text-slate-900 mb-5">Recent Updates</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-medium">ICH Guidelines Updates</CardTitle>
                <CardDescription>
                  Recent regulatory changes affecting your submissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 pb-3 border-b border-gray-100">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        ICH E6(R3) Good Clinical Practice
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Updated on March 15, 2025 with enhanced requirements for data integrity
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 pb-3 border-b border-gray-100">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                      <BookOpen className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        ICH M4Q(R2) Quality Module Updates
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Published on February 8, 2025 with focus on biologic products
                      </p>
                    </div>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  View All Guidelines
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>

            <Card className="border border-gray-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg font-medium">Document Activity</CardTitle>
                <CardDescription>
                  Latest activity across your regulatory documentation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3 pb-3 border-b border-gray-100">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-50 rounded-full flex items-center justify-center">
                      <FileText className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        Interim Clinical Study Report - LB-301
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Updated by Dr. Sarah Chen - Apr 18, 2025
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3 pb-3 border-b border-gray-100">
                    <div className="flex-shrink-0 w-8 h-8 bg-amber-50 rounded-full flex items-center justify-center">
                      <FileText className="h-4 w-4 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        Investigator's Brochure - Spirulina-based Antibody Cocktail
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Updated by Dr. James Wilson - Apr 5, 2025
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-50 rounded-full flex items-center justify-center">
                      <FileText className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">
                        Statistical Analysis Plan - LB-405
                      </p>
                      <p className="text-sm text-slate-600 mt-1">
                        Created by Dr. Michelle Lee - Apr 2, 2025
                      </p>
                    </div>
                  </li>
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                >
                  View All Documents
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Button
              variant="outline"
              className="h-auto py-3 px-4 flex justify-between items-center text-left bg-white border-gray-200 shadow-sm hover:bg-blue-50 hover:border-blue-200"
            >
              <div className="flex items-center">
                <FileBarChart className="h-5 w-5 text-blue-600 mr-3" />
                <span className="font-medium text-slate-900">Compliance Reports</span>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </Button>

            <Button
              variant="outline"
              className="h-auto py-3 px-4 flex justify-between items-center text-left bg-white border-gray-200 shadow-sm hover:bg-blue-50 hover:border-blue-200"
            >
              <div className="flex items-center">
                <Microscope className="h-5 w-5 text-blue-600 mr-3" />
                <span className="font-medium text-slate-900">Study Designs</span>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </Button>

            <Link href="/lumen-bio/report-demo">
              <Button
                variant="outline"
                className="h-auto py-3 px-4 flex justify-between items-center text-left bg-white border-gray-200 shadow-sm hover:bg-blue-50 hover:border-blue-200 w-full"
              >
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-blue-600 mr-3" />
                  <span className="font-medium text-slate-900">LB-301 Reports</span>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </Button>
            </Link>

            <Link href="/ich-wiz">
              <Button
                variant="outline"
                className="h-auto py-3 px-4 flex justify-between items-center text-left bg-white border-gray-200 shadow-sm hover:bg-blue-50 hover:border-blue-200 w-full"
              >
                <div className="flex items-center">
                  <BookOpen className="h-5 w-5 text-blue-600 mr-3" />
                  <span className="font-medium text-slate-900">ICH Guidelines</span>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="mb-10">
          <h2 className="text-xl font-semibold text-slate-900 mb-6">All Modules & Features</h2>

          <Tabs defaultValue="regulatory" className="w-full">
            <TabsList className="mb-6 w-full justify-start bg-slate-50 p-1">
              <TabsTrigger value="regulatory" className="text-sm">
                Regulatory Intelligence
              </TabsTrigger>
              <TabsTrigger value="documents" className="text-sm">
                Document Management
              </TabsTrigger>
              <TabsTrigger value="ai-agents" className="text-sm">
                AI Agents & Tools
              </TabsTrigger>
              <TabsTrigger value="trials" className="text-sm">
                Clinical Trials
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-sm">
                Admin Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="regulatory" className="border-none p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <BookOpen className="h-5 w-5 mr-2 text-blue-600" />
                      ICH Wiz
                    </CardTitle>
                    <CardDescription>Digital Compliance Coach with ICH Guidelines</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Access comprehensive ICH Guidelines with AI-powered interpretation and
                      regulatory insights.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/ich-wiz">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Access ICH Wiz
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <FileBarChart className="h-5 w-5 mr-2 text-blue-600" />
                      Validation Hub
                    </CardTitle>
                    <CardDescription>eCTD Submission Validation</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Validate your eCTD submissions against FDA, EMA, and global regulatory
                      standards.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/validation-hub-enhanced">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Open Validation Hub
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                      Compliance Analytics
                    </CardTitle>
                    <CardDescription>Regulatory Compliance Dashboard</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Get real-time insights and analytics on your regulatory compliance across all
                      documents.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/analytics-dashboard">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        View Analytics
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="documents" className="border-none p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Folder className="h-5 w-5 mr-2 text-blue-600" />
                      Document Vault
                    </CardTitle>
                    <CardDescription>Secure Document Management</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Centralized storage with version control for all your regulatory
                      documentation.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/enterprise-vault">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Access Vault
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <FileUp className="h-5 w-5 mr-2 text-blue-600" />
                      Document Upload
                    </CardTitle>
                    <CardDescription>Batch Upload & Processing</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Upload and automatically process multiple regulatory documents with AI
                      analysis.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/document-management">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Upload Documents
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <FileQuestion className="h-5 w-5 mr-2 text-blue-600" />
                      Document Risk Analysis
                    </CardTitle>
                    <CardDescription>AI-powered Risk Assessment</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Identify potential compliance risks and issues in your regulatory
                      documentation.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/document-risk/analysis">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Analyze Risk
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="ai-agents" className="border-none p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Brain className="h-5 w-5 mr-2 text-blue-600" />
                      ICH Wiz Agent
                    </CardTitle>
                    <CardDescription>Regulatory Intelligence AI</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Interact with our AI specialist for regulatory guidance and interpretation of
                      ICH standards.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/lumen-bio/ich-wiz">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Chat with ICH Wiz
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-blue-600" />
                      Protocol Optimizer
                    </CardTitle>
                    <CardDescription>AI-driven Protocol Review</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Upload and analyze clinical protocols with AI recommendations for optimization
                      and compliance.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/protocol-review">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Optimize Protocol
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Layout className="h-5 w-5 mr-2 text-blue-600" />
                      IND Wizard
                    </CardTitle>
                    <CardDescription>IND Submission Builder</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Create comprehensive IND submissions with AI-guided workflows and templates.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/ind-wizard">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Launch IND Wizard
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="trials" className="border-none p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Database className="h-5 w-5 mr-2 text-blue-600" />
                      CSR Intelligence
                    </CardTitle>
                    <CardDescription>Clinical Study Report Analysis</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Access and analyze over 3,000 clinical study reports for cross-trial
                      benchmarking.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/csr-intelligence">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Access CSR Intelligence
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Microscope className="h-5 w-5 mr-2 text-blue-600" />
                      Study Architect
                    </CardTitle>
                    <CardDescription>AI-driven Study Design</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Design and optimize clinical trials with AI-powered statistical simulation
                      capabilities.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/study-planner">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Design Study
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <FileBarChart className="h-5 w-5 mr-2 text-blue-600" />
                      Trial Reports
                    </CardTitle>
                    <CardDescription>Enhanced Trial Reporting</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Access detailed reports and analytics for your active and completed clinical
                      trials.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/lumen-bio/reports">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        View Trial Reports
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Database className="h-5 w-5 mr-2 text-blue-600" />
                      Clinical Metadata Repository
                    </CardTitle>
                    <CardDescription>Centralized Metadata Management</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Centrally manage, version, and govern forms, terminologies, and datasets
                      across your clinical trials.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/cmdr">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Access CMDR
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="border-none p-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Users className="h-5 w-5 mr-2 text-blue-600" />
                      User Management
                    </CardTitle>
                    <CardDescription>Team Access & Permissions</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Manage user accounts, roles, and permissions for your organization.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/portal/client?tab=users">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Manage Users
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <Settings className="h-5 w-5 mr-2 text-blue-600" />
                      Account Settings
                    </CardTitle>
                    <CardDescription>Preferences & Configuration</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      Configure your account settings, notifications, and integration preferences.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/portal/client?tab=settings">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        Access Settings
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium flex items-center">
                      <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                      Usage Analytics
                    </CardTitle>
                    <CardDescription>System Usage & Metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <p className="text-sm text-slate-600">
                      View detailed analytics on system usage, document access, and AI interactions.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Link href="/portal/client?tab=analytics">
                      <Button
                        variant="outline"
                        className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        View Usage Analytics
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default LumenBioLanding;
