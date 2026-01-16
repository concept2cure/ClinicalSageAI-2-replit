import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, Brain, CheckCircle2, Award, Lightbulb, Bookmark } from 'lucide-react'

const SimpleLearningInterface = () => {
  const [activeTab, setActiveTab] = useState('insights');

  // Simulate insights data
  const insightsData = [
    {
      id: 1,
      title: 'Regulatory Change Detection',
      description:
        'FDA has published new guidance on adaptive trial designs which impacts your CSR recommendations.',
      relevance: 95,
      source: 'FDA Updates',
      tags: ['guidance', 'adaptive trials', 'CSR'],
    },
    {
      id: 2,
      title: 'Protocol Optimization',
      description:
        'Your last 3 trial designs show a pattern of excessive exclusion criteria, potentially limiting recruitment.',
      relevance: 88,
      source: 'Pattern Analysis',
      tags: ['protocol', 'recruitment', 'optimization'],
    },
    {
      id: 3,
      title: 'Submission Efficiency',
      description:
        'Using regional templates for PMDA submissions can save 30% preparation time compared to your current approach.',
      relevance: 82,
      source: 'Efficiency Analysis',
      tags: ['PMDA', 'templates', 'time-saving'],
    },
  ];

  // Simulate learning path data
  const learningPathData = [
    {
      id: 1,
      title: 'FDA Submission Mastery',
      description: 'Complete guide to FDA submissions with practical examples',
      modules: [
        { id: 101, name: 'FDA Basics', completed: true },
        { id: 102, name: 'eCTD Structure', completed: false },
        { id: 103, name: 'Common FDA Rejections', completed: false },
      ],
    },
    {
      id: 2,
      title: 'CER Excellence',
      description: 'Creating effective Clinical Evaluation Reports for medical devices',
      modules: [
        { id: 201, name: 'CER Fundamentals', completed: false },
        { id: 202, name: 'Literature Analysis', completed: false },
        { id: 203, name: 'Risk Assessment Integration', completed: false },
      ],
    },
  ];

  // Simulate recommended modules
  const recommendedModules = [
    {
      id: 301,
      title: 'Advanced eCTD Navigation',
      description: 'Master the complete eCTD structure for streamlined submissions',
      relevance: 94,
      estimated_time: '2 hours',
    },
    {
      id: 302,
      title: 'Multi-Regional Submission Strategy',
      description: 'Optimize submissions for FDA, EMA and PMDA simultaneously',
      relevance: 89,
      estimated_time: '3 hours',
    },
    {
      id: 303,
      title: 'CSR Writing Best Practices',
      description: 'Techniques for authoring clear, compliant CSRs',
      relevance: 85,
      estimated_time: '2.5 hours',
    },
  ];

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'insights':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {insightsData.map(insight => (
              <Card key={insight.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{insight.title}</CardTitle>
                    <div className="text-sm font-medium bg-primary/10 px-2 py-1 rounded-md text-primary">
                      {insight.relevance}% match
                    </div>
                  </div>
                  <CardDescription className="text-xs">Source: {insight.source}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4">{insight.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {insight.tags.map(tag => (
                      <span key={tag} className="bg-muted px-2 py-1 text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case 'learning-path':
        return (
          <div className="space-y-6">
            {learningPathData.map(path => (
              <Card key={path.id}>
                <CardHeader>
                  <CardTitle>{path.title}</CardTitle>
                  <CardDescription>{path.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {path.modules.map(module => (
                      <div
                        key={module.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          {module.completed ? (
                            <CheckCircle2 className="text-green-500 h-5 w-5" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border border-muted-foreground" />
                          )}
                          <span>{module.name}</span>
                        </div>
                        <Button size="sm" disabled={module.completed}>
                          {module.completed ? 'Completed' : 'Start'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      case 'recommended':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommendedModules.map(module => (
              <Card key={module.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{module.title}</CardTitle>
                    <div className="text-sm font-medium bg-primary/10 px-2 py-1 rounded-md text-primary">
                      {module.relevance}%
                    </div>
                  </div>
                  <CardDescription className="text-xs">
                    Estimated time: {module.estimated_time}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-4">{module.description}</p>
                  <Button className="w-full">Start Module</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      default:
        return <div>Select a tab to view content</div>;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Adaptive Learning Dashboard</h1>
        <p className="text-muted-foreground">
          Personalized AI-powered recommendations to enhance your regulatory expertise
        </p>
      </div>

      {/* Simple tab buttons instead of complex tab components */}
      <div className="flex border-b mb-6">
        <button
          className={`px-4 py-2 flex items-center gap-2 ${activeTab === 'insights' ? 'border-b-2 border-primary font-medium' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          <Lightbulb className="h-4 w-4" />
          AI Insights
        </button>
        <button
          className={`px-4 py-2 flex items-center gap-2 ${activeTab === 'learning-path' ? 'border-b-2 border-primary font-medium' : ''}`}
          onClick={() => setActiveTab('learning-path')}
        >
          <BookOpen className="h-4 w-4" />
          Learning Path
        </button>
        <button
          className={`px-4 py-2 flex items-center gap-2 ${activeTab === 'recommended' ? 'border-b-2 border-primary font-medium' : ''}`}
          onClick={() => setActiveTab('recommended')}
        >
          <Award className="h-4 w-4" />
          Recommended Modules
        </button>
      </div>

      {/* Render content based on active tab */}
      {renderTabContent()}
    </div>
  );
};

export default SimpleLearningInterface;
