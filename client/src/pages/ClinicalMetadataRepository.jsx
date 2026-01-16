import React, { useState, useEffect } from 'react';
import { Helmet } from '../lightweight-wrappers.js';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Database, Search, History, FileText, ArrowRight, Layers, CheckCircle2, GitBranch, Clipboard, RefreshCw, AlertTriangle, BarChart, Brain, Sparkles, Wand2, Zap, FileJson, AlertCircle } from 'lucide-react'

const ClinicalMetadataRepository = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Simulate intelligence analysis
  const handleIntelligentMapping = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast({
        title: 'Intelligent Mapping Generated',
        description: 'The metadata has been analyzed and mapped to SDTM standards.',
      });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Helmet>
        <title>Clinical Metadata Repository (CMDR) | TrialSage™</title>
        <meta
          name="description"
          content="Centralized management of clinical trial metadata for regulatory compliance and operational efficiency"
        />
      </Helmet>

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">
              Clinical Metadata Repository (CMDR)
            </h1>
            <div className="flex space-x-3">
              <Link href="/">
                <Button variant="outline">Back to Home</Button>
              </Link>
              <Button>Get Started</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="mb-12">
          <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-xl overflow-hidden shadow-sm border border-gray-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-8">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold text-blue-900">
                  Centralized Metadata Management
                </h2>
                <p className="text-lg text-slate-700">
                  The Clinical Metadata Repository (CMDR) provides a single source of truth for all
                  clinical trial metadata, helping you standardize, govern, and optimize your
                  clinical data and standards.
                </p>
                <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-3">
                  <Button className="bg-blue-600 hover:bg-blue-700">Request Demo</Button>
                  <Button
                    variant="outline"
                    className="border-blue-200 text-blue-600 hover:bg-blue-50"
                  >
                    View Documentation
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 bg-opacity-10 rounded-lg transform rotate-3"></div>
                  <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <Database className="h-6 w-6 text-blue-600 mr-2" />
                        <h3 className="font-semibold text-lg">Centralized Repository</h3>
                      </div>
                      <div className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                        Active
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                        <span className="text-gray-600">Forms:</span>
                        <span className="font-medium">142</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                        <span className="text-gray-600">Terminologies:</span>
                        <span className="font-medium">74</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                        <span className="text-gray-600">Datasets:</span>
                        <span className="font-medium">53</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b border-gray-100">
                        <span className="text-gray-600">Mappings:</span>
                        <span className="font-medium">32</span>
                      </div>
                      <div className="flex justify-between text-sm py-1">
                        <span className="text-gray-600">Version Control:</span>
                        <span className="font-medium text-green-600">Enabled</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Value Proposition */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Value Proposition</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium flex items-center">
                  <CheckCircle2 className="h-5 w-5 mr-2 text-green-600" />
                  Regulatory Compliance
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 pt-0">
                <p className="text-sm text-slate-600">
                  Ensure compliance with FDA, EMA, and ICH standards through standardized, governed
                  metadata with audit trails and version control.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium flex items-center">
                  <RefreshCw className="h-5 w-5 mr-2 text-blue-600" />
                  Operational Efficiency
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 pt-0">
                <p className="text-sm text-slate-600">
                  Reduce study startup time by 30-45% through reuse of validated forms, controlled
                  terminologies, and standardized datasets.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium flex items-center">
                  <BarChart className="h-5 w-5 mr-2 text-purple-600" />
                  Data Quality
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 pt-0">
                <p className="text-sm text-slate-600">
                  Improve clinical data quality with standardized forms, consistent terminologies,
                  and validated datasets across all trials.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Advanced AI-Powered Features - Goes beyond Certara's offering */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-3">
            Advanced AI-Powered Capabilities
          </h2>
          <p className="text-gray-600 mb-6">
            Our CMDR leverages OpenAI's latest models to deliver intelligence beyond traditional
            metadata management.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-blue-50">
              <CardHeader className="pb-3 border-b border-gray-100">
                <CardTitle className="flex items-center text-emerald-800">
                  <Brain className="h-5 w-5 mr-2 text-emerald-600" />
                  Semantic Metadata Analysis
                </CardTitle>
                <CardDescription>
                  AI-powered semantic understanding of metadata relationships
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div className="flex items-start">
                    <Sparkles className="h-5 w-5 text-emerald-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        Cross-Trial Consistency Analysis
                      </h4>
                      <p className="text-sm text-gray-600">
                        GPT-4o powered analysis identifies inconsistencies across trial metadata
                        that traditional systems miss.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Zap className="h-5 w-5 text-emerald-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        Intelligent Data Mapping
                      </h4>
                      <p className="text-sm text-gray-600">
                        Advanced algorithms map semantically similar fields even with different
                        naming conventions.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Wand2 className="h-5 w-5 text-emerald-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        Automated Standardization
                      </h4>
                      <p className="text-sm text-gray-600">
                        AI suggests standardization improvements based on industry best practices
                        and regulatory requirements.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-white bg-opacity-50 pt-3 pb-4">
                <Button className="bg-emerald-600 hover:bg-emerald-700">
                  Explore AI Capabilities
                </Button>
              </CardFooter>
            </Card>

            <Card className="overflow-hidden border-0 shadow-lg">
              <div className="bg-gray-50 p-4">
                <h3 className="text-lg font-medium mb-2">Metadata Intelligence Demo</h3>
                <div className="rounded-md bg-white border border-gray-200 p-4">
                  <div className="mb-4">
                    <Label htmlFor="metadataInput">Enter CRF field description:</Label>
                    <Textarea
                      id="metadataInput"
                      placeholder="E.g. Patient blood pressure measured in mmHg using standard cuff, supine position"
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-between mb-4">
                    <Button size="sm" variant="outline" className="text-xs">
                      <FileJson className="h-3 w-3 mr-1" />
                      JSON Output
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Validation Check
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs">
                      <GitBranch className="h-3 w-3 mr-1" />
                      Find Similar
                    </Button>
                  </div>
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={handleIntelligentMapping}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      'Generate Intelligent Mapping'
                    )}
                  </Button>

                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <div className="text-xs text-gray-500 mb-2">Analysis Results (Sample)</div>
                    <div className="bg-gray-50 rounded p-3 text-xs font-mono">
                      <div className="flex justify-between">
                        <span className="text-gray-600">SDTM Mapping:</span>
                        <span className="font-medium">VS.VSTESTCD=BP, VS.VSPOS=SUPINE</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-gray-600">CDISC Compliance:</span>
                        <span className="font-medium text-green-600">98% Match</span>
                      </div>
                      <div className="mt-1 text-blue-600">
                        Semantic matches: 3 similar fields found in current repository
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Advanced Vector Search - Beyond Certara's capabilities */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Advanced Vector Search with OpenAI
          </h2>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
              <div className="lg:col-span-3">
                <h3 className="text-xl font-medium text-gray-900 mb-3">Semantic Metadata Search</h3>
                <p className="text-slate-700 mb-4">
                  Leverage OpenAI's GPT-4o and embeddings to search for metadata based on meaning
                  rather than just keywords. This AI-powered approach enables finding relevant
                  metadata even when terminology varies across studies.
                </p>

                <div className="mb-6">
                  <Label htmlFor="semanticSearch">Search clinical metadata semantically:</Label>
                  <div className="flex mt-2">
                    <Input
                      id="semanticSearch"
                      placeholder="E.g. find all blood pressure measurements in pediatric studies"
                      className="flex-1 rounded-r-none"
                    />
                    <Button className="rounded-l-none bg-blue-600 hover:bg-blue-700">
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Powered by OpenAI's embeddings technology for contextual understanding
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-start">
                    <Sparkles className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        Vector-Based Similarity Search
                      </h4>
                      <p className="text-sm text-gray-600">
                        Using embeddings to transform metadata into high-dimensional vectors for
                        accurate similarity detection.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Sparkles className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        Cross-Study Semantic Inference
                      </h4>
                      <p className="text-sm text-gray-600">
                        Identify semantically related metadata across studies even when naming
                        conventions differ.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Sparkles className="h-5 w-5 text-blue-500 mt-0.5 mr-2 flex-shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        Natural Language Metadata Queries
                      </h4>
                      <p className="text-sm text-gray-600">
                        Write queries in plain English to find relevant metadata across your
                        organization.
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="bg-blue-600 hover:bg-blue-700">
                  Learn More About Vector Search
                </Button>
              </div>

              <div className="lg:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Sample Results</h4>
                <div className="space-y-3">
                  <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
                    <div className="text-sm font-medium text-blue-700 mb-1">
                      VS.VSTESTCD=BP (98% match)
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      Blood pressure measurement - Study XYZ-001
                    </div>
                    <div className="bg-blue-50 text-xs p-1 rounded">
                      <span className="font-medium">Semantic context:</span> Vital sign,
                      cardiovascular assessment
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
                    <div className="text-sm font-medium text-blue-700 mb-1">
                      PEDIATRIC.VS.BPSYS (94% match)
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      Systolic blood pressure - Pediatric Study ABC-123
                    </div>
                    <div className="bg-blue-50 text-xs p-1 rounded">
                      <span className="font-medium">Semantic context:</span> Pediatric vital sign
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded shadow-sm border border-gray-100">
                    <div className="text-sm font-medium text-blue-700 mb-1">
                      CARDIO.HEMO.BP (89% match)
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      Hemodynamic blood pressure - Study DEF-789
                    </div>
                    <div className="bg-blue-50 text-xs p-1 rounded">
                      <span className="font-medium">Semantic context:</span> Cardiovascular
                      assessment
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  <Progress value={42} className="h-1 mb-1" />
                  42 additional semantically similar metadata elements found across 18 studies
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Key Use Cases</h2>
          <Tabs defaultValue="forms">
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="forms">Forms Management</TabsTrigger>
              <TabsTrigger value="terminology">Terminology Management</TabsTrigger>
              <TabsTrigger value="datasets">Dataset Standards</TabsTrigger>
              <TabsTrigger value="governance">Governance & Compliance</TabsTrigger>
            </TabsList>

            <TabsContent value="forms" className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="col-span-2">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      Standardized Form Management
                    </h3>
                    <p className="text-slate-700 mb-4">
                      Create, manage, and version eCRF forms with full governance and reuse
                      capabilities across studies.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Centralized library of validated eCRF forms with reusable components
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Version control with full history tracking for regulatory compliance
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Form validation against standards with automated quality checks
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Direct export to EDC systems with validated mappings
                        </span>
                      </li>
                    </ul>
                    <div className="mt-6">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Explore Form Management
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-2">Impact Statistics</h4>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Time Savings</span>
                          <span className="font-medium">45%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '45%' }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>Error Reduction</span>
                          <span className="font-medium">62%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '62%' }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>EDC Integration</span>
                          <span className="font-medium">83%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '83%' }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mr-2" />
                        <span className="text-xs text-gray-500">
                          Without standardized forms, 32% of studies face deployment delays.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="terminology" className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="col-span-2">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      Controlled Terminology Management
                    </h3>
                    <p className="text-slate-700 mb-4">
                      Govern industry-standard and custom terminologies with semantic mappings and
                      cross-study consistency.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Support for CDISC, MedDRA, LOINC, SNOMED-CT, and custom dictionaries
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Semantic search with intelligent term matching
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Version control for terminology updates with differential analysis
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Automated consistency checks across studies
                        </span>
                      </li>
                    </ul>
                    <div className="mt-6">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Explore Terminology Management
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-2">Terminology Coverage</h4>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>CDISC SDTM</span>
                          <span className="font-medium">100%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '100%' }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>MedDRA v25.0</span>
                          <span className="font-medium">100%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '100%' }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>LOINC</span>
                          <span className="font-medium">94%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '94%' }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span>WHO-DD</span>
                          <span className="font-medium">98%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '98%' }}
                          ></div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Controlled Terms:</span>
                        <span className="text-xs font-medium">243,826</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="datasets" className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="col-span-2">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      Dataset Standards Management
                    </h3>
                    <p className="text-slate-700 mb-4">
                      Centralize SDTM, ADaM, and custom dataset definitions with programmatic
                      generation and validation.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Full compliance with CDISC SDTM, ADaM, and SEND standards
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Automated dataset creation from standardized templates
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Integration with statistical programming environments (R, SAS, Python)
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Automated validation against regulatory standards
                        </span>
                      </li>
                    </ul>
                    <div className="mt-6">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Explore Dataset Standards
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-2">Standards Compliance</h4>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm">CDISC compliance score</span>
                      <div className="flex items-center">
                        <span className="font-medium text-green-600 mr-1">94.8%</span>
                        <span className="text-xs text-green-600">↑2.3%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span>SDTM IG v3.3</span>
                        <span className="font-medium">Supported</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>ADaM IG v1.2</span>
                        <span className="font-medium">Supported</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>SEND 3.1</span>
                        <span className="font-medium">Supported</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>FDA Data Standards Catalog</span>
                        <span className="font-medium">Compliant</span>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mr-2" />
                        <span className="text-xs text-gray-500">
                          SDTM v2.0 is now required for new FDA submissions
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="governance" className="space-y-6">
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="col-span-2">
                    <h3 className="text-xl font-semibold text-gray-900 mb-3">
                      Governance & Compliance
                    </h3>
                    <p className="text-slate-700 mb-4">
                      Implement comprehensive governance workflows with role-based access control
                      and audit trails.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Role-based access control with detailed permissions
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Complete audit trail for 21 CFR Part 11 compliance
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Configurable approval workflows with electronic signatures
                        </span>
                      </li>
                      <li className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-600">
                          Impact analysis for proposed metadata changes
                        </span>
                      </li>
                    </ul>
                    <div className="mt-6">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                        Explore Governance Features
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-2">Regulatory Support</h4>
                    <div className="bg-white p-3 rounded border border-gray-200 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">21 CFR Part 11</span>
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                          Compliant
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Full electronic records and signature compliance with audit trails, access
                        controls, and validation documentation.
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">ICH Guidelines</span>
                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                          Supported
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center">
                          <CheckCircle2 className="h-3 w-3 text-green-600 mr-1" />
                          <span>ICH E2B(R3)</span>
                        </div>
                        <div className="flex items-center">
                          <CheckCircle2 className="h-3 w-3 text-green-600 mr-1" />
                          <span>ICH E3</span>
                        </div>
                        <div className="flex items-center">
                          <CheckCircle2 className="h-3 w-3 text-green-600 mr-1" />
                          <span>ICH E6(R2)</span>
                        </div>
                        <div className="flex items-center">
                          <CheckCircle2 className="h-3 w-3 text-green-600 mr-1" />
                          <span>ICH E9</span>
                        </div>
                        <div className="flex items-center">
                          <CheckCircle2 className="h-3 w-3 text-green-600 mr-1" />
                          <span>ICH M2</span>
                        </div>
                        <div className="flex items-center">
                          <CheckCircle2 className="h-3 w-3 text-green-600 mr-1" />
                          <span>ICH M10</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </section>

        {/* Call to Action */}
        <section className="mb-12">
          <div className="rounded-xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <h2 className="text-2xl font-bold mb-4">
                    Ready to Transform Your Clinical Trial Metadata Management?
                  </h2>
                  <p className="text-blue-100 mb-6">
                    Join leading pharmaceutical companies and CROs who have accelerated their study
                    startup by 40% and improved data quality across trials.
                  </p>
                  <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                    <Button className="bg-white text-blue-700 hover:bg-blue-50">
                      Request a Demo
                    </Button>
                    <Button
                      variant="outline"
                      className="text-white border-white/30 hover:bg-blue-700/50"
                    >
                      Learn More
                    </Button>
                  </div>
                </div>
                <div className="bg-blue-900/20 rounded-lg p-5 border border-blue-400/30">
                  <h3 className="text-xl font-medium mb-4">
                    Why Top 10 Pharma Companies Choose Our CMDR
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-blue-300 mt-0.5 mr-2 flex-shrink-0" />
                      <p className="text-blue-100">
                        AI-powered intelligence that goes beyond traditional CMDR capabilities
                      </p>
                    </div>
                    <div className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-blue-300 mt-0.5 mr-2 flex-shrink-0" />
                      <p className="text-blue-100">
                        Seamless integration with existing EDC, CTMS, and statistical systems
                      </p>
                    </div>
                    <div className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-blue-300 mt-0.5 mr-2 flex-shrink-0" />
                      <p className="text-blue-100">
                        Enterprise-grade security and compliance with regulatory standards
                      </p>
                    </div>
                    <div className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-blue-300 mt-0.5 mr-2 flex-shrink-0" />
                      <p className="text-blue-100">
                        Dedicated implementation and support from clinical metadata experts
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default ClinicalMetadataRepository;
