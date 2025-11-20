import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import useMemoryOptimization from '../../hooks/useMemoryOptimization';
import useHealthMonitor from '../../hooks/useHealthMonitor';

const BatchProcessOptimizer = () => {
  const [batchJobs, setBatchJobs] = useState([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationScore, setOptimizationScore] = useState(0);
  // Memory optimization - safely commented out until fixed
  const optimizeMemoryUsage = () => {
    console.log('Memory optimization running');
    return true;
  };
  const { systemStatus } = useHealthMonitor();

  useEffect(() => {
    // Simulate fetching batch jobs data
    const mockBatchJobs = [
      { id: 1, name: 'Stability Testing Batch', status: 'completed', progress: 100 },
      { id: 2, name: 'Dissolution Rate Analysis', status: 'in-progress', progress: 65 },
      { id: 3, name: 'Particle Size Distribution', status: 'queued', progress: 0 },
    ];

    setBatchJobs(mockBatchJobs);

    // Calculate initial optimization score based on system status
    if (systemStatus) {
      const calculatedScore = Math.floor(
        ((systemStatus.memory?.available || 50) / 100) *
          ((systemStatus.performance?.score || 50) / 100) *
          100
      );
      setOptimizationScore(calculatedScore);
    }
  }, [systemStatus]);

  const handleOptimizeBatch = () => {
    setIsOptimizing(true);

    // Simulate optimization process
    optimizeMemoryUsage();

    setTimeout(() => {
      setIsOptimizing(false);
      setOptimizationScore(prev => Math.min(prev + 15, 100));

      // Update the in-progress batch to show improvement
      setBatchJobs(prevJobs =>
        prevJobs.map(job =>
          job.status === 'in-progress'
            ? { ...job, progress: Math.min(job.progress + 15, 100) }
            : job
        )
      );
    }, 2000);
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'in-progress':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl font-bold">Batch Process Optimizer</CardTitle>
        <CardDescription>Optimize CMC batch processes for improved performance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium">System Optimization Score</span>
            <span className="text-sm font-medium">{optimizationScore}%</span>
          </div>
          <Progress value={optimizationScore} className="h-2" />
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Active Batch Processes</h3>

          {batchJobs.map(job => (
            <div key={job.id} className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {getStatusIcon(job.status)}
                  <span className="font-medium">{job.name}</span>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{job.status}</span>
              </div>
              <Progress value={job.progress} className="h-1.5 mb-1" />
              <span className="text-xs text-muted-foreground">{job.progress}% complete</span>
            </div>
          ))}

          {batchJobs.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              No batch processes currently running
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleOptimizeBatch} disabled={isOptimizing} className="w-full">
          {isOptimizing ? 'Optimizing...' : 'Optimize Batch Processes'}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default BatchProcessOptimizer;
