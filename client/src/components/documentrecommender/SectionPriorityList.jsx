import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, CheckCircle2, Clock, AlertTriangle, Info } from 'lucide-react'

/**
 * SectionPriorityList Component
 *
 * Displays a prioritized list of document sections with relevance indicators
 * and recommendations.
 */
const SectionPriorityList = ({ sections = [], recommendations = [], onSectionSelect }) => {
  // Get recommendation for a section
  const getRecommendation = sectionKey => {
    return recommendations.find(rec => rec.sectionKey === sectionKey) || {};
  };

  // Get priority badge color based on importance level
  const getPriorityColor = priorityLevel => {
    switch (priorityLevel) {
      case 'critical':
        return 'bg-destructive text-destructive-foreground';
      case 'high':
        return 'bg-amber-500 text-amber-50';
      case 'medium':
        return 'bg-yellow-500 text-yellow-50';
      case 'low':
        return 'bg-green-500 text-green-50';
      default:
        return 'bg-slate-500 text-slate-50';
    }
  };

  // Get icon based on importance level
  const getPriorityIcon = priorityLevel => {
    switch (priorityLevel) {
      case 'critical':
        return <AlertTriangle className="h-3 w-3" />;
      case 'high':
        return <Clock className="h-3 w-3" />;
      case 'medium':
        return <Info className="h-3 w-3" />;
      case 'low':
        return <CheckCircle2 className="h-3 w-3" />;
      default:
        return <Info className="h-3 w-3" />;
    }
  };

  // Handle section click
  const handleSectionClick = sectionKey => {
    if (onSectionSelect) {
      onSectionSelect(sectionKey);
    }
  };

  return (
    <ScrollArea className="h-[350px] rounded-md border">
      <div className="p-4">
        {sections.length > 0 ? (
          sections.map((sectionKey, index) => {
            const recommendation = getRecommendation(sectionKey);
            const priorityLevel = recommendation.priority || 'medium';

            return (
              <Card key={sectionKey} className="mb-3 hover:bg-accent/50 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <span className="text-sm font-medium mr-2">{index + 1}.</span>
                        <h4 className="text-sm font-medium">
                          {recommendation.sectionTitle || sectionKey}
                        </h4>
                        <Badge
                          variant="secondary"
                          className={`ml-2 text-xs ${getPriorityColor(priorityLevel)} flex items-center gap-1`}
                        >
                          {getPriorityIcon(priorityLevel)}
                          {priorityLevel}
                        </Badge>
                      </div>

                      {recommendation.rationale && (
                        <p className="text-xs mt-1 text-muted-foreground">
                          {recommendation.rationale}
                        </p>
                      )}

                      {recommendation.keyPoints && recommendation.keyPoints.length > 0 && (
                        <ul className="text-xs mt-2 space-y-1">
                          {recommendation.keyPoints.slice(0, 2).map((point, i) => (
                            <li key={i} className="flex items-start">
                              <span className="mr-1">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                          {recommendation.keyPoints.length > 2 && (
                            <li className="text-xs text-muted-foreground">
                              +{recommendation.keyPoints.length - 2} more points
                            </li>
                          )}
                        </ul>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 h-8 mt-1"
                      onClick={() => handleSectionClick(sectionKey)}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No section recommendations available</p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
};

export default SectionPriorityList;
