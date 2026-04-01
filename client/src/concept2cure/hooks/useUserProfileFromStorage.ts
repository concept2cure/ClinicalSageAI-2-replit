/**
 * useUserProfileFromStorage — Extracted from ZenApp.tsx (Stage 10)
 *
 * Loads user profile from localStorage and keeps it in sync
 * via the 'storage' event (cross-tab updates).
 */
import { useState, useEffect } from 'react';
import type { UserProfile } from '../zen-app-constants';

export function useUserProfileFromStorage(): [
  UserProfile | null,
  React.Dispatch<React.SetStateAction<UserProfile | null>>
] {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const loadProfile = () => {
      try {
        const savedProfile = localStorage.getItem('concept2cure_user_profile');
        if (savedProfile) {
          setUserProfile(JSON.parse(savedProfile));
        }
      } catch (error) {
        console.warn('Unable to load user profile', error);
      }
    };

    loadProfile();

    const onStorage = (event: Event) => {
      const storageEvent = event as { key?: string };
      if (storageEvent.key === 'concept2cure_user_profile') {
        loadProfile();
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return [userProfile, setUserProfile];
}
