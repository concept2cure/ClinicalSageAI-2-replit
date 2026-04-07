/**
 * Adaptive Reviewer Workspace Component
 * 
 * Role-specific UI presets for different personas (medical writer,
 * regulatory strategist, QA lead) with personalized layouts.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Layout, Settings, User, Palette, Monitor, Save,
  RotateCcw, Star, Check, Plus, Sparkles, PanelLeft,
  PanelRight, Menu, Grid3X3, List, Sun, Moon, Wand2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface WorkspaceRole {
  id: string;
  roleCode: string;
  roleName: string;
  description?: string;
  defaultFeatures?: string[];
  icon?: string;
}

interface WorkspacePreset {
  id: string;
  presetCode: string;
  presetName: string;
  description?: string;
  roleId?: string;
  roleName?: string;
  layoutConfig: LayoutConfig;
  sidebarConfig: SidebarConfig;
  toolbarConfig: ToolbarConfig;
  themeOverrides?: Record<string, any>;
  featureFlags?: Record<string, boolean>;
  isDefault: boolean;
}

interface LayoutConfig {
  sidebarPosition: 'left' | 'right' | 'hidden';
  sidebarWidth: number;
  contentWidth: 'full' | 'centered' | 'narrow';
  showBreadcrumbs: boolean;
  showMinimap: boolean;
  splitViewEnabled: boolean;
  splitViewRatio: number;
}

interface SidebarConfig {
  sections: string[];
  collapsedSections: string[];
  pinnedItems: string[];
  quickActions: string[];
}

interface ToolbarConfig {
  visibleTools: string[];
  toolOrder: string[];
  customTools?: any[];
}

interface UserPreferences {
  userId: string;
  currentPresetId?: string;
  customOverrides?: Record<string, any>;
  recentPresets?: string[];
  favoriteFeatures?: string[];
}

interface WorkspaceRecommendation {
  presetId: string;
  presetName: string;
  reason: string;
  matchScore: number;
}

export function AdaptiveReviewerWorkspace({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<WorkspaceRole[]>([]);
  const [presets, setPresets] = useState<WorkspacePreset[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [recommendations, setRecommendations] = useState<WorkspaceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('presets');
  const [selectedPreset, setSelectedPreset] = useState<WorkspacePreset | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [localConfig, setLocalConfig] = useState<{
    layout: LayoutConfig;
    sidebar: SidebarConfig;
    toolbar: ToolbarConfig;
  } | null>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesRes, presetsRes, prefsRes, recsRes] = await Promise.all([
        fetch('/api/innovation/workspace/roles'),
        fetch('/api/innovation/workspace/presets'),
        fetch(`/api/innovation/workspace/preferences/${userId}`),
        fetch(`/api/innovation/workspace/recommendations/${userId}`)
      ]);

      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data.data || []);
      }
      if (presetsRes.ok) {
        const data = await presetsRes.json();
        setPresets(data.data || []);
      }
      if (prefsRes.ok) {
        const data = await prefsRes.json();
        setPreferences(data.data);
        if (data.data?.currentPresetId) {
          const current = presets.find(p => p.id === data.data.currentPresetId);
          if (current) setSelectedPreset(current);
        }
      }
      if (recsRes.ok) {
        const data = await recsRes.json();
        setRecommendations(data.data || []);
      }
    } catch (error) {
      console.error('Error loading workspace data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = async (preset: WorkspacePreset) => {
    try {
      const response = await fetch(`/api/innovation/workspace/preferences/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPresetId: preset.id })
      });

      if (response.ok) {
        setSelectedPreset(preset);
        setLocalConfig({
          layout: preset.layoutConfig,
          sidebar: preset.sidebarConfig,
          toolbar: preset.toolbarConfig
        });
        toast({
          title: 'Workspace Updated',
          description: `Applied "${preset.presetName}" preset`
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to apply preset',
        variant: 'destructive'
      });
    }
  };

  const saveCustomization = async () => {
    if (!localConfig) return;

    try {
      const response = await fetch(`/api/innovation/workspace/preferences/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPresetId: selectedPreset?.id,
          customOverrides: localConfig
        })
      });

      if (response.ok) {
        setEditMode(false);
        toast({
          title: 'Customization Saved',
          description: 'Your workspace preferences have been saved'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save customization',
        variant: 'destructive'
      });
    }
  };

  const resetToDefault = () => {
    if (selectedPreset) {
      setLocalConfig({
        layout: selectedPreset.layoutConfig,
        sidebar: selectedPreset.sidebarConfig,
        toolbar: selectedPreset.toolbarConfig
      });
    }
  };

  const getRoleIcon = (roleCode: string) => {
    switch (roleCode) {
      case 'medical_writer': return '✍️';
      case 'regulatory_strategist': return '📋';
      case 'qa_lead': return '✅';
      case 'clinical_reviewer': return '🔬';
      case 'submission_manager': return '📦';
      default: return '👤';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500/10 to-purple-500/10">
            <Layout className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Adaptive Workspace</h2>
            <p className="text-muted-foreground">
              Personalized layouts for your role and preferences
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <>
              <Button variant="outline" onClick={resetToDefault}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={saveCustomization}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </>
          )}
          <Button
            variant={editMode ? 'secondary' : 'outline'}
            onClick={() => setEditMode(!editMode)}
          >
            <Settings className="h-4 w-4 mr-2" />
            {editMode ? 'Cancel' : 'Customize'}
          </Button>
        </div>
      </div>

      {/* Current Preset Banner */}
      {selectedPreset && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-3xl">
                  {selectedPreset.roleName ? getRoleIcon(selectedPreset.roleId || '') : '⚙️'}
                </div>
                <div>
                  <h3 className="font-semibold">{selectedPreset.presetName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedPreset.description || `Optimized for ${selectedPreset.roleName || 'general use'}`}
                  </p>
                </div>
              </div>
              {selectedPreset.isDefault && (
                <Badge variant="secondary">Default</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Recommendations */}
      {recommendations.length > 0 && !editMode && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              Recommended for You
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {recommendations.map((rec) => (
                <Card key={rec.presetId} className="min-w-[250px] flex-shrink-0 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => {
                    const preset = presets.find(p => p.id === rec.presetId);
                    if (preset) applyPreset(preset);
                  }}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium">{rec.presetName}</h4>
                      <Badge variant="secondary">{rec.matchScore}% match</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{rec.reason}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="presets">
            <Grid3X3 className="h-4 w-4 mr-2" />
            Presets
          </TabsTrigger>
          <TabsTrigger value="layout">
            <Monitor className="h-4 w-4 mr-2" />
            Layout
          </TabsTrigger>
          <TabsTrigger value="sidebar">
            <PanelLeft className="h-4 w-4 mr-2" />
            Sidebar
          </TabsTrigger>
          <TabsTrigger value="theme">
            <Palette className="h-4 w-4 mr-2" />
            Theme
          </TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="space-y-4">
          {/* Role-based Presets */}
          {roles.map((role) => (
            <div key={role.id}>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>{getRoleIcon(role.roleCode)}</span>
                {role.roleName}
              </h3>
              <div className="grid grid-cols-3 gap-4 mb-6">
                {presets.filter(p => p.roleId === role.id).map((preset) => (
                  <Card
                    key={preset.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedPreset?.id === preset.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => applyPreset(preset)}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium">{preset.presetName}</h4>
                        {selectedPreset?.id === preset.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {preset.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {preset.featureFlags && Object.entries(preset.featureFlags)
                          .filter(([_, v]) => v)
                          .slice(0, 3)
                          .map(([key]) => (
                            <Badge key={key} variant="outline" className="text-xs">
                              {key.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {/* General Presets */}
          <div>
            <h3 className="text-lg font-semibold mb-3">General Presets</h3>
            <div className="grid grid-cols-3 gap-4">
              {presets.filter(p => !p.roleId).map((preset) => (
                <Card
                  key={preset.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedPreset?.id === preset.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => applyPreset(preset)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium">{preset.presetName}</h4>
                      {selectedPreset?.id === preset.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {preset.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="layout" className="space-y-6">
          {localConfig && (
            <>
              {/* Sidebar Position */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sidebar Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    {['left', 'right', 'hidden'].map((pos) => (
                      <Button
                        key={pos}
                        variant={localConfig.layout.sidebarPosition === pos ? 'default' : 'outline'}
                        onClick={() => setLocalConfig({
                          ...localConfig,
                          layout: { ...localConfig.layout, sidebarPosition: pos as any }
                        })}
                        disabled={!editMode}
                      >
                        {pos === 'left' && <PanelLeft className="h-4 w-4 mr-2" />}
                        {pos === 'right' && <PanelRight className="h-4 w-4 mr-2" />}
                        {pos === 'hidden' && <Menu className="h-4 w-4 mr-2" />}
                        {pos.charAt(0).toUpperCase() + pos.slice(1)}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Sidebar Width */}
              {localConfig.layout.sidebarPosition !== 'hidden' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Sidebar Width</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Slider
                      value={[localConfig.layout.sidebarWidth]}
                      onValueChange={([value]) => setLocalConfig({
                        ...localConfig,
                        layout: { ...localConfig.layout, sidebarWidth: value }
                      })}
                      min={200}
                      max={400}
                      step={20}
                      disabled={!editMode}
                    />
                    <p className="text-sm text-muted-foreground mt-2">
                      {localConfig.layout.sidebarWidth}px
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Content Width */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Content Width</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    {['full', 'centered', 'narrow'].map((width) => (
                      <Button
                        key={width}
                        variant={localConfig.layout.contentWidth === width ? 'default' : 'outline'}
                        onClick={() => setLocalConfig({
                          ...localConfig,
                          layout: { ...localConfig.layout, contentWidth: width as any }
                        })}
                        disabled={!editMode}
                      >
                        {width.charAt(0).toUpperCase() + width.slice(1)}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Toggles */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Display Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Show Breadcrumbs</Label>
                    <Switch
                      checked={localConfig.layout.showBreadcrumbs}
                      onCheckedChange={(checked) => setLocalConfig({
                        ...localConfig,
                        layout: { ...localConfig.layout, showBreadcrumbs: checked }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Show Minimap</Label>
                    <Switch
                      checked={localConfig.layout.showMinimap}
                      onCheckedChange={(checked) => setLocalConfig({
                        ...localConfig,
                        layout: { ...localConfig.layout, showMinimap: checked }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Enable Split View</Label>
                    <Switch
                      checked={localConfig.layout.splitViewEnabled}
                      onCheckedChange={(checked) => setLocalConfig({
                        ...localConfig,
                        layout: { ...localConfig.layout, splitViewEnabled: checked }
                      })}
                      disabled={!editMode}
                    />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="sidebar">
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center py-8">
                Sidebar customization options will appear here
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="theme">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-8 py-8">
                <Button variant="outline" size="lg" className="h-24 w-24 flex-col gap-2">
                  <Sun className="h-8 w-8" />
                  Light
                </Button>
                <Button variant="outline" size="lg" className="h-24 w-24 flex-col gap-2">
                  <Moon className="h-8 w-8" />
                  Dark
                </Button>
                <Button variant="outline" size="lg" className="h-24 w-24 flex-col gap-2">
                  <Wand2 className="h-8 w-8" />
                  Auto
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AdaptiveReviewerWorkspace;
