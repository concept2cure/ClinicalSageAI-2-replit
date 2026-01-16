import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save, Calendar, Users, Clock, Activity, Target } from 'lucide-react'

export default function StudyPlanner({ session }) {
  const [formData, setFormData] = useState({
    title: session?.name || '',
    indication: session?.indication || '',
    phase: '',
    primaryObjective: '',
    secondaryObjectives: '',
    sampleSize: '',
    studyDuration: '',
    treatmentGroups: '',
    keyEndpoints: '',
    inclusionCriteria: '',
    exclusionCriteria: '',
  });

  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);

    // In a real implementation, this would make an API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Study Design Planner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Study Title</label>
              <Input
                value={formData.title}
                onChange={e => handleChange('title', e.target.value)}
                placeholder="e.g., A Phase 2 Study of Drug X in Patients with Condition Y"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Indication</label>
                <Input
                  value={formData.indication}
                  onChange={e => handleChange('indication', e.target.value)}
                  placeholder="e.g., Type 2 Diabetes"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Phase</label>
                <select
                  value={formData.phase}
                  onChange={e => handleChange('phase', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">Select Phase</option>
                  <option value="Phase 1">Phase 1</option>
                  <option value="Phase 2">Phase 2</option>
                  <option value="Phase 3">Phase 3</option>
                  <option value="Phase 4">Phase 4</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Primary Objective</label>
              <Textarea
                value={formData.primaryObjective}
                onChange={e => handleChange('primaryObjective', e.target.value)}
                placeholder="Describe the primary objective of the study"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Secondary Objectives</label>
              <Textarea
                value={formData.secondaryObjectives}
                onChange={e => handleChange('secondaryObjectives', e.target.value)}
                placeholder="List the secondary objectives, separated by line breaks"
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Sample Size</label>
                <Input
                  value={formData.sampleSize}
                  onChange={e => handleChange('sampleSize', e.target.value)}
                  placeholder="e.g., 120 patients"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">Study Duration</label>
                <Input
                  value={formData.studyDuration}
                  onChange={e => handleChange('studyDuration', e.target.value)}
                  placeholder="e.g., 52 weeks"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Treatment Groups</label>
              <Textarea
                value={formData.treatmentGroups}
                onChange={e => handleChange('treatmentGroups', e.target.value)}
                placeholder="Describe the treatment groups and dosing regimens"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Key Endpoints</label>
              <Textarea
                value={formData.keyEndpoints}
                onChange={e => handleChange('keyEndpoints', e.target.value)}
                placeholder="List the primary and key secondary endpoints"
                rows={2}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Key Inclusion Criteria</label>
              <Textarea
                value={formData.inclusionCriteria}
                onChange={e => handleChange('inclusionCriteria', e.target.value)}
                placeholder="List the key inclusion criteria"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Study Plan'}
          </Button>
        </div>

        {session && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded-md p-3 flex items-center">
              <Calendar className="h-5 w-5 mr-3 text-blue-500" />
              <div>
                <p className="text-xs text-gray-500">Last Updated</p>
                <p className="text-sm font-medium">{session.lastUpdated}</p>
              </div>
            </div>

            <div className="border rounded-md p-3 flex items-center">
              <Users className="h-5 w-5 mr-3 text-purple-500" />
              <div>
                <p className="text-xs text-gray-500">Contributors</p>
                <p className="text-sm font-medium">{session.users.length}</p>
              </div>
            </div>

            <div className="border rounded-md p-3 flex items-center">
              <Clock className="h-5 w-5 mr-3 text-green-500" />
              <div>
                <p className="text-xs text-gray-500">Estimated Timeline</p>
                <p className="text-sm font-medium">10 months</p>
              </div>
            </div>

            <div className="border rounded-md p-3 flex items-center">
              <Activity className="h-5 w-5 mr-3 text-red-500" />
              <div>
                <p className="text-xs text-gray-500">Completion</p>
                <p className="text-sm font-medium">45%</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
