import React from 'react';
import { Clock, ArrowRight, Video, FileText, GraduationCap, Globe, Sparkles, CheckCircle2, Award, Zap, Bookmark, Star } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Recommendation Card Component
 *
 * Displays a learning recommendation with adaptive personalization based on
 * user's learning profile and behavior. Can show modules, courses, or resources.
 */
const RecommendationCard = ({ recommendation, onSelect, onBookmark, showReason = true }) => {
  // Helper to get content type icon
  const getContentTypeIcon = () => {
    switch (recommendation.type) {
      case 'course':
        return <GraduationCap className="h-5 w-5 text-blue-600" />;
      case 'tutorial':
        return <Video className="h-5 w-5 text-purple-600" />;
      case 'guide':
        return <FileText className="h-5 w-5 text-green-600" />;
      case 'webinar':
        return <Globe className="h-5 w-5 text-pink-600" />;
      case 'template':
        return <FileText className="h-5 w-5 text-amber-600" />;
      default:
        return <FileText className="h-5 w-5 text-blue-600" />;
    }
  };

  // Helper to get priority badge
  const getPriorityBadge = () => {
    switch (recommendation.priority) {
      case 'high':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <Zap className="h-3 w-3 mr-1" />
            High Priority
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Medium Priority
          </Badge>
        );
      case 'low':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            Low Priority
          </Badge>
        );
      default:
        return null;
    }
  };

  // Confidence level visualization
  const getConfidenceLevel = () => {
    const confidence = recommendation.confidence || 0;
    const confidencePercentage = Math.round(confidence * 100);

    return (
      <div className="flex items-center mt-2">
        <div className="flex-1 mr-2">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                confidencePercentage >= 90
                  ? 'bg-green-500'
                  : confidencePercentage >= 70
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
              }`}
              style={{ width: `${confidencePercentage}%` }}
            ></div>
          </div>
        </div>
        <span className="text-xs text-gray-500">{confidencePercentage}% Match</span>
      </div>
    );
  };

  return (
    <Card className="h-full flex flex-col hover:shadow-md transition-shadow overflow-hidden">
      {/* Priority indicator - colored top border based on priority */}
      <div
        className={`h-1 w-full ${
          recommendation.priority === 'high'
            ? 'bg-red-500'
            : recommendation.priority === 'medium'
              ? 'bg-amber-500'
              : 'bg-green-500'
        }`}
      ></div>

      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center mr-2">
              {getContentTypeIcon()}
            </div>
            <Badge variant="outline">{recommendation.type}</Badge>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={e => {
              e.stopPropagation();
              if (onBookmark) onBookmark(recommendation.id);
            }}
          >
            <Bookmark className="h-4 w-4" />
          </Button>
        </div>

        <CardTitle className="text-lg mt-2">{recommendation.title}</CardTitle>

        <CardDescription>
          {recommendation.description || 'No description available'}
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-2 flex-grow">
        {showReason && recommendation.reason && (
          <div className="rounded-md bg-blue-50 border border-blue-100 p-3 mb-3">
            <div className="flex items-start">
              <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 mr-2" />
              <p className="text-sm text-blue-800">{recommendation.reason}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-gray-500 mt-2">
          <div className="flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            <span>{recommendation.estimatedTime || '--'} min</span>
          </div>

          {recommendation.completeCount && (
            <div className="flex items-center">
              <CheckCircle2 className="h-4 w-4 mr-1" />
              <span>{recommendation.completeCount} completed</span>
            </div>
          )}

          {recommendation.rating && (
            <div className="flex items-center">
              <Star className="h-4 w-4 mr-1 text-amber-500" />
              <span>{recommendation.rating}/5</span>
            </div>
          )}
        </div>

        {getConfidenceLevel()}
      </CardContent>

      <CardFooter className="pt-0">
        <div className="flex justify-between items-center w-full">
          {getPriorityBadge()}

          <Button
            variant="ghost"
            className="p-0"
            onClick={() => onSelect && onSelect(recommendation.id)}
          >
            View Content
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default RecommendationCard;
