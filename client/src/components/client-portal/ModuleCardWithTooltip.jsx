
/**
 * Module Card with Tooltip Component
 * 
 * Enhanced module card that includes navigation tooltips and quick access links
 */

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, HelpCircle } from 'lucide-react'
import { useLocation } from 'wouter';
import INDWizardTooltip from '../ind-wizard/INDWizardTooltip';

const ModuleCardWithTooltip = ({ 
  module, 
  onModuleClick, 
  className = "",
  showTooltip = true 
}) => {
  const [, setLocation] = useLocation();

  const handleQuickStart = (e) => {
    e.stopPropagation();
    setLocation(module.path);
  };

  const handleTutorialAccess = (e) => {
    e.stopPropagation();
    setLocation(`/client-portal/tutorial?module=${module.id}`);
  };

  const renderModuleTooltip = () => {
    if (!showTooltip) return null;

    switch (module.id) {
      case 'ind':
        return <INDWizardTooltip className="absolute top-2 right-2" />;
      default:
        return (
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 p-1 h-auto w-auto hover:bg-blue-50"
            onClick={handleTutorialAccess}
          >
            <HelpCircle className="h-4 w-4 text-blue-600" />
          </Button>
        );
    }
  };

  return (
    <Card 
      className={`relative cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 ${className}`}
      onClick={() => onModuleClick(module)}
    >
      {renderModuleTooltip()}
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 pr-8">
            <CardTitle className="text-lg flex items-center space-x-2">
              <span className="text-2xl">{module.icon}</span>
              <span>{module.title}</span>
            </CardTitle>
            <CardDescription className="mt-1">
              {module.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="space-y-3">
          {/* Status Badge */}
          <div className="flex items-center space-x-2">
            <Badge 
              variant={module.status === 'active' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {module.status === 'active' ? 'Ready' : 'Coming Soon'}
            </Badge>
            {module.featured && (
              <Badge variant="outline" className="text-xs text-blue-600 border-blue-600">
                Featured
              </Badge>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex space-x-2">
            <Button 
              size="sm" 
              onClick={handleQuickStart}
              className="flex-1 text-xs"
              disabled={module.status !== 'active'}
            >
              Quick Start
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleTutorialAccess}
              className="text-xs"
            >
              Tutorial
            </Button>
          </div>

          {/* Key Features */}
          {module.features && module.features.length > 0 && (
            <div className="pt-2 border-t">
              <div className="text-xs font-medium text-gray-700 mb-1">Key Features</div>
              <ul className="space-y-0.5">
                {module.features.slice(0, 3).map((feature, idx) => (
                  <li key={idx} className="text-xs text-gray-600 flex items-start">
                    <span className="inline-block w-1 h-1 bg-gray-400 rounded-full mt-1.5 mr-2 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ModuleCardWithTooltip;
