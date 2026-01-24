import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

/**
 * Risk Heatmap Component
 *
 * Displays IND submission risks in a color-coded heatmap table
 * showing high, medium, and low risk areas.
 */
export default function RiskHeatmap() {
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Fetch risks data from API
    setLoading(true);
    fetch('/api/ind/risks')
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch risk data');
        }
        return response.json();
      })
      .then(data => {
        setRisks(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching risk data:', err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Helper to determine badge color based on risk level
  const getRiskBadge = level => {
    switch (level.toLowerCase()) {
      case 'high':
        return <Badge variant="destructive">High</Badge>;
      case 'med':
      case 'medium':
        return (
          <Badge variant="warning" className="bg-amber-500 hover:bg-amber-600">
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-200">
            Low
          </Badge>
        );
      default:
        return <Badge variant="secondary">{level}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>IND Risk Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>IND Risk Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded">
            Error loading risk data: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>IND Submission Risk Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        {risks.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            No risks detected. Either your submission is complete or analysis is pending.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead className="w-[60%]">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {risks.map(risk => (
                <TableRow key={risk.id} className={risk.level === 'high' ? 'bg-red-50' : ''}>
                  <TableCell className="font-medium">{risk.code}</TableCell>
                  <TableCell>{getRiskBadge(risk.level)}</TableCell>
                  <TableCell>{risk.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
