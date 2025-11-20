// /client/components/TrialSuccessPredictor.jsx
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function TrialSuccessPredictor() {
  const [inputs, setInputs] = useState({
    phase: '2',
    indication: 'Diabetes',
    arms: '2',
    duration_weeks: '24',
    control: 'placebo',
    has_biomarker: false,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field, value) => {
    setInputs({ ...inputs, [field]: value });
  };

  const handleCheckbox = () => {
    setInputs({ ...inputs, has_biomarker: !inputs.has_biomarker });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/success-probability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase: parseInt(inputs.phase),
          indication: inputs.indication,
          arms: parseInt(inputs.arms),
          duration_weeks: parseFloat(inputs.duration_weeks),
          control: inputs.control,
          has_biomarker: inputs.has_biomarker,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        console.error('API error:', await res.text());
      }
    } catch (error) {
      console.error('Failed to predict trial success:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="space-y-4 p-6">
        <h3 className="text-lg font-semibold mb-4">Trial Success Probability</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phase">Phase</Label>
            <Select value={inputs.phase} onValueChange={value => handleChange('phase', value)}>
              <SelectTrigger id="phase">
                <SelectValue placeholder="Select Phase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Phase I</SelectItem>
                <SelectItem value="2">Phase II</SelectItem>
                <SelectItem value="3">Phase III</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="indication">Indication</Label>
            <Input
              id="indication"
              placeholder="e.g., Diabetes"
              value={inputs.indication}
              onChange={e => handleChange('indication', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="arms">Number of Arms</Label>
            <Input
              id="arms"
              type="number"
              min="1"
              value={inputs.arms}
              onChange={e => handleChange('arms', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duration (weeks)</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              value={inputs.duration_weeks}
              onChange={e => handleChange('duration_weeks', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="control">Control Type</Label>
            <Select value={inputs.control} onValueChange={value => handleChange('control', value)}>
              <SelectTrigger id="control">
                <SelectValue placeholder="Select Control Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="placebo">Placebo</SelectItem>
                <SelectItem value="active">Active Control</SelectItem>
                <SelectItem value="historical">Historical Control</SelectItem>
                <SelectItem value="open label">Open Label</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 pt-8">
            <input
              type="checkbox"
              id="biomarker"
              className="rounded border-gray-300"
              checked={inputs.has_biomarker}
              onChange={handleCheckbox}
            />
            <Label htmlFor="biomarker">Includes Biomarker</Label>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full mt-4">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Calculating...
            </>
          ) : (
            'Predict Success Probability'
          )}
        </Button>

        {result && (
          <div className="mt-4 p-4 border rounded-md bg-slate-50">
            <h4 className="text-base font-semibold">Success Likelihood</h4>
            <div className="flex items-end gap-2">
              <p className="text-2xl text-primary font-bold">{result.success_probability}%</p>
              <span className="text-sm text-muted-foreground pb-1">likelihood of success</span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  result.success_probability >= 75
                    ? 'bg-green-500'
                    : result.success_probability >= 55
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${result.success_probability}%` }}
              ></div>
            </div>
            <p className="text-sm mt-3 font-medium">{result.verdict}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
