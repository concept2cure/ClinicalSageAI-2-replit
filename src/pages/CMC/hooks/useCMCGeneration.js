import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export const useCMCGeneration = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const { toast } = useToast();

  const generateBlueprint = async drugName => {
    if (!drugName.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please enter a drug name or code.',
        variant: 'destructive',
      });
      return null;
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/cmc/generate-blueprint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ drugName: drugName.trim() }),
      });

      const result = await response.json();

      if (response.ok) {
        setLastResult(result);
        toast({
          title: 'Success',
          description: result.message,
        });
        return result;
      } else {
        throw new Error(result.error || 'Failed to generate CMC blueprint');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate CMC blueprint',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    isGenerating,
    lastResult,
    generateBlueprint,
    setLastResult,
  };
};
