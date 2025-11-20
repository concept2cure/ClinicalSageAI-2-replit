import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

export default function SuccessProbabilityEstimator() {
  const [phase, setPhase] = useState(2);
  const [indication, setIndication] = useState('Diabetes');
  const [arms, setArms] = useState(2);
  const [durationWeeks, setDurationWeeks] = useState(24);
  const [control, setControl] = useState('placebo');
  const [hasBiomarker, setHasBiomarker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async e => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/analytics/success-probability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phase,
          indication,
          arms: parseInt(arms),
          duration_weeks: parseFloat(durationWeeks),
          control,
          has_biomarker: hasBiomarker,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Failed to estimate success probability:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Trial Success Probability Estimator</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phase">Trial Phase</Label>
              <Select value={phase} onValueChange={value => setPhase(parseInt(value))}>
                <SelectTrigger id="phase" className="w-full">
                  <SelectValue placeholder="Select phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Phase I</SelectItem>
                  <SelectItem value="2">Phase II</SelectItem>
                  <SelectItem value="3">Phase III</SelectItem>
                  <SelectItem value="4">Phase IV</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="indication">Indication</Label>
              <Input
                id="indication"
                placeholder="e.g., Diabetes"
                value={indication}
                onChange={e => setIndication(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="arms">Number of Arms</Label>
              <Input
                id="arms"
                type="number"
                min="1"
                max="10"
                value={arms}
                onChange={e => setArms(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (weeks)</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                max="520"
                value={durationWeeks}
                onChange={e => setDurationWeeks(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="control">Control Type</Label>
              <Select value={control} onValueChange={setControl}>
                <SelectTrigger id="control" className="w-full">
                  <SelectValue placeholder="Select control type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placebo">Placebo</SelectItem>
                  <SelectItem value="active">Active Control</SelectItem>
                  <SelectItem value="historical">Historical Control</SelectItem>
                  <SelectItem value="open label">Open Label</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-4">
              <Checkbox id="biomarker" checked={hasBiomarker} onCheckedChange={setHasBiomarker} />
              <Label htmlFor="biomarker">Includes Biomarker</Label>
            </div>
          </div>

          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Calculating...
              </>
            ) : (
              'Calculate Success Probability'
            )}
          </Button>
        </form>

        {result && (
          <div className="mt-6 p-4 border rounded-md bg-gray-50">
            <h3 className="text-lg font-semibold mb-2">Trial Success Probability</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">
                    {result.success_probability}% probability
                  </span>
                  <span className="text-sm font-medium">
                    {result.success_probability < 40
                      ? 'Low'
                      : result.success_probability < 70
                        ? 'Moderate'
                        : 'High'}
                  </span>
                </div>
                <Progress value={result.success_probability} className="h-2" />
              </div>
              <p className="text-sm text-gray-700">{result.verdict}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
