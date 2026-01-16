import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText } from 'lucide-react'

const CMCInputForm = ({ drugName, setDrugName, isGenerating, onGenerate }) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Generate CMC Blueprint
        </CardTitle>
        <CardDescription>
          Enter your drug name or compound identifier to generate a comprehensive CMC documentation
          blueprint
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="drugName">Drug Name or Code</Label>
          <Input
            id="drugName"
            type="text"
            placeholder="e.g., Aspirin, ASA-001, or compound identifier"
            value={drugName}
            onChange={e => setDrugName(e.target.value)}
            onKeyPress={e => {
              if (e.key === 'Enter' && !isGenerating) {
                onGenerate();
              }
            }}
            disabled={isGenerating}
            className="w-full"
          />
        </div>

        <Button
          onClick={onGenerate}
          disabled={isGenerating || !drugName.trim()}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Blueprint...
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Generate CMC Blueprint
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

export default CMCInputForm;
