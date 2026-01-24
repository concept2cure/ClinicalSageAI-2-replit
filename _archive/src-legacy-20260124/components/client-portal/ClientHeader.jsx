/**
 * Client Header Component
 *
 * This component displays a welcome header for the client portal,
 * showing organization details, client type, study count, and active submissions.
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Calendar, FileCheck, Users } from 'lucide-react';

/**
 * Client Header Component
 *
 * @param {Object} props Component props
 * @param {Object} props.organization Organization information
 * @param {Object} props.stats Organization statistics
 * @param {Object} props.user Current user information
 */
const ClientHeader = ({ organization, stats, user }) => {
  // Default values if no props are provided
  const orgData = organization || {
    name: 'NeuraTech Biomedical',
    type: 'biotech',
    plan: 'enterprise',
  };

  const statsData = stats || {
    studies: 3,
    activeSubmissions: 2,
    lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  };

  // Format the last login time
  const formatLastLogin = date => {
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      return `${diffDays} days ago`;
    }
  };

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">
              Welcome to TrialSage, {orgData.name}
            </h1>
            <p className="text-muted-foreground">
              Last login: {formatLastLogin(statsData.lastLogin)}
            </p>
          </div>

          <Badge
            variant={orgData.plan === 'enterprise' ? 'default' : 'secondary'}
            className="capitalize"
          >
            {orgData.plan} Plan
          </Badge>
        </div>

        <div className="grid grid-cols-3 mt-4 gap-4">
          <div className="flex items-center">
            <Building2 className="h-5 w-5 mr-2 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Client Type</p>
              <p className="font-medium capitalize">{orgData.type}</p>
            </div>
          </div>

          <div className="flex items-center">
            <Users className="h-5 w-5 mr-2 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Studies Managed</p>
              <p className="font-medium">{statsData.studies} Studies</p>
            </div>
          </div>

          <div className="flex items-center">
            <FileCheck className="h-5 w-5 mr-2 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Active Submissions</p>
              <p className="font-medium">{statsData.activeSubmissions}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientHeader;
