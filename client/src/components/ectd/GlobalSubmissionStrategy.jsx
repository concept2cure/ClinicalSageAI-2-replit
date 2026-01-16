import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Globe, Calendar, Map, Layers, ArrowRight, CheckCircle, AlertCircle, Sparkles, Copy } from 'lucide-react'

export default function GlobalSubmissionStrategy({ projectId }) {
  const [selectedRegions, setSelectedRegions] = useState(['US', 'EU']);
  const [activeTab, setActiveTab] = useState('overview');

  const regions = [
    { id: 'US', name: 'United States (FDA)', flag: '🇺🇸', type: 'NDA' },
    { id: 'EU', name: 'European Union (EMA)', flag: '🇪🇺', type: 'MAA' },
    { id: 'JP', name: 'Japan (PMDA)', flag: '🇯🇵', type: 'J-NDA' },
    { id: 'CA', name: 'Canada (Health Canada)', flag: '🇨🇦', type: 'NDS' },
    { id: 'AU', name: 'Australia (TGA)', flag: '🇦🇺', type: 'MAA' },
  ];

  const toggleRegion = (regionId) => {
    if (selectedRegions.includes(regionId)) {
      setSelectedRegions(selectedRegions.filter(id => id !== regionId));
    } else {
      setSelectedRegions([...selectedRegions, regionId]);
    }
  };

  // Mock data for content reuse analysis
  const reuseAnalysis = {
    core: 65, // % of content that is global core
    regional: {
      'US': { unique: 15, shared: 85, status: 'Primary' },
      'EU': { unique: 20, shared: 80, status: 'Planned' },
      'JP': { unique: 35, shared: 65, status: 'Future' },
      'CA': { unique: 10, shared: 90, status: 'Planned' },
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-indigo-100 bg-indigo-50/30">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-6 w-6 text-indigo-600" />
                Global Submission Strategy
              </CardTitle>
              <CardDescription>
                Plan and synchronize your eCTD submissions across multiple regulatory regions
              </CardDescription>
            </div>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <Sparkles className="mr-2 h-4 w-4" /> AI Strategy Advisor
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Region Selection */}
            <div className="md:col-span-1 space-y-4">
              <h3 className="font-medium text-sm text-slate-500 uppercase tracking-wider">Target Regions</h3>
              <div className="space-y-2">
                {regions.map(region => (
                  <div 
                    key={region.id}
                    onClick={() => toggleRegion(region.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedRegions.includes(region.id) 
                        ? 'bg-white border-indigo-500 shadow-sm' 
                        : 'bg-slate-50 border-transparent hover:bg-white hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{region.flag}</span>
                      <div>
                        <div className="font-medium text-sm">{region.name}</div>
                        <div className="text-xs text-slate-500">{region.type}</div>
                      </div>
                    </div>
                    {selectedRegions.includes(region.id) && (
                      <CheckCircle className="h-4 w-4 text-indigo-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Strategy Visualization */}
            <div className="md:col-span-3">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="overview">Strategy Overview</TabsTrigger>
                  <TabsTrigger value="reuse">Content Reuse</TabsTrigger>
                  <TabsTrigger value="timeline">Global Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Core Dossier Coverage</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-indigo-600">{reuseAnalysis.core}%</div>
                        <p className="text-xs text-slate-500">of content is shared globally</p>
                        <Progress value={reuseAnalysis.core} className="h-2 mt-2" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Estimated Savings</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">450 hrs</div>
                        <p className="text-xs text-slate-500">via AI content adaptation</p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                          <Sparkles className="h-3 w-3" />
                          <span>High efficiency</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="bg-white p-4 rounded-lg border">
                    <h3 className="font-medium mb-3 flex items-center">
                      <Map className="h-4 w-4 mr-2 text-slate-500" />
                      Regional Requirements Matrix
                    </h3>
                    <div className="space-y-3">
                      {selectedRegions.map(regionId => {
                        const region = regions.find(r => r.id === regionId);
                        const data = reuseAnalysis.regional[regionId] || { unique: 20, shared: 80 };
                        return (
                          <div key={regionId} className="flex items-center gap-4">
                            <div className="w-24 flex items-center gap-2">
                              <span className="text-lg">{region.flag}</span>
                              <span className="font-medium text-sm">{regionId}</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex h-4 rounded-full overflow-hidden">
                                <div 
                                  className="bg-indigo-500" 
                                  style={{ width: `${data.shared}%` }} 
                                  title={`Shared Content: ${data.shared}%`}
                                />
                                <div 
                                  className="bg-amber-400" 
                                  style={{ width: `${data.unique}%` }} 
                                  title={`Region Specific: ${data.unique}%`}
                                />
                              </div>
                            </div>
                            <div className="w-32 text-xs text-right text-slate-500">
                              {data.unique}% Unique Req.
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-center gap-6 mt-4 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                        <span>Shared Core Content</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
                        <span>Region Specific (M1)</span>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="reuse" className="space-y-4">
                  <div className="bg-white p-6 rounded-lg border text-center">
                    <Layers className="h-12 w-12 mx-auto text-indigo-200 mb-4" />
                    <h3 className="text-lg font-medium">AI Content Adaptation</h3>
                    <p className="text-slate-500 mb-6 max-w-md mx-auto">
                      Our AI automatically adapts your Core Data Sheet and Clinical Overview to meet specific regional requirements.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                      <div className="p-4 border rounded bg-slate-50">
                        <div className="font-medium mb-2 flex items-center">
                          <span className="text-xl mr-2">🇺🇸</span> US FDA
                        </div>
                        <ul className="text-sm space-y-2 text-slate-600">
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                            <span>Integrated Summary of Safety (ISS) required</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                            <span>Datasets in SAS Transport format</span>
                          </li>
                        </ul>
                      </div>
                      <div className="p-4 border rounded bg-slate-50">
                        <div className="font-medium mb-2 flex items-center">
                          <span className="text-xl mr-2">🇪🇺</span> EU EMA
                        </div>
                        <ul className="text-sm space-y-2 text-slate-600">
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                            <span>PIM (Product Information Management) format</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                            <span>Specific Environmental Risk Assessment</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <Button className="mt-6" variant="outline">
                      <Copy className="mr-2 h-4 w-4" />
                      Generate Adaptation Plan
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium flex items-center">
                        <Calendar className="h-4 w-4 mr-2 text-slate-500" />
                        Submission Waves
                      </h3>
                      <Badge variant="outline">Optimized for Speed</Badge>
                    </div>
                    
                    <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 py-2">
                      <div className="relative pl-6">
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-indigo-600 border-2 border-white"></div>
                        <div className="font-medium text-indigo-900">Wave 1: Primary Markets</div>
                        <div className="text-sm text-slate-500 mb-2">Target: Q3 2026</div>
                        <div className="flex gap-2">
                          <Badge>🇺🇸 US FDA</Badge>
                          <Badge>🇪🇺 EU EMA</Badge>
                        </div>
                      </div>
                      
                      <div className="relative pl-6">
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 border-2 border-white"></div>
                        <div className="font-medium text-slate-700">Wave 2: Fast Followers</div>
                        <div className="text-sm text-slate-500 mb-2">Target: Q1 2027 (+6 months)</div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">🇨🇦 Health Canada</Badge>
                          <Badge variant="secondary">🇦🇺 TGA</Badge>
                          <Badge variant="secondary">🇨🇭 Swissmedic</Badge>
                        </div>
                      </div>

                      <div className="relative pl-6">
                        <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 border-2 border-white"></div>
                        <div className="font-medium text-slate-700">Wave 3: Emerging Markets</div>
                        <div className="text-sm text-slate-500 mb-2">Target: Q3 2027 (+12 months)</div>
                        <div className="flex gap-2">
                          <Badge variant="outline">🇧🇷 ANVISA</Badge>
                          <Badge variant="outline">🇰🇷 MFDS</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
