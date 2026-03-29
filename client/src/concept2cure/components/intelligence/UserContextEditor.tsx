import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/concept2cure/hooks/queryKeys';

// ── Types ────────────────────────────────────────────────────────────────────

interface UserContextEditorProps {
  onClose?: () => void;
}

interface UserProfileForm {
  role: string;
  expertise: string[];
  responseStyle: 'brief' | 'detailed' | 'technical' | 'executive-summary';
  additionalContext: string;
}

interface UserProfileResponse {
  role?: string;
  expertise?: string[];
  responseStyle?: string;
  additionalContext?: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const EXPERTISE_OPTIONS = [
  'CMC',
  'Clinical',
  'Nonclinical',
  'Regulatory Strategy',
  'Biostatistics',
  'Medical Writing',
  'Quality',
  'Manufacturing',
  'Pharmacovigilance',
  'Labeling',
] as const;

const RESPONSE_STYLES = [
  { value: 'brief', label: 'Brief' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'technical', label: 'Technical' },
  { value: 'executive-summary', label: 'Executive Summary' },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function UserContextEditor({ onClose }: UserContextEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile, isLoading, error } = useQuery<UserProfileResponse>({
    queryKey: queryKeys.anaIntelligence.userContext,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/client-intelligence/ana/user-profile');
      const json = await res.json();
      return json?.profile ?? null;
    },
  });

  // Show error toast when query fails
  useEffect(() => {
    if (error) {
      toast({
        title: 'Failed to load preferences',
        description: (error as Error).message || 'Could not load your preferences. Please try again.',
        variant: 'destructive',
      });
    }
  }, [error, toast]);

  const { register, handleSubmit, setValue, watch, reset } = useForm<UserProfileForm>({
    defaultValues: {
      role: '',
      expertise: [],
      responseStyle: 'detailed',
      additionalContext: '',
    },
  });

  const selectedExpertise = watch('expertise');
  const selectedStyle = watch('responseStyle');

  // Sync form when profile loads
  useEffect(() => {
    if (profile) {
      reset({
        role: profile.role ?? '',
        expertise: profile.expertise ?? [],
        responseStyle: (profile.responseStyle as UserProfileForm['responseStyle']) ?? 'detailed',
        additionalContext: profile.additionalContext ?? '',
      });
    }
  }, [profile, reset]);

  const saveMutation = useMutation({
    mutationFn: async (data: UserProfileForm) => {
      const res = await apiRequest('POST', '/api/client-intelligence/ana/user-profile', data);
      const json = await res.json();
      return json?.profile ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anaIntelligence.userContext });
      toast({ title: 'Preferences saved', description: 'AnA will use these from now on.' });
      onClose?.();
    },
    onError: () => {
      toast({
        title: 'Failed to save',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const toggleExpertise = (tag: string) => {
    const current = selectedExpertise ?? [];
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    setValue('expertise', next, { shouldDirty: true });
  };

  const onSubmit = (data: UserProfileForm) => {
    saveMutation.mutate(data);
  };

  return (
    <Card className="w-full max-w-lg mx-auto" data-testid="user-context-editor">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-lg font-semibold">
          How should AnA work for you?
        </CardTitle>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close editor"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500" role="status" aria-label="Loading preferences">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent mr-2" />
            Loading your preferences...
          </div>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Role */}
          <div className="space-y-1.5">
            <label htmlFor="role" className="text-sm font-medium">
              Your Role
            </label>
            <Input
              id="role"
              placeholder="e.g. Regulatory Affairs Lead, CMC Scientist"
              disabled={isLoading}
              {...register('role')}
            />
          </div>

          {/* Expertise Tags */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Your Expertise</label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Expertise areas">
              {EXPERTISE_OPTIONS.map((tag) => {
                const isSelected = selectedExpertise?.includes(tag);
                return (
                  <Badge
                    key={tag}
                    variant={isSelected ? 'default' : 'outline'}
                    className="cursor-pointer select-none transition-colors"
                    onClick={() => toggleExpertise(tag)}
                    role="checkbox"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpertise(tag);
                      }
                    }}
                  >
                    {tag}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Response Style */}
          <div className="space-y-1.5">
            <label htmlFor="response-style" className="text-sm font-medium">
              How you like AnA to respond
            </label>
            <Select
              value={selectedStyle}
              onValueChange={(val) =>
                setValue('responseStyle', val as UserProfileForm['responseStyle'], {
                  shouldDirty: true,
                })
              }
              disabled={isLoading}
            >
              <SelectTrigger id="response-style">
                <SelectValue placeholder="Select a style" />
              </SelectTrigger>
              <SelectContent>
                {RESPONSE_STYLES.map((style) => (
                  <SelectItem key={style.value} value={style.value}>
                    {style.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Additional Context */}
          <div className="space-y-1.5">
            <label htmlFor="additional-context" className="text-sm font-medium">
              Anything else AnA should know?
              <span className="ml-1 text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="additional-context"
              placeholder="e.g. I primarily work on oncology programs targeting FDA and EMA submissions."
              rows={3}
              disabled={isLoading}
              {...register('additionalContext')}
            />
          </div>

          {/* Save */}
          <div className="flex justify-end gap-2 pt-2">
            {onClose && (
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={saveMutation.isPending || isLoading}>
              {saveMutation.isPending ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </form>
        )}
      </CardContent>
    </Card>
  );
}

export default UserContextEditor;
