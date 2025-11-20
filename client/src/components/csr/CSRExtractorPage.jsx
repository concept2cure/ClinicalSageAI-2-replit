import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { Button } from '@/components/ui/button';
import { Upload, Search, Layers, FileText, ChevronRight, BarChart2 } from 'lucide-react';

export default function CSRExtractorPage() {
  const [activeTab, setActiveTab] = useState('upload');

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">CSR Library & Intelligence</h1>
        <p className="text-gray-600">
          Upload, extract, search, and analyze Clinical Study Reports (CSRs) to leverage insights
          across your organization.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span>Upload & Extract</span>
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span>Search & Explore</span>
          </TabsTrigger>
          <TabsTrigger value="alignment" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>Study Alignment</span>
          </TabsTrigger>
          <TabsTrigger value="metrics" className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            <span>Metrics Dashboard</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Upload CSR Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Drag and drop CSR files</h3>
                  <p className="text-gray-500 mb-4">
                    Supports PDF, DOC/DOCX, and other document formats
                  </p>
                  <Button>
                    <Upload className="h-4 w-4 mr-2" />
                    Browse Files
                  </Button>
                </div>

                <div className="mt-6">
                  <h3 className="font-medium mb-2">Recent Uploads</h3>
                  <div className="space-y-2">
                    <div className="p-3 border rounded-md">
                      <div className="flex justify-between">
                        <span className="font-medium">Phase 2 Oncology Study.pdf</span>
                        <span className="text-sm text-gray-500">3 hours ago</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-sm text-gray-500">Processing complete</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-3 border rounded-md">
                      <div className="flex justify-between">
                        <span className="font-medium">Diabetes Phase 3 CSR.docx</span>
                        <span className="text-sm text-gray-500">Yesterday</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-sm text-gray-500">Processing complete</span>
                        <Button variant="ghost" size="sm" className="h-6 px-2">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="h-full">
              <CardHeader>
                <CardTitle>Extraction Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2">Document Processing Options</h3>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="extract-tables"
                          className="mr-2"
                          defaultChecked
                        />
                        <label htmlFor="extract-tables">Extract tables and figures</label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="ocr-processing"
                          className="mr-2"
                          defaultChecked
                        />
                        <label htmlFor="ocr-processing">Apply OCR for image-based text</label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="section-detection"
                          className="mr-2"
                          defaultChecked
                        />
                        <label htmlFor="section-detection">Automatic section detection</label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="metadata-extraction"
                          className="mr-2"
                          defaultChecked
                        />
                        <label htmlFor="metadata-extraction">Extract document metadata</label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2">AI Processing</h3>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="protocol-alignment"
                          className="mr-2"
                          defaultChecked
                        />
                        <label htmlFor="protocol-alignment">Protocol alignment analysis</label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="endpoint-extraction"
                          className="mr-2"
                          defaultChecked
                        />
                        <label htmlFor="endpoint-extraction">
                          Primary/secondary endpoint extraction
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" id="ae-analysis" className="mr-2" defaultChecked />
                        <label htmlFor="ae-analysis">Adverse event detailed analysis</label>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button className="w-full">Apply Settings</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle>CSR Search & Exploration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search across all CSRs (e.g., specific indication, endpoint, adverse event...)"
                    className="w-full pl-10 py-2 pr-4 border border-gray-300 rounded-md"
                  />
                </div>

                <div className="flex mt-2 space-x-2">
                  <Button variant="outline" size="sm">
                    Filter by Indication
                  </Button>
                  <Button variant="outline" size="sm">
                    Filter by Phase
                  </Button>
                  <Button variant="outline" size="sm">
                    Filter by Year
                  </Button>
                  <Button variant="outline" size="sm">
                    More Filters
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium">Search Results</h3>

                <div className="border rounded-md p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">
                        Phase 2 Study of XYZ-123 in Rheumatoid Arthritis
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Protocol ID: XYZ-123-RA-201 | Date: 2022-06-15
                      </p>
                    </div>
                    <Button size="sm">View Document</Button>
                  </div>

                  <div className="mt-4 bg-gray-50 p-3 rounded-md">
                    <p className="text-sm">
                      <span className="font-medium">Matched Content:</span> "...the primary endpoint
                      of ACR20 response rate at Week 12 was achieved in{' '}
                      <mark className="bg-yellow-200">68% of patients in the high-dose group</mark>{' '}
                      compared to 35% in the placebo group (p&lt;0.001)..."
                    </p>
                  </div>
                </div>

                <div className="border rounded-md p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">Phase 3 Study of ABC-456 in Type 2 Diabetes</h4>
                      <p className="text-sm text-gray-600 mt-1">
                        Protocol ID: ABC-456-T2D-301 | Date: 2023-01-10
                      </p>
                    </div>
                    <Button size="sm">View Document</Button>
                  </div>

                  <div className="mt-4 bg-gray-50 p-3 rounded-md">
                    <p className="text-sm">
                      <span className="font-medium">Matched Content:</span> "...subjects receiving
                      the study drug demonstrated a statistically significant reduction in HbA1c of{' '}
                      <mark className="bg-yellow-200">1.8% from baseline</mark> after 24 weeks of
                      treatment compared to 0.4% in the control group..."
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alignment">
          <Card>
            <CardHeader>
              <CardTitle>CSR Study Alignment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6">
                <p className="text-gray-600">
                  Compare key study information across multiple CSRs to identify trends and
                  patterns.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border px-4 py-2 text-left">Parameter</th>
                      <th className="border px-4 py-2 text-left">Study XYZ-123-RA-201</th>
                      <th className="border px-4 py-2 text-left">Study XYZ-123-RA-202</th>
                      <th className="border px-4 py-2 text-left">Study XYZ-123-RA-301</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border px-4 py-2 font-medium">Patient Population</td>
                      <td className="border px-4 py-2">
                        Moderate to severe RA, inadequate response to MTX
                      </td>
                      <td className="border px-4 py-2">
                        Moderate to severe RA, inadequate response to TNFi
                      </td>
                      <td className="border px-4 py-2">Moderate to severe RA, MTX-naive</td>
                    </tr>
                    <tr>
                      <td className="border px-4 py-2 font-medium">Primary Endpoint</td>
                      <td className="border px-4 py-2">ACR20 at Week 12</td>
                      <td className="border px-4 py-2">ACR20 at Week 12</td>
                      <td className="border px-4 py-2">ACR20 at Week 24</td>
                    </tr>
                    <tr>
                      <td className="border px-4 py-2 font-medium">Treatment Arms</td>
                      <td className="border px-4 py-2">Placebo, Low Dose, High Dose</td>
                      <td className="border px-4 py-2">Placebo, High Dose</td>
                      <td className="border px-4 py-2">
                        MTX alone, Low Dose + MTX, High Dose + MTX
                      </td>
                    </tr>
                    <tr>
                      <td className="border px-4 py-2 font-medium">Sample Size</td>
                      <td className="border px-4 py-2">216 patients</td>
                      <td className="border px-4 py-2">182 patients</td>
                      <td className="border px-4 py-2">648 patients</td>
                    </tr>
                    <tr>
                      <td className="border px-4 py-2 font-medium">Primary Efficacy Result</td>
                      <td className="border px-4 py-2">
                        68% (high dose) vs 35% (placebo), p&lt;0.001
                      </td>
                      <td className="border px-4 py-2">
                        59% (high dose) vs 28% (placebo), p&lt;0.001
                      </td>
                      <td className="border px-4 py-2">
                        72% (high dose + MTX) vs 55% (MTX alone), p&lt;0.001
                      </td>
                    </tr>
                    <tr>
                      <td className="border px-4 py-2 font-medium">Serious AEs</td>
                      <td className="border px-4 py-2">4.2%</td>
                      <td className="border px-4 py-2">5.5%</td>
                      <td className="border px-4 py-2">3.8%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex space-x-4">
                <Button>Export Comparison</Button>
                <Button variant="outline">Add More Studies</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metrics">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="col-span-1">
              <CardHeader>
                <CardTitle>CSR Repository Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Total CSRs</h3>
                    <p className="text-3xl font-bold">187</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">By Phase</h3>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between items-center">
                        <span>Phase 1</span>
                        <span className="font-medium">42</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Phase 2</span>
                        <span className="font-medium">68</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Phase 3</span>
                        <span className="font-medium">59</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Phase 4</span>
                        <span className="font-medium">18</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">By Therapeutic Area</h3>
                    <div className="mt-2 space-y-2">
                      <div className="flex justify-between items-center">
                        <span>Oncology</span>
                        <span className="font-medium">63</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Immunology</span>
                        <span className="font-medium">42</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Cardiology</span>
                        <span className="font-medium">31</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Neurology</span>
                        <span className="font-medium">28</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Other</span>
                        <span className="font-medium">23</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Endpoint Success Rates by Indication</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-md border">
                  <p className="text-gray-500">Bar chart visualization would appear here</p>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                    <span>Rheumatoid Arthritis</span>
                    <span className="font-medium">78% success rate (18/23 studies)</span>
                  </div>
                  <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                    <span>Type 2 Diabetes</span>
                    <span className="font-medium">83% success rate (15/18 studies)</span>
                  </div>
                  <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                    <span>Solid Tumors</span>
                    <span className="font-medium">64% success rate (16/25 studies)</span>
                  </div>
                  <div className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                    <span>Psoriasis</span>
                    <span className="font-medium">92% success rate (11/12 studies)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Safety Trend Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] flex items-center justify-center bg-gray-50 rounded-md border">
                  <p className="text-gray-500">Line chart visualization would appear here</p>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border rounded-md p-3">
                    <h4 className="font-medium text-sm">Common Adverse Events</h4>
                    <p className="mt-1 text-2xl font-bold">3.8%</p>
                    <p className="text-sm text-gray-500">
                      Average SAE rate across all Phase 3 studies
                    </p>
                  </div>
                  <div className="border rounded-md p-3">
                    <h4 className="font-medium text-sm">Discontinuation Rate</h4>
                    <p className="mt-1 text-2xl font-bold">9.2%</p>
                    <p className="text-sm text-gray-500">Average across therapeutic areas</p>
                  </div>
                  <div className="border rounded-md p-3">
                    <h4 className="font-medium text-sm">Safety-Related Protocol Deviations</h4>
                    <p className="mt-1 text-2xl font-bold">12.6%</p>
                    <p className="text-sm text-gray-500">Of all reported protocol deviations</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
