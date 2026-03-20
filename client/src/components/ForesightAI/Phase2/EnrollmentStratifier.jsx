import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MapPin,
  Users,
  TrendingUp,
  Target,
  Brain,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Activity
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ScatterChart,
  Scatter,
  Cell
} from 'recharts';

// ML-based Patient Matching Algorithm
class PatientMatchingEngine {
  constructor() {
    this.criteria = {
      demographics: { weight: 0.2 },
      medicalHistory: { weight: 0.3 },
      biomarkers: { weight: 0.25 },
      geography: { weight: 0.15 },
      compliance: { weight: 0.1 }
    };
  }

  calculateSiteScore(site, studyCriteria) {
    let totalScore = 0;
    
    // Demographics matching
    const demoScore = this.calculateDemographicsMatch(site.demographics, studyCriteria.demographics);
    totalScore += demoScore * this.criteria.demographics.weight;
    
    // Medical history prevalence
    const medScore = this.calculateMedicalMatch(site.patientPool, studyCriteria.indication);
    totalScore += medScore * this.criteria.medicalHistory.weight;
    
    // Biomarker availability
    const bioScore = site.capabilities.biomarkerTesting ? 0.9 : 0.4;
    totalScore += bioScore * this.criteria.biomarkers.weight;
    
    // Geographic accessibility
    const geoScore = this.calculateGeographicScore(site.location);
    totalScore += geoScore * this.criteria.geography.weight;
    
    // Historical compliance
    const compScore = site.historicalPerformance?.enrollmentRate || 0.7;
    totalScore += compScore * this.criteria.compliance.weight;
    
    return Math.round(totalScore * 100);
  }

  calculateDemographicsMatch(siteDemographics, studyDemographics) {
    // Simple demographic matching algorithm
    let match = 0.5;
    
    if (siteDemographics.ageRange) {
      const ageOverlap = this.calculateRangeOverlap(
        siteDemographics.ageRange,
        studyDemographics.ageRange
      );
      match = ageOverlap;
    }
    
    return match;
  }

  calculateMedicalMatch(patientPool, indication) {
    // Match based on indication prevalence
    const prevalenceMap = {
      'oncology': { cancer: 0.9, diabetes: 0.3, cardiovascular: 0.4 },
      'cardiology': { cancer: 0.2, diabetes: 0.6, cardiovascular: 0.95 },
      'endocrinology': { cancer: 0.2, diabetes: 0.95, cardiovascular: 0.5 }
    };
    
    return prevalenceMap[indication]?.[patientPool.primaryCondition] || 0.5;
  }

  calculateGeographicScore(location) {
    // Score based on urban/rural and accessibility
    const scores = {
      'urban': 0.85,
      'suburban': 0.75,
      'rural': 0.55
    };
    return scores[location.type] || 0.65;
  }

  calculateRangeOverlap(range1, range2) {
    const overlap = Math.min(range1[1], range2[1]) - Math.max(range1[0], range2[0]);
    const totalRange = Math.max(range1[1], range2[1]) - Math.min(range1[0], range2[0]);
    return Math.max(0, overlap / totalRange);
  }

  predictEnrollmentTimeline(sites, targetEnrollment) {
    const totalCapacity = sites.reduce((sum, site) => sum + site.monthlyCapacity, 0);
    const averageConversion = sites.reduce((sum, site) => sum + (site.score / 100), 0) / sites.length;
    
    const adjustedCapacity = totalCapacity * averageConversion;
    const monthsToEnroll = Math.ceil(targetEnrollment / adjustedCapacity);
    
    return {
      months: monthsToEnroll,
      confidence: averageConversion,
      weeklyRate: (adjustedCapacity / 4).toFixed(1)
    };
  }
}

// Mock site data generator
const generateMockSites = (count = 10) => {
  const cities = [
    'Boston, MA', 'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX',
    'Philadelphia, PA', 'Phoenix, AZ', 'San Diego, CA', 'Dallas, TX', 'Miami, FL'
  ];
  
  return cities.slice(0, count).map((city, idx) => ({
    id: `SITE${String(idx + 1).padStart(3, '0')}`,
    name: `${city} Medical Center`,
    location: {
      city,
      type: idx < 3 ? 'urban' : idx < 7 ? 'suburban' : 'rural'
    },
    demographics: {
      ageRange: [18 + idx * 2, 65 + idx]
    },
    patientPool: {
      size: 500 + idx * 100,
      primaryCondition: ['cancer', 'diabetes', 'cardiovascular'][idx % 3]
    },
    capabilities: {
      biomarkerTesting: idx < 6,
      imagingModalities: ['MRI', 'CT', 'PET'][idx % 3]
    },
    historicalPerformance: {
      enrollmentRate: 0.5 + (idx * 0.05),
      screenFailureRate: 0.2 + (idx * 0.02)
    },
    monthlyCapacity: 5 + idx,
    score: 0 // Will be calculated
  }));
};

export default function EnrollmentStratifier({ studyId = "STUDY001", phase = "II" }) {
  const [engine] = useState(new PatientMatchingEngine());
  const [sites, setSites] = useState([]);
  const [selectedSites, setSelectedSites] = useState([]);
  const [targetEnrollment, setTargetEnrollment] = useState(150);
  const [indication, setIndication] = useState('oncology');
  const [activeTab, setActiveTab] = useState('sites');
  const [enrollmentPrediction, setEnrollmentPrediction] = useState(null);

  const studyCriteria = {
    demographics: { ageRange: [18, 75] },
    indication: indication,
    biomarkersRequired: true
  };

  useEffect(() => {
    // Generate and score sites
    const mockSites = generateMockSites(10);
    const scoredSites = mockSites.map(site => ({
      ...site,
      score: engine.calculateSiteScore(site, studyCriteria)
    })).sort((a, b) => b.score - a.score);
    
    setSites(scoredSites);
    // Auto-select top 5 sites
    setSelectedSites(scoredSites.slice(0, 5).map(s => s.id));
  }, [indication]);

  useEffect(() => {
    if (selectedSites.length > 0) {
      const selected = sites.filter(s => selectedSites.includes(s.id));
      const prediction = engine.predictEnrollmentTimeline(selected, targetEnrollment);
      setEnrollmentPrediction(prediction);
    }
  }, [selectedSites, targetEnrollment, sites]);

  const toggleSiteSelection = (siteId) => {
    setSelectedSites(prev => 
      prev.includes(siteId) 
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId]
    );
  };

  const getHeatmapData = () => {
    return sites.map(site => ({
      name: site.location.city.split(',')[0],
      enrollment: site.score,
      capacity: site.monthlyCapacity * 5,
      risk: 100 - site.score
    }));
  };

  const getRadarData = () => {
    const selected = sites.filter(s => selectedSites.includes(s.id));
    if (selected.length === 0) return [];
    
    return [
      { metric: 'Demographics', value: selected.reduce((sum, s) => sum + s.score, 0) / selected.length },
      { metric: 'Patient Pool', value: selected.reduce((sum, s) => sum + (s.patientPool.size / 10), 0) / selected.length },
      { metric: 'Biomarkers', value: selected.filter(s => s.capabilities.biomarkerTesting).length * 20 },
      { metric: 'Geography', value: selected.filter(s => s.location.type === 'urban').length * 20 },
      { metric: 'Performance', value: selected.reduce((sum, s) => sum + (s.historicalPerformance.enrollmentRate * 100), 0) / selected.length }
    ];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-500" />
          Predictive Enrollment Stratifier
        </h2>
        <p className="text-gray-500 mt-1">
          ML-powered site selection for Phase {phase} enrollment optimization
        </p>
      </div>

      {/* Prediction Alert */}
      {enrollmentPrediction && (
        <Alert className="border-blue-200 bg-blue-50">
          <Brain className="h-4 w-4" />
          <AlertDescription>
            <strong>ForesightAI™ Prediction:</strong> With {selectedSites.length} selected sites, 
            enrollment of {targetEnrollment} patients will complete in {enrollmentPrediction.months} months
            ({enrollmentPrediction.weeklyRate} patients/week). 
            Confidence: {(enrollmentPrediction.confidence * 100).toFixed(0)}%
          </AlertDescription>
        </Alert>
      )}

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Study Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Target Enrollment</Label>
              <Input
                type="number"
                value={targetEnrollment}
                onChange={(e) => setTargetEnrollment(parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Indication</Label>
              <Select value={indication} onValueChange={setIndication}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="oncology">Oncology</SelectItem>
                  <SelectItem value="cardiology">Cardiology</SelectItem>
                  <SelectItem value="endocrinology">Endocrinology</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Selected Sites</Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold">{selectedSites.length}</span>
                <span className="text-sm text-gray-500">of {sites.length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sites">Site Rankings</TabsTrigger>
          <TabsTrigger value="heatmap">Enrollment Heatmap</TabsTrigger>
          <TabsTrigger value="analytics">Performance Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="space-y-4">
          <div className="space-y-3">
            {sites.map((site) => {
              const isSelected = selectedSites.includes(site.id);
              return (
                <Card 
                  key={site.id} 
                  className={`cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50/50' : ''}`}
                  onClick={() => toggleSiteSelection(site.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${isSelected ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {site.name}
                            {site.capabilities.biomarkerTesting && (
                              <Badge variant="outline" className="text-xs">
                                <Activity className="w-3 h-3 mr-1" />
                                Biomarker
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-4 mt-1">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {site.location.city}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {site.patientPool.size} patients
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {site.monthlyCapacity}/mo capacity
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-sm text-gray-500">Enrollment Score</div>
                          <div className="text-2xl font-bold text-blue-600">{site.score}%</div>
                        </div>
                        <Progress value={site.score} className="w-24" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site Enrollment Probability Heatmap</CardTitle>
              <CardDescription>
                ML-predicted enrollment success by location
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={getHeatmapData()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="enrollment" fill="#6a9bcc" name="Enrollment Score %" />
                  <Bar dataKey="capacity" fill="#788c5d" name="5-Month Capacity" />
                  <Bar dataKey="risk" fill="#ef4444" name="Risk Score %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Site Performance Radar</CardTitle>
                <CardDescription>
                  Multi-dimensional analysis of selected sites
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={getRadarData()}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} />
                    <Radar 
                      name="Selected Sites" 
                      dataKey="value" 
                      stroke="#6a9bcc" 
                      fill="#6a9bcc" 
                      fillOpacity={0.6} 
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrollment Timeline Projection</CardTitle>
                <CardDescription>
                  Predicted enrollment curve with confidence bands
                </CardDescription>
              </CardHeader>
              <CardContent>
                {enrollmentPrediction && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600">Time to Complete</div>
                        <div className="text-2xl font-bold text-blue-600">
                          {enrollmentPrediction.months} months
                        </div>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="text-sm text-gray-600">Weekly Rate</div>
                        <div className="text-2xl font-bold text-green-600">
                          {enrollmentPrediction.weeklyRate} pts/wk
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Enrollment Progress</span>
                        <span>{Math.round((enrollmentPrediction.confidence * 100))}% confidence</span>
                      </div>
                      <Progress value={enrollmentPrediction.confidence * 100} />
                    </div>

                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Recommendation:</strong> Selected sites have {enrollmentPrediction.confidence > 0.7 ? 'excellent' : 'good'} matching 
                        criteria. {enrollmentPrediction.months <= 6 ? 'Fast enrollment expected.' : 'Consider adding more sites to accelerate enrollment.'}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}