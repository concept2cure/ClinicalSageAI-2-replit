import React, { useState, useEffect, createContext, useContext } from 'react';
import { Button } from '@/components/ui/button';
import { Info, Settings, HelpCircle, EyeOff, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

// Create a context for tooltip tracking within CERV2
const CERV2TooltipContext = createContext(null);

/**
 * Hook to access the CERV2TooltipContext
 */
export const useCERV2Tooltips = () => {
  const context = useContext(CERV2TooltipContext);
  if (!context) {
    throw new Error('useCERV2Tooltips must be used within a CERV2TooltipProvider');
  }
  return context;
};

/**
 * CERV2TooltipProvider
 * Provides tooltip state management specifically for CERV2 components
 */
export const CERV2TooltipProvider = ({ children }) => {
  // General settings
  const [settings, setSettings] = useState({
    enabled: true,
    showOnHover: true,
    autoHide: true,
    autoHideDelay: 8000,
    progressiveMode: true,
    competencyLevel: 1,
  });

  // Tooltip seen/dismissed state
  const [seenTooltips, setSeenTooltips] = useState({});

  // Track statistics for learning progress
  const [stats, setStats] = useState({
    totalAvailable: 0,
    totalSeen: 0,
    seenByCategory: {
      workflow: 0,
      regulatory: 0,
      technical: 0,
      clinical: 0,
    },
    lastSeen: null,
  });

  // Predefined tooltips for CERV2
  const [predefinedTooltips, setPredefinedTooltips] = useState([
    // Workflow tooltips
    {
      id: 'cerv2_device_profile',
      title: 'Device Profile',
      category: 'workflow',
      content:
        "Start by creating a device profile to define your device's classification, intended use, and technical characteristics.",
      relevantRegulations: ['MDR Annex II, 1.1', 'MEDDEV 2.7/1 Rev4, 7'],
      areas: ['general', 'deviceProfile'],
      level: 1,
    },
    {
      id: 'cerv2_literature_search',
      title: 'Literature Search',
      category: 'workflow',
      content:
        'Conduct a systematic literature search to identify relevant clinical data for your device or equivalent devices.',
      relevantRegulations: ['MDR Article 61', 'MEDDEV 2.7/1 Rev4, 8'],
      areas: ['litReview'],
      level: 1,
    },
    {
      id: 'cerv2_equivalence',
      title: 'Equivalence Assessment',
      category: 'workflow',
      content:
        'Establish equivalence with similar devices to leverage their clinical data. Document technical, biological, and clinical characteristics.',
      relevantRegulations: ['MDR Annex XIV, Part A'],
      areas: ['equivalence'],
      level: 2,
    },

    // Regulatory tooltips
    {
      id: 'cerv2_mdr_requirements',
      title: 'MDR Requirements',
      category: 'regulatory',
      content:
        'The EU MDR has specific requirements for clinical evaluation. Class III and implantable devices have additional requirements.',
      relevantRegulations: ['MDR Article 61'],
      areas: ['general'],
      level: 1,
    },
    {
      id: 'cerv2_benefit_risk',
      title: 'Benefit-Risk Analysis',
      category: 'regulatory',
      content:
        "A thorough benefit-risk analysis is required to justify your device's use. Quantify benefits and risks where possible.",
      relevantRegulations: ['MDR Annex I'],
      areas: ['benefitRisk'],
      level: 2,
    },

    // Technical tooltips
    {
      id: 'cerv2_save_progress',
      title: 'Saving Your Work',
      category: 'technical',
      content:
        'Your work is automatically saved as you progress. You can also manually save by clicking the save button in each section.',
      areas: ['general'],
      level: 1,
    },
    {
      id: 'cerv2_export_options',
      title: 'Export Options',
      category: 'technical',
      content:
        'You can export your CER in multiple formats including PDF and Word. Each format preserves regulatory-compliant formatting.',
      areas: ['reports'],
      level: 2,
    },

    // Clinical tooltips
    {
      id: 'cerv2_clinical_data_types',
      title: 'Clinical Data Types',
      category: 'clinical',
      content:
        'Clinical data can include literature, clinical investigations, post-market surveillance, and real-world evidence.',
      relevantRegulations: ['MEDDEV 2.7/1 Rev4, 6.4'],
      areas: ['litReview', 'clinicalData'],
      level: 1,
    },
    {
      id: 'cerv2_evaluation_methodology',
      title: 'Evaluation Methodology',
      category: 'clinical',
      content:
        'Document your methodology for data appraisal, including quality assessment and relevance determination.',
      relevantRegulations: ['MEDDEV 2.7/1 Rev4, 9'],
      areas: ['litReview', 'soa'],
      level: 3,
    },
  ]);

  // Load saved state from localStorage when component mounts
  useEffect(() => {
    try {
      // Load settings
      const savedSettings = localStorage.getItem('cerv2TooltipSettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }

      // Load seen tooltips
      const savedSeenTooltips = localStorage.getItem('cerv2SeenTooltips');
      if (savedSeenTooltips) {
        setSeenTooltips(JSON.parse(savedSeenTooltips));
      }
    } catch (error) {
      console.error('Error loading tooltip settings:', error);
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('cerv2TooltipSettings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving tooltip settings:', error);
    }
  }, [settings]);

  // Save seen tooltips to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('cerv2SeenTooltips', JSON.stringify(seenTooltips));

      // Update stats
      const totalSeen = Object.values(seenTooltips).filter(Boolean).length;

      // Calculate seen by category
      const seenByCategory = {
        workflow: 0,
        regulatory: 0,
        technical: 0,
        clinical: 0,
      };

      // Count tooltips seen by category
      predefinedTooltips.forEach(tooltip => {
        if (seenTooltips[tooltip.id]) {
          seenByCategory[tooltip.category]++;
        }
      });

      setStats({
        totalAvailable: predefinedTooltips.length,
        totalSeen,
        seenByCategory,
        lastSeen: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving seen tooltips:', error);
    }
  }, [seenTooltips, predefinedTooltips]);

  /**
   * Mark a tooltip as seen
   */
  const markTooltipSeen = (id, permanently = false) => {
    setSeenTooltips(prev => ({
      ...prev,
      [id]: true,
    }));
  };

  /**
   * Check if a tooltip has been seen
   */
  const hasSeenTooltip = id => {
    return !!seenTooltips[id];
  };

  /**
   * Reset all tooltips
   */
  const resetAllTooltips = () => {
    setSeenTooltips({});
  };

  /**
   * Update tooltip settings
   */
  const updateSettings = newSettings => {
    setSettings(prev => ({
      ...prev,
      ...newSettings,
    }));
  };

  /**
   * Get tooltips for a specific area
   */
  const getTooltipsForArea = area => {
    return predefinedTooltips.filter(
      tooltip => tooltip.areas.includes(area) && tooltip.level <= settings.competencyLevel
    );
  };

  // Value provided to context consumers
  const contextValue = {
    settings,
    updateSettings,
    markTooltipSeen,
    hasSeenTooltip,
    resetAllTooltips,
    getTooltipsForArea,
    predefinedTooltips,
    stats,
  };

  return (
    <CERV2TooltipContext.Provider value={contextValue}>{children}</CERV2TooltipContext.Provider>
  );
};

/**
 * TooltipTracker Component
 *
 * Displays tooltip usage statistics and preferences in CERV2
 */
const TooltipTracker = () => {
  const { settings, updateSettings, resetAllTooltips, stats, predefinedTooltips } =
    useCERV2Tooltips();
  const [activeTab, setActiveTab] = useState('stats');

  // Calculate percentage of tooltips seen
  const percentageSeen =
    stats.totalAvailable > 0 ? Math.round((stats.totalSeen / stats.totalAvailable) * 100) : 0;

  // Get category percentages
  const getCategoryPercentage = category => {
    const totalInCategory = predefinedTooltips.filter(t => t.category === category).length;
    return totalInCategory > 0
      ? Math.round((stats.seenByCategory[category] / totalInCategory) * 100)
      : 0;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground">
          <HelpCircle size={14} />
          <span className="hidden md:inline">Learning Progress</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>CER Learning Assistant</DialogTitle>
          <DialogDescription>
            Track your learning progress and customize tooltip behavior
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="stats" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stats">Progress</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium">Overall Learning Progress</h4>
                <span className="text-sm text-muted-foreground">{percentageSeen}%</span>
              </div>
              <Progress value={percentageSeen} className="h-2" />
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Category Progress</h4>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="h-5 bg-blue-50">
                          Workflow
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getCategoryPercentage('workflow')}%
                      </span>
                    </div>
                    <Progress value={getCategoryPercentage('workflow')} className="h-1.5" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="h-5 bg-green-50">
                          Regulatory
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getCategoryPercentage('regulatory')}%
                      </span>
                    </div>
                    <Progress value={getCategoryPercentage('regulatory')} className="h-1.5" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="h-5 bg-purple-50">
                          Technical
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getCategoryPercentage('technical')}%
                      </span>
                    </div>
                    <Progress value={getCategoryPercentage('technical')} className="h-1.5" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="h-5 bg-amber-50">
                          Clinical
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {getCategoryPercentage('clinical')}%
                      </span>
                    </div>
                    <Progress value={getCategoryPercentage('clinical')} className="h-1.5" />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetAllTooltips}
                className="w-full gap-1"
              >
                <RefreshCw size={14} />
                Reset Learning Progress
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 py-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="tooltipsEnabled">Enable Learning Assistant</Label>
                  <p className="text-xs text-muted-foreground">
                    Show context-sensitive tooltips throughout the CER interface
                  </p>
                </div>
                <Switch
                  id="tooltipsEnabled"
                  checked={settings.enabled}
                  onCheckedChange={checked => updateSettings({ enabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="showOnHover">Show tooltips on hover</Label>
                  <p className="text-xs text-muted-foreground">
                    Display tooltips when hovering over elements
                  </p>
                </div>
                <Switch
                  id="showOnHover"
                  checked={settings.showOnHover}
                  onCheckedChange={checked => updateSettings({ showOnHover: checked })}
                  disabled={!settings.enabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoHide">Auto-hide tooltips</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically hide tooltips after a delay
                  </p>
                </div>
                <Switch
                  id="autoHide"
                  checked={settings.autoHide}
                  onCheckedChange={checked => updateSettings({ autoHide: checked })}
                  disabled={!settings.enabled}
                />
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex justify-between">
                  <Label htmlFor="competencyLevel">Knowledge Level</Label>
                  <span className="text-sm text-muted-foreground">
                    Level {settings.competencyLevel}
                  </span>
                </div>
                <Slider
                  id="competencyLevel"
                  min={1}
                  max={5}
                  step={1}
                  value={[settings.competencyLevel]}
                  onValueChange={values => updateSettings({ competencyLevel: values[0] })}
                  disabled={!settings.enabled}
                  className="my-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Beginner</span>
                  <span>Expert</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Adjust to see more advanced tips as your knowledge grows
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="secondary" size="sm">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TooltipTracker;
