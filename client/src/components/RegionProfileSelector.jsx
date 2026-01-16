import React, { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Globe } from 'lucide-react'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';

const regionFlags = {
  fda: '🇺🇸',
  ema: '🇪🇺',
  pmda: '🇯🇵',
  hc: '🇨🇦',
};

/**
 * Region Profile Selector Component
 *
 * Provides a dropdown selector for different regulatory authority profiles
 * (FDA, EMA, PMDA, Health Canada) for eCTD submissions.
 */
export default function RegionProfileSelector({
  selectedProfile,
  onProfileSelect,
  className = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch available profiles
  useEffect(() => {
    fetch('/api/ind/profiles')
      .then(res => res.json())
      .then(data => {
        if (data.profiles) {
          setProfiles(data.profiles);

          // Set default profile if none selected
          if (!selectedProfile && data.profiles.length > 0) {
            const fdaProfile = data.profiles.find(p => p.code === 'fda') || data.profiles[0];
            onProfileSelect(fdaProfile);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load region profiles:', err);
        setLoading(false);

        // Fallback to static profiles if API fails
        const fallbackProfiles = [
          { id: 1, code: 'fda', name: 'US FDA', dtd_version: '3.2.2' },
          { id: 2, code: 'ema', name: 'EU EMA', dtd_version: '3.0' },
          { id: 3, code: 'pmda', name: 'Japan PMDA', dtd_version: '3.2.2' },
          { id: 4, code: 'hc', name: 'Health Canada', dtd_version: '3.2.2' },
        ];
        setProfiles(fallbackProfiles);

        // Set default profile if none selected
        if (!selectedProfile) {
          onProfileSelect(fallbackProfiles[0]);
        }
      });
  }, []);

  const handleSelectProfile = profile => {
    onProfileSelect(profile);
    setOpen(false);
  };

  return (
    <div className={cn('flex flex-col space-y-1.5', className)}>
      <label className="text-sm font-medium leading-none text-gray-700 dark:text-gray-300 flex items-center">
        <Globe className="h-3.5 w-3.5 mr-1.5 opacity-70" />
        Regulatory Region
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || loading}
            className={cn('justify-between', !selectedProfile && 'text-muted-foreground')}
          >
            {selectedProfile ? (
              <span className="flex items-center">
                <span className="mr-2">{regionFlags[selectedProfile.code] || '🌐'}</span>
                {selectedProfile.name}
                <Badge variant="outline" className="ml-2 text-xs">
                  v{selectedProfile.dtd_version}
                </Badge>
              </span>
            ) : loading ? (
              'Loading profiles...'
            ) : (
              'Select region...'
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[250px]">
          <Command>
            <CommandInput placeholder="Search regions..." />
            <CommandEmpty>No region found.</CommandEmpty>
            <CommandGroup>
              {profiles.map(profile => (
                <CommandItem
                  key={profile.id}
                  value={profile.code}
                  onSelect={() => handleSelectProfile(profile)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedProfile?.id === profile.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="mr-2">{regionFlags[profile.code] || '🌐'}</span>
                  {profile.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
