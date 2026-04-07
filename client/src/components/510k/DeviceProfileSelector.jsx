import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ChevronRight, Filter, Check, Globe, Zap, ArrowRightLeft, MapPin } from 'lucide-react';
import {
  getAllProfileTemplates,
  createProfileFromTemplate,
} from '../../utils/deviceProfileDefaults';

// Multi-Regional Template Sync: Regional format configurations
const REGIONAL_FORMATS = {
  FDA_510K: {
    name: 'FDA 510(k)',
    region: 'United States',
    flag: '🇺🇸',
    classSystem: ['I', 'II', 'III'],
    requiredFields: ['deviceName', 'deviceType', 'deviceClass', 'description', 'intendedUse'],
    color: 'blue'
  },
  EU_MDR: {
    name: 'EU MDR',
    region: 'European Union', 
    flag: '🇪🇺',
    classSystem: ['I', 'IIa', 'IIb', 'III'],
    requiredFields: ['deviceName', 'deviceType', 'mdrClassification', 'description', 'intendedPurpose', 'authorizedRepresentative'],
    color: 'green'
  },
  HEALTH_CANADA: {
    name: 'Health Canada',
    region: 'Canada',
    flag: '🇨🇦', 
    classSystem: ['I', 'II', 'III', 'IV'],
    requiredFields: ['deviceName', 'deviceType', 'healthCanadaClass', 'description', 'intendedUse', 'licenseeInformation'],
    color: 'red'
  }
};

// Multi-Regional Template Sync: Classification mapping between regions
const CLASS_MAPPINGS = {
  'FDA_TO_EU': { 'I': 'I', 'II': 'IIa', 'III': 'III' },
  'FDA_TO_HC': { 'I': 'I', 'II': 'II', 'III': 'III' },
  'EU_TO_FDA': { 'I': 'I', 'IIa': 'II', 'IIb': 'II', 'III': 'III' },
  'EU_TO_HC': { 'I': 'I', 'IIa': 'II', 'IIb': 'II', 'III': 'III' },
  'HC_TO_FDA': { 'I': 'I', 'II': 'II', 'III': 'III', 'IV': 'III' },
  'HC_TO_EU': { 'I': 'I', 'II': 'IIa', 'III': 'IIb', 'IV': 'III' }
};

const DeviceProfileSelector = ({ onProfileSelect, k510DocumentId, isOpen, onClose }) => {
  const [selectedTab, setSelectedTab] = useState('all');
  const [filterArea, setFilterArea] = useState('all');
  
  // Multi-Regional Template Sync state
  const [targetRegion, setTargetRegion] = useState('FDA_510K');
  const [syncedTemplates, setSyncedTemplates] = useState([]);
  const [isAdapting, setIsAdapting] = useState(false);
  const [adaptationResults, setAdaptationResults] = useState(null);
  const [showSyncOptions, setShowSyncOptions] = useState(false);
  
  const allTemplates = getAllProfileTemplates();

  // Multi-Regional Template Sync: Template adaptation utility
  const adaptTemplateToRegion = (template, targetFormat) => {
    const adapted = { ...template };
    
    // Map device classification
    if (template.deviceClass) {
      const mappingKey = `FDA_TO_${targetFormat.replace('_', '').replace('510K', '').replace('MDR', 'EU').replace('CANADA', 'HC')}`;
      const classMapping = CLASS_MAPPINGS[mappingKey];
      if (classMapping) {
        adapted.adaptedClass = classMapping[template.deviceClass] || template.deviceClass;
      }
    }
    
    // Add region-specific metadata
    adapted.targetRegion = targetFormat;
    adapted.originalRegion = 'FDA_510K';
    adapted.isAdapted = true;
    adapted.adaptationTimestamp = new Date().toISOString();
    
    // Calculate compliance score
    const requiredFields = REGIONAL_FORMATS[targetFormat]?.requiredFields || [];
    const presentFields = requiredFields.filter(field => template[field] && template[field].trim() !== '');
    adapted.complianceScore = Math.round((presentFields.length / requiredFields.length) * 100);
    
    return adapted;
  };
  
  // Multi-Regional Template Sync: Sync templates across regions
  const syncTemplatesAcrossRegions = async () => {
    setIsAdapting(true);
    setAdaptationResults(null);
    
    try {
      const adapted = allTemplates.map(template => {
        const synced = {
          original: template,
          adaptations: {}
        };
        
        // Adapt to each regional format
        Object.keys(REGIONAL_FORMATS).forEach(format => {
          if (format !== 'FDA_510K') { // Original templates are FDA-based
            synced.adaptations[format] = adaptTemplateToRegion(template, format);
          }
        });
        
        return synced;
      });
      
      setSyncedTemplates(adapted);
      
      // Calculate adaptation statistics
      const stats = {
        totalTemplates: adapted.length,
        successfulAdaptations: adapted.filter(t => 
          Object.values(t.adaptations).every(a => a.complianceScore >= 70)
        ).length,
        avgComplianceScore: Math.round(
          adapted.reduce((sum, t) => {
            const scores = Object.values(t.adaptations).map(a => a.complianceScore);
            return sum + (scores.reduce((s, score) => s + score, 0) / scores.length);
          }, 0) / adapted.length
        ),
        timestamp: new Date().toISOString()
      };
      
      setAdaptationResults(stats);
      
    } catch (error) {
      console.error('Template adaptation error:', error);
      setAdaptationResults({
        error: 'Failed to adapt templates for cross-regional sync',
        timestamp: new Date().toISOString()
      });
    } finally {
      setIsAdapting(false);
    }
  };
  
  // Auto-sync templates when component mounts
  useEffect(() => {
    syncTemplatesAcrossRegions();
  }, []);
  
  // Get unique therapeutic areas for filtering
  const therapeuticAreas = [...new Set(allTemplates.map(t => t.therapeuticArea))];

  // Multi-Regional Template Sync: Enhanced filtering with regional adaptation
  const filteredTemplates = useMemo(() => {
    const baseTemplates = targetRegion === 'FDA_510K' ? allTemplates : 
      syncedTemplates.map(st => st.adaptations[targetRegion] || st.original).filter(Boolean);
    
    return baseTemplates.filter(template => {
      const effectiveClass = template.adaptedClass || template.deviceClass;
      const matchesClass =
        selectedTab === 'all' || effectiveClass === selectedTab.replace('class', '');
      const matchesArea = filterArea === 'all' || template.therapeuticArea === filterArea;
      return matchesClass && matchesArea;
    });
  }, [allTemplates, syncedTemplates, targetRegion, selectedTab, filterArea]);

  // Multi-Regional Template Sync: Enhanced profile selection with regional adaptation
  const handleProfileSelect = templateId => {
    // Find the template (could be original or adapted)
    let template = filteredTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    // If using an adapted template, ensure regional compliance
    if (template.isAdapted && targetRegion !== 'FDA_510K') {
      // Apply regional-specific enhancements
      template = {
        ...template,
        selectedFormat: targetRegion,
        targetMarkets: [targetRegion],
        harmonizationStatus: 'pre-adapted',
        complianceScore: template.complianceScore,
        regionalAdaptation: {
          sourceFormat: 'FDA_510K',
          targetFormat: targetRegion,
          adaptedAt: template.adaptationTimestamp,
          classMapping: template.adaptedClass !== template.deviceClass ? {
            original: template.deviceClass,
            adapted: template.adaptedClass
          } : null
        }
      };
    }

    // Extract class and area from template ID
    const [classKey, area] = template.template?.split('-') || ['generic', 'general'];

    // Create profile from the template with regional data
    const profile = createProfileFromTemplate(classKey, area, k510DocumentId);
    
    // Enhance profile with Cross-Format Harmonizer data
    const enhancedProfile = {
      ...profile,
      ...template,
      // Add Multi-Regional Template Sync metadata
      templateSource: 'multi-regional-sync',
      selectedRegionalFormat: targetRegion,
      isRegionallyAdapted: template.isAdapted || false,
      adaptationScore: template.complianceScore || 100,
      lastSyncTimestamp: new Date().toISOString()
    };

    // Pass the enhanced profile to parent component
    onProfileSelect(enhancedProfile);

    // Close the selector if needed
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-blue-900">Multi-Regional Template Selector</CardTitle>
                <CardDescription className="text-blue-700">
                  Choose a device profile template with automatic regional adaptation
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {adaptationResults && (
                <Badge 
                  variant="outline" 
                  className={adaptationResults.error ? 'border-red-200 text-red-700' : 'border-green-200 text-green-700'}
                >
                  {adaptationResults.error ? (
                    <span>Sync Error</span>
                  ) : (
                    <span><ArrowRightLeft className="h-3 w-3 mr-1" />{adaptationResults.successfulAdaptations}/{adaptationResults.totalTemplates} Synced</span>
                  )}
                </Badge>
              )}
              <Button variant="ghost" onClick={onClose} data-testid="button-close-selector">
                ✕
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Multi-Regional Template Sync: Regional Format Selector */}
        <div className="px-4 py-3 bg-blue-50 border-b">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-blue-900 mb-2 block">
                Target Regulatory Region
              </label>
              <Select value={targetRegion} onValueChange={setTargetRegion} data-testid="select-target-region">
                <SelectTrigger className="bg-white border-blue-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REGIONAL_FORMATS).map(([key, format]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center space-x-2">
                        <span>{format.flag}</span>
                        <span>{format.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium text-blue-900 mb-2 block">
                Device Classification
              </label>
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-auto">
                <TabsList className="bg-white">
                  <TabsTrigger value="all">All Classes</TabsTrigger>
                  {REGIONAL_FORMATS[targetRegion]?.classSystem.map(cls => (
                    <TabsTrigger key={cls} value={cls}>Class {cls}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            
            <div>
              <label className="text-sm font-medium text-blue-900 mb-2 block">
                Therapeutic Area
              </label>
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-blue-600" />
                <Select value={filterArea} onValueChange={setFilterArea} data-testid="select-therapeutic-area">
                  <SelectTrigger className="bg-white border-blue-200 flex-grow">
                    <SelectValue placeholder="All Areas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Therapeutic Areas</SelectItem>
                    {therapeuticAreas.map(area => (
                      <SelectItem key={area} value={area}>
                        {area.charAt(0).toUpperCase() + area.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Adaptation Status */}
          {adaptationResults && !adaptationResults.error && (
            <Alert className="bg-green-50 border-green-200">
              <Zap className="h-4 w-4" />
              <AlertTitle className="text-green-800 text-sm">Multi-Regional Sync Active</AlertTitle>
              <AlertDescription className="text-green-700 text-xs">
                {adaptationResults.totalTemplates} templates available across {Object.keys(REGIONAL_FORMATS).length} regions
                (Avg. Compliance: {adaptationResults.avgComplianceScore}%)
              </AlertDescription>
            </Alert>
          )}
        </div>

        <CardContent className="flex-grow overflow-auto p-0">
          <div className="grid grid-cols-1 gap-0 divide-y">
            {filteredTemplates.length > 0 ? (
              filteredTemplates.map(template => (
                <div
                  key={template.id}
                  className="p-4 hover:bg-gray-50 transition-colors flex justify-between items-center"
                >
                  <div className="flex-grow">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-medium text-gray-900">{template.deviceName}</h3>
                      <Badge
                        variant={
                          (template.adaptedClass || template.deviceClass) === 'I'
                            ? 'outline'
                            : ['II', 'IIa'].includes(template.adaptedClass || template.deviceClass)
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        Class {template.adaptedClass || template.deviceClass}
                        {template.isAdapted && template.adaptedClass !== template.deviceClass && (
                          <span className="ml-1 text-xs opacity-70">({template.deviceClass}→{template.adaptedClass})</span>
                        )}
                      </Badge>
                      {template.isAdapted && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          <ArrowRightLeft className="h-3 w-3 mr-1" />
                          Adapted
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      <span>{template.manufacturer}</span>
                      {template.productCode && (
                        <span className="ml-2 px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                          {template.productCode}
                        </span>
                      )}
                      {template.complianceScore && (
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                          template.complianceScore >= 90 ? 'bg-green-100 text-green-700' :
                          template.complianceScore >= 70 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {template.complianceScore}% Compliant
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-sm text-gray-700">
                        <MapPin className="h-3 w-3 inline mr-1" />
                        {template.therapeuticArea.charAt(0).toUpperCase() +
                          template.therapeuticArea.slice(1)}
                      </div>
                      {template.targetRegion && template.targetRegion !== 'FDA_510K' && (
                        <div className="text-xs text-blue-600">
                          {REGIONAL_FORMATS[template.targetRegion]?.flag} {REGIONAL_FORMATS[template.targetRegion]?.name}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2"
                    onClick={() => handleProfileSelect(template.id)}
                  >
                    <span className="mr-1">Select</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-500">
                No device profile templates match your filters. Try different filtering options.
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-500">
            <span className="font-medium">{filteredTemplates.length}</span> templates available
            {targetRegion !== 'FDA_510K' && (
              <span className="ml-2 text-blue-600">
                • Adapted for {REGIONAL_FORMATS[targetRegion]?.flag} {REGIONAL_FORMATS[targetRegion]?.name}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={syncTemplatesAcrossRegions}
              disabled={isAdapting}
              className="text-blue-600 border-blue-200 hover:bg-blue-50"
              data-testid="button-sync-templates"
            >
              {isAdapting ? (
                <>Syncing...</>
              ) : (
                <><ArrowRightLeft className="h-3 w-3 mr-1" />Re-sync</>
              )}
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

export default DeviceProfileSelector;
