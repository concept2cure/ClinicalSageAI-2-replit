import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Save, RefreshCw, FileText } from 'lucide-react'

export default function StudyEditorForm({ session }) {
  const [activeTab, setActiveTab] = useState('objectives');
  const [formData, setFormData] = useState({
    objectives: '',
    design: '',
    population: '',
    endpoints: '',
    statistics: '',
    safety: '',
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);

    // In a real implementation, this would make an API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    setSaving(false);
  };

  const handleGenerate = async section => {
    setGenerating(true);

    // In a real implementation, this would make an API call
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Sample generated text for each section
    const sampleText = {
      objectives:
        'The primary objective of this study is to evaluate the efficacy of [DRUG] in reducing HbA1c levels in adult patients with type 2 diabetes mellitus. Secondary objectives include assessing the effect on fasting plasma glucose, body weight, and safety parameters over a 24-week treatment period.',
      design:
        'This is a Phase 2, randomized, double-blind, placebo-controlled, parallel-group, multi-center study. Patients will be randomized in a 1:1:1 ratio to receive either [DRUG] 10 mg once daily, [DRUG] 25 mg once daily, or placebo for 24 weeks.',
      population:
        'The study population will consist of adult patients, aged 18 to 75 years, with a diagnosis of type 2 diabetes mellitus for at least 6 months prior to screening, with inadequate glycemic control (HbA1c 7.0-10.0%) on a stable dose of metformin for at least 8 weeks.',
      endpoints:
        'The primary endpoint is the change from baseline in HbA1c at Week 24. Key secondary endpoints include change from baseline in fasting plasma glucose at Week 24, proportion of patients achieving HbA1c <7.0% at Week 24, and change from baseline in body weight at Week 24.',
      statistics:
        'A sample size of 120 patients (40 per arm) will provide 90% power to detect a difference of 0.5% in HbA1c change from baseline between [DRUG] and placebo, assuming a standard deviation of 0.9%, a two-sided significance level of 0.05, and a dropout rate of 15%.',
      safety:
        'Safety assessments will include adverse events, physical examinations, vital signs, laboratory parameters, and ECGs. A Data Safety Monitoring Board will oversee the study and conduct safety reviews after 30% and 60% of patients complete the 12-week visit.',
    };

    handleChange(section, sampleText[section]);
    setGenerating(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Protocol Document Editor</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-2 md:grid-cols-6">
            <TabsTrigger value="objectives">Objectives</TabsTrigger>
            <TabsTrigger value="design">Design</TabsTrigger>
            <TabsTrigger value="population">Population</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="statistics">Statistics</TabsTrigger>
            <TabsTrigger value="safety">Safety</TabsTrigger>
          </TabsList>

          {Object.keys(formData).map(section => (
            <TabsContent key={section} value={section} className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold capitalize">{section}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerate(section)}
                  disabled={generating}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Generating...' : 'Generate with AI'}
                </Button>
              </div>

              <Textarea
                value={formData[section]}
                onChange={e => handleChange(section, e.target.value)}
                placeholder={`Enter ${section} section content here or generate with AI...`}
                rows={10}
              />

              <div className="flex justify-end space-x-2">
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  Preview
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        {session && (
          <div className="mt-6 p-3 bg-blue-50 rounded-md">
            <p className="text-sm">
              <span className="font-medium">Important:</span> Changes made here will be reflected in
              the final protocol document.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Session: {session.name} | Last updated: {session.lastUpdated}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
