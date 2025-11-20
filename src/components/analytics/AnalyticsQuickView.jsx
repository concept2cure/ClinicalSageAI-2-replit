/**
 * Analytics Quick View Component
 *
 * This component provides a compact card with summary analytics information
 * and key performance indicators for regulatory submissions.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
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
import { Progress } from '@/components/ui/progress';
import { ArrowRight, BarChart3, ChevronUp, Clock, FileCheck, TrendingUp } from 'lucide-react';

/**
 * Analytics Quick View Component
 *
 * @param {Object} props Component props
 * @param {string} props.userId Current user ID
 * @param {string} props.orgId Current organization ID
 */
const AnalyticsQuickView = ({ userId, orgId }) => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch analytics data from API
  useEffect(() => {
    const init = async () => {
      try {
        const response = await fetch('/api/analytics/metrics');
        const data = await response.json();

        // Transform API data into the expected format
        setAnalyticsData({
          submissions: {
            last90Days: data.data.submissionsLast90Days || 0,
            previousPeriod: 8,
            percentChange: 50,
          },
          reviewTime: {
            average: data.data.avgReviewTimeDays || 0,
            previousPeriod: 41,
            percentChange: -17,
          },
          successRate: {
            current: 92,
            previousPeriod: 88,
            percentChange: 4.5,
          },
          riskLevel:
            data.data.delayRiskPercent > 50
              ? 'high'
              : data.data.delayRiskPercent > 25
                ? 'medium'
                : 'low',
        });

        setIsLoading(false);
      } catch (error) {
        console.error('Error loading analytics:', error);
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Helper to format percent change
  const formatPercentChange = value => {
    const isPositive = value > 0;
    return {
      text: `${isPositive ? '+' : ''}${value}%`,
      isPositive: isPositive,
      isNegative: value < 0,
    };
  };

  // Helper to get risk level
  const getRiskLevel = level => {
    switch (level) {
      case 'low':
        return { label: 'Low Risk', color: 'bg-green-500', value: 20 };
      case 'medium':
        return { label: 'Medium Risk', color: 'bg-amber-500', value: 50 };
      case 'high':
        return { label: 'High Risk', color: 'bg-red-500', value: 90 };
      default:
        return { label: 'Unknown', color: 'bg-gray-500', value: 0 };
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="bg-white p-4 rounded-lg shadow-md">
        <h2 className="text-lg font-semibold mb-2">Analytics Overview</h2>
        <p>Loading metrics...</p>
      </div>
    );
  }

  const submissionChange = formatPercentChange(analyticsData.submissions.percentChange);
  const reviewTimeChange = formatPercentChange(analyticsData.reviewTime.percentChange);
  const successRateChange = formatPercentChange(analyticsData.successRate.percentChange);
  const riskLevel = getRiskLevel(analyticsData.riskLevel);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center">
          <BarChart3 className="h-5 w-5 mr-2" />
          Analytics Quick View
        </CardTitle>
        <CardDescription>Key performance indicators</CardDescription>
      </CardHeader>

      <CardContent className="pb-2 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground flex items-center">
                <FileCheck className="h-3.5 w-3.5 mr-1" />
                Submissions (90d)
              </p>
              <span
                className={`text-xs ${submissionChange.isPositive ? 'text-green-600' : submissionChange.isNegative ? 'text-red-600' : ''}`}
              >
                {submissionChange.text}
              </span>
            </div>
            <p className="text-lg font-semibold">{analyticsData.submissions.last90Days}</p>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <p className="text-xs text-muted-foreground flex items-center">
                <Clock className="h-3.5 w-3.5 mr-1" />
                Avg. Review
              </p>
              <span
                className={`text-xs ${!reviewTimeChange.isPositive ? 'text-green-600' : reviewTimeChange.isNegative ? 'text-red-600' : ''}`}
              >
                {reviewTimeChange.text}
              </span>
            </div>
            <p className="text-lg font-semibold">{analyticsData.reviewTime.average} days</p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground flex items-center">
              <TrendingUp className="h-3.5 w-3.5 mr-1" />
              Success Rate
            </p>
            <span
              className={`text-xs ${successRateChange.isPositive ? 'text-green-600' : successRateChange.isNegative ? 'text-red-600' : ''}`}
            >
              {successRateChange.text}
            </span>
          </div>
          <p className="text-lg font-semibold">{analyticsData.successRate.current}%</p>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Risk Level</p>
            <Badge
              variant={
                analyticsData.riskLevel === 'low'
                  ? 'success'
                  : analyticsData.riskLevel === 'medium'
                    ? 'warning'
                    : 'destructive'
              }
            >
              {riskLevel.label}
            </Badge>
          </div>
          <Progress value={riskLevel.value} className={`h-2 ${riskLevel.color}`} />
        </div>
      </CardContent>

      <CardFooter className="pt-2">
        <Button asChild variant="ghost" className="w-full" size="sm">
          <Link to="/analytics">
            View Full Analytics
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AnalyticsQuickView;
